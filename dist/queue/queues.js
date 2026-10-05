import { Queue } from 'bullmq';
import { singleProcess } from '../config/env.js';
import { logger } from '../config/logger.js';
import { createRedis } from '../config/redis.js';
import { withTimeout } from '../shared/utils/timeout.js';
import { CONTROL_JOB_OPTIONS, QUEUES, QUEUE_PREFIX, SEND_JOB_OPTIONS, WEBHOOK_JOB_OPTIONS } from './queue.config.js';
// Created lazily so importing this module doesn't open Redis connections (tests, scripts).
const queues = new Map();
const connections = []; // BullMQ doesn't close connections it was given
function queue(name, defaultJobOptions) {
    let q = queues.get(name);
    if (!q) {
        const connection = createRedis();
        connections.push(connection);
        q = new Queue(name, { connection: connection, prefix: QUEUE_PREFIX, defaultJobOptions });
        queues.set(name, q);
    }
    return q;
}
// ioredis queues commands while Redis is down; never let an API request hang on that.
const bounded = (p) => withTimeout(p, 5_000);
export const sendQueue = () => queue(QUEUES.SEND, SEND_JOB_OPTIONS);
export const webhookQueue = () => queue(QUEUES.WEBHOOKS, WEBHOOK_JOB_OPTIONS);
export const instanceControlQueue = () => queue(QUEUES.INSTANCE_CONTROL, CONTROL_JOB_OPTIONS);
// RUN_MODE=single: the rows in SQL Server are the queue (queue/workers/sqlPollers.ts), so
// enqueueing is a no-op and instance actions go straight to the in-process worker.
let localInstanceControl;
export const setLocalInstanceControl = (fn) => {
    localInstanceControl = fn;
};
/**
 * Invariant: one job id per message (send_<id>). Adding is then idempotent, and BullMQ's job
 * lock guarantees a message is never processed by two workers at once. A manual retry first
 * removes the finished job (kept in the completed/failed set) so the id can be reused.
 */
export async function enqueueSend(messageId, opts = {}) {
    if (singleProcess)
        return;
    const jobId = `send_${messageId}`;
    if (opts.manualRetry)
        await bounded(sendQueue().getJob(jobId).then((job) => job?.remove()));
    return bounded(sendQueue().add('send', { messageId }, { jobId }));
}
export const enqueueProviderEvent = async (eventId) => singleProcess ? undefined : bounded(webhookQueue().add('provider-event', { kind: 'provider-event', eventId }, { jobId: `event_${eventId}` }));
export const enqueueWebhookDelivery = async (deliveryId, opts = {}) => singleProcess ? undefined : bounded(webhookQueue().add('deliver', { kind: 'deliver', deliveryId }, { jobId: opts.redeliver ? `redeliver_${deliveryId}_${Date.now()}` : `deliver_${deliveryId}` }));
export async function enqueueInstanceAction(instanceId, action) {
    if (!singleProcess)
        return bounded(instanceControlQueue().add(action, { instanceId, action }));
    // Fire and forget, like a queued job: connecting/validating can take a while.
    localInstanceControl?.(instanceId, action).catch((err) => logger.error({ err, instanceId, action }, 'Instance action failed'));
}
export async function closeQueues() {
    await Promise.allSettled([...queues.values()].map((q) => q.close()));
    await Promise.allSettled(connections.map((c) => c.quit()));
    queues.clear();
    connections.length = 0;
}
//# sourceMappingURL=queues.js.map