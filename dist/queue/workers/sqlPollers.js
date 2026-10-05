// RUN_MODE=single: SQL Server is the queue (no Redis). Each poller atomically claims due rows
// with a lease (next_attempt_at in the future), so a row is never processed twice at once, even
// if two processes run by mistake; if the process dies, the lease expires and the row is retried.
// ponytail: polling every 1-2 s; fine for company-scale traffic, move to RUN_MODE=split (BullMQ) for high volume.
import { query, sql } from '../../config/database.js';
import { env } from '../../config/env.js';
import { deliverWebhook } from '../../modules/webhooks/application/projectWebhooks.js';
import { processProviderEvent } from '../../modules/webhooks/application/providerWebhooks.js';
const SEND_LEASE_SECONDS = 300; // longer than any single send (BAILEYS_SEND_TIMEOUT_MS + media download)
function loop(name, everyMs, tick, log) {
    let stopped = false;
    let timer;
    let running = Promise.resolve();
    const run = () => {
        running = tick().then((busy) => {
            if (!stopped)
                timer = setTimeout(run, busy ? 0 : everyMs); // drain backlogs without waiting
        }, (err) => {
            log.error({ err, poller: name }, 'Poller failed');
            if (!stopped)
                timer = setTimeout(run, everyMs);
        });
    };
    timer = setTimeout(run, everyMs);
    return {
        async close() {
            stopped = true;
            clearTimeout(timer);
            await running; // let in-flight work finish
        },
    };
}
/** Messages: CREATED/QUEUED rows due now, plus PROCESSING/SENDING rows whose lease expired (crash). */
export function pollMessages(send, log) {
    return loop('messages', 1_000, async () => {
        const due = await query(`UPDATE TOP (@n) dbo.messages WITH (UPDLOCK, READPAST, ROWLOCK)
         SET next_attempt_at = DATEADD(SECOND, @lease, SYSUTCDATETIME())
         OUTPUT INSERTED.id, INSERTED.retry_count
         WHERE status IN ('CREATED', 'QUEUED', 'PROCESSING', 'SENDING')
           AND (next_attempt_at IS NULL OR next_attempt_at <= SYSUTCDATETIME())`, { n: [sql.Int, env.WORKER_CONCURRENCY], lease: [sql.Int, SEND_LEASE_SECONDS] });
        await Promise.all(due.map(async ({ id, retryCount }) => {
            try {
                const outcome = await send(id, retryCount + 1 >= env.SEND_MAX_ATTEMPTS);
                if (outcome !== 'RETRY')
                    return;
                await query(`UPDATE dbo.messages SET retry_count = retry_count + 1,
                 next_attempt_at = DATEADD(SECOND, @delay, SYSUTCDATETIME())
               WHERE id = @id`, { id: [sql.UniqueIdentifier, id], delay: [sql.Int, 10 * 2 ** retryCount] });
            }
            catch (err) {
                log.error({ err, messageId: id }, 'Message processing failed; retried when the lease expires');
            }
        }));
        return due.length === env.WORKER_CONCURRENCY;
    }, log);
}
/** Project webhook deliveries and inbound provider events. */
export function pollWebhooks(log) {
    const deliveries = loop('webhook-deliveries', 2_000, async () => {
        const due = await query(`UPDATE TOP (5) dbo.webhook_deliveries WITH (UPDLOCK, READPAST, ROWLOCK)
         SET next_attempt_at = DATEADD(SECOND, 60, SYSUTCDATETIME())
         OUTPUT INSERTED.id, INSERTED.attempts
         WHERE status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= SYSUTCDATETIME())`);
        await Promise.all(due.map(async ({ id, attempts }) => {
            try {
                await deliverWebhook(id, attempts + 1 >= env.WEBHOOK_MAX_ATTEMPTS);
            }
            catch {
                await query('UPDATE dbo.webhook_deliveries SET next_attempt_at = DATEADD(SECOND, @delay, SYSUTCDATETIME()) WHERE id = @id', {
                    id: [sql.UniqueIdentifier, id],
                    delay: [sql.Int, 15 * 2 ** attempts], // 15s, 30s, 60s...
                });
            }
        }));
        return due.length === 5;
    }, log);
    const events = loop('provider-events', 2_000, async () => {
        const due = await query(`UPDATE TOP (10) dbo.webhook_events WITH (UPDLOCK, READPAST, ROWLOCK)
         SET next_attempt_at = DATEADD(SECOND, 60, SYSUTCDATETIME()) -- a failed event is retried after 60 s
         OUTPUT INSERTED.id
         WHERE processed = 0 AND created_at > DATEADD(DAY, -2, SYSUTCDATETIME())
           AND (next_attempt_at IS NULL OR next_attempt_at <= SYSUTCDATETIME())`);
        for (const { id } of due) {
            await processProviderEvent(id).catch((err) => log.warn({ err, eventId: id }, 'Provider event failed'));
        }
        return due.length === 10;
    }, log);
    return { close: () => Promise.all([deliveries.close(), events.close()]) };
}
//# sourceMappingURL=sqlPollers.js.map