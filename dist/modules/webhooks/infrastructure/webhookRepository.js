import { isDuplicateKey, query, queryOne, sql } from '../../../config/database.js';
// --- inbound provider events -----------------------------------------------------------------------
/** Returns the new event id, or null if the provider already delivered this event. */
export async function insertWebhookEvent(provider, e) {
    try {
        const row = await queryOne(`INSERT INTO dbo.webhook_events (provider, event_type, external_event_id, payload) OUTPUT INSERTED.id
       VALUES (@provider, @type, @extId, @payload)`, {
            provider: [sql.VarChar(20), provider],
            type: [sql.VarChar(50), e.eventType],
            extId: [sql.VarChar(300), e.externalEventId?.slice(0, 300) ?? null],
            payload: [sql.NVarChar(sql.MAX), JSON.stringify(e.payload)],
        });
        return row.id;
    }
    catch (err) {
        if (isDuplicateKey(err))
            return null;
        throw err;
    }
}
export async function getWebhookEvent(id) {
    const row = await queryOne('SELECT id, provider, event_type, payload, processed FROM dbo.webhook_events WHERE id = @id', { id: [sql.UniqueIdentifier, id] });
    return row && { ...row, payload: JSON.parse(row.payload) };
}
export const markWebhookEvent = (id, error) => query(`UPDATE dbo.webhook_events
     SET processed = CASE WHEN @error IS NULL THEN 1 ELSE 0 END,
         processed_at = CASE WHEN @error IS NULL THEN SYSUTCDATETIME() ELSE NULL END,
         error = @error
     WHERE id = @id`, { id: [sql.UniqueIdentifier, id], error: [sql.NVarChar(1000), error?.slice(0, 1000) ?? null] });
export const findUnprocessedEvents = () => query(`SELECT TOP (500) id FROM dbo.webhook_events
     WHERE processed = 0 AND created_at < DATEADD(MINUTE, -1, SYSUTCDATETIME())
       AND created_at > DATEADD(DAY, -2, SYSUTCDATETIME())
     ORDER BY created_at`);
export async function listWebhookEvents(f) {
    const whereSql = f.provider ? 'WHERE provider = @provider' : '';
    const params = {
        provider: [sql.VarChar(20), f.provider ?? null],
        skip: [sql.Int, (f.page - 1) * f.pageSize],
        take: [sql.Int, f.pageSize],
    };
    const items = await query(`SELECT id, provider, event_type, external_event_id, payload, processed, processed_at, error, created_at
     FROM dbo.webhook_events ${whereSql}
     ORDER BY created_at DESC OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`, { ...params });
    const [{ total }] = await query(`SELECT COUNT_BIG(*) AS total FROM dbo.webhook_events ${whereSql}`, { ...params });
    return { items: items.map((i) => ({ ...i, payload: JSON.parse(i.payload) })), total: Number(total), page: f.page, pageSize: f.pageSize };
}
// --- outbound project deliveries -------------------------------------------------------------------
export async function insertDelivery(d) {
    const row = await queryOne(`INSERT INTO dbo.webhook_deliveries (project_id, event_type, payload, target_url) OUTPUT INSERTED.id
     VALUES (@projectId, @type, @payload, @url)`, {
        projectId: [sql.UniqueIdentifier, d.projectId],
        type: [sql.VarChar(50), d.eventType],
        payload: [sql.NVarChar(sql.MAX), JSON.stringify(d.payload)],
        url: [sql.NVarChar(2048), d.targetUrl],
    });
    return row.id;
}
export const getDeliveryForSend = (id) => queryOne(`SELECT d.id, d.event_type, d.payload, d.target_url, d.status, p.webhook_secret_enc
     FROM dbo.webhook_deliveries d JOIN dbo.projects p ON p.id = d.project_id
     WHERE d.id = @id`, { id: [sql.UniqueIdentifier, id] });
export const recordDeliveryAttempt = (id, status, failure) => query(`UPDATE dbo.webhook_deliveries SET
       attempts = attempts + 1,
       last_attempt_at = SYSUTCDATETIME(),
       status = @status,
       delivered_at = CASE WHEN @status = 'DELIVERED' THEN SYSUTCDATETIME() ELSE delivered_at END,
       failure_reason = @failure
     WHERE id = @id`, { id: [sql.UniqueIdentifier, id], status: [sql.VarChar(20), status], failure: [sql.NVarChar(1000), failure?.slice(0, 1000) ?? null] });
export const resetDelivery = (id) => query("UPDATE dbo.webhook_deliveries SET status = 'PENDING', failure_reason = NULL, next_attempt_at = NULL WHERE id = @id", {
    id: [sql.UniqueIdentifier, id],
});
export async function listDeliveries(f) {
    const where = [f.projectId && 'd.project_id = @projectId', f.status && 'd.status = @status'].filter(Boolean);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const params = {
        projectId: [sql.UniqueIdentifier, f.projectId ?? null],
        status: [sql.VarChar(20), f.status ?? null],
        skip: [sql.Int, (f.page - 1) * f.pageSize],
        take: [sql.Int, f.pageSize],
    };
    const items = await query(`SELECT d.id, d.project_id, p.name AS project_name, d.event_type, d.payload, d.target_url, d.status, d.attempts,
            d.last_attempt_at, d.delivered_at, d.failure_reason, d.created_at
     FROM dbo.webhook_deliveries d JOIN dbo.projects p ON p.id = d.project_id
     ${whereSql}
     ORDER BY d.created_at DESC OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`, { ...params });
    const [{ total }] = await query(`SELECT COUNT_BIG(*) AS total FROM dbo.webhook_deliveries d ${whereSql}`, { ...params });
    return { items: items.map((i) => ({ ...i, payload: JSON.parse(i.payload) })), total: Number(total), page: f.page, pageSize: f.pageSize };
}
//# sourceMappingURL=webhookRepository.js.map