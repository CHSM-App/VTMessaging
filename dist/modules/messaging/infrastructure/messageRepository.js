import { query, queryOne, sql } from '../../../config/database.js';
export async function insertMessage(m) {
    const row = await queryOne(`INSERT INTO dbo.messages (project_id, recipient, message_type, content, template_id, idempotency_key)
     OUTPUT INSERTED.id
     VALUES (@projectId, @recipient, @type, @content, @templateId, @key)`, {
        projectId: [sql.UniqueIdentifier, m.projectId],
        recipient: [sql.VarChar(20), m.recipient],
        type: [sql.VarChar(20), m.messageType],
        content: [sql.NVarChar(sql.MAX), JSON.stringify(m.content)],
        templateId: [sql.UniqueIdentifier, m.templateId],
        key: [sql.NVarChar(200), m.idempotencyKey],
    });
    return row.id;
}
export const findByIdempotencyKey = (projectId, key) => queryOne('SELECT id, status FROM dbo.messages WHERE project_id = @projectId AND idempotency_key = @key', { projectId: [sql.UniqueIdentifier, projectId], key: [sql.NVarChar(200), key] });
/** CREATED -> QUEUED only; never overwrites progress the worker already made. */
export const markQueued = (id) => query(`UPDATE dbo.messages SET status = 'QUEUED', queued_at = COALESCE(queued_at, SYSUTCDATETIME()), updated_at = SYSUTCDATETIME()
     WHERE id = @id AND status = 'CREATED'`, { id: [sql.UniqueIdentifier, id] });
export async function loadMessage(id) {
    const row = await queryOne('SELECT id, project_id, recipient, message_type, content, template_id, status FROM dbo.messages WHERE id = @id', { id: [sql.UniqueIdentifier, id] });
    return row && { ...row, content: JSON.parse(row.content) };
}
// Timestamp columns filled (once) when a status is reached.
const STATUS_TIMESTAMPS = {
    QUEUED: ['queued_at'],
    PROCESSING: ['processing_at'],
    SENT: ['sent_at'],
    DELIVERED: ['sent_at', 'delivered_at'],
    READ: ['sent_at', 'delivered_at', 'read_at'],
    FAILED: ['failed_at'],
};
export async function transition(id, status, f = {}) {
    const sets = ['status = @status', 'updated_at = SYSUTCDATETIME()'];
    for (const col of STATUS_TIMESTAMPS[status] ?? [])
        sets.push(`${col} = COALESCE(${col}, SYSUTCDATETIME())`);
    if (f.instanceId !== undefined)
        sets.push('instance_id = @instanceId');
    if (f.providerMessageId !== undefined)
        sets.push('provider_message_id = @providerMessageId');
    if (f.failureCode !== undefined)
        sets.push('failure_code = @failureCode');
    if (f.failureReason !== undefined)
        sets.push('failure_reason = @failureReason');
    await query(`UPDATE dbo.messages SET ${sets.join(', ')} WHERE id = @id`, {
        id: [sql.UniqueIdentifier, id],
        status: [sql.VarChar(20), status],
        instanceId: [sql.UniqueIdentifier, f.instanceId ?? null],
        providerMessageId: [sql.VarChar(200), f.providerMessageId ?? null],
        failureCode: [sql.VarChar(60), f.failureCode ?? null],
        failureReason: [sql.NVarChar(1000), f.failureReason?.slice(0, 1000) ?? null],
    });
}
export async function startAttempt(messageId, instanceId, provider) {
    const row = await queryOne(`INSERT INTO dbo.message_attempts (message_id, instance_id, provider, attempt_number)
     OUTPUT INSERTED.id
     SELECT @messageId, @instanceId, @provider, ISNULL(MAX(attempt_number), 0) + 1
     FROM dbo.message_attempts WITH (UPDLOCK, HOLDLOCK) WHERE message_id = @messageId`, {
        messageId: [sql.UniqueIdentifier, messageId],
        instanceId: [sql.UniqueIdentifier, instanceId],
        provider: [sql.VarChar(20), provider],
    });
    return { id: row.id };
}
export async function finishAttempt(attemptId, r) {
    await query(`UPDATE dbo.message_attempts
     SET status = @status, provider_message_id = @pmid, error_code = @code, error_message = @msg, completed_at = SYSUTCDATETIME()
     WHERE id = @id`, {
        id: [sql.UniqueIdentifier, attemptId],
        status: [sql.VarChar(20), r.status],
        pmid: [sql.VarChar(200), r.providerMessageId ?? null],
        code: [sql.VarChar(60), r.errorCode ?? null],
        msg: [sql.NVarChar(1000), r.errorMessage?.slice(0, 1000) ?? null],
    });
}
export const findByProviderMessageId = (providerMessageId) => queryOne('SELECT TOP (1) id, status, project_id FROM dbo.messages WHERE provider_message_id = @pmid ORDER BY created_at DESC', { pmid: [sql.VarChar(200), providerMessageId] });
/** A late receipt proves an UNKNOWN attempt actually went through. */
export const resolveUnknownAttempts = (providerMessageId) => query(`UPDATE dbo.message_attempts SET status = 'SENT', completed_at = COALESCE(completed_at, SYSUTCDATETIME())
     WHERE provider_message_id = @pmid AND status = 'UNKNOWN'`, { pmid: [sql.VarChar(200), providerMessageId] });
export const findMessageSummary = (id) => queryOne('SELECT id, project_id, recipient, status, idempotency_key, failure_code, failure_reason FROM dbo.messages WHERE id = @id', { id: [sql.UniqueIdentifier, id] });
/** FAILED/UNKNOWN -> QUEUED for an operator-initiated retry. */
export async function resetForRetry(id, allowUnknown) {
    const rows = await query(`UPDATE dbo.messages SET status = 'QUEUED', failed_at = NULL, retry_count = 0, next_attempt_at = NULL, updated_at = SYSUTCDATETIME()
     OUTPUT INSERTED.id
     WHERE id = @id AND (status = 'FAILED' OR (status = 'UNKNOWN' AND @allowUnknown = 1))`, { id: [sql.UniqueIdentifier, id], allowUnknown: [sql.Bit, allowUnknown] });
    return rows.length > 0;
}
/** Messages that never reached the queue (Redis was down) or whose job was lost. */
export const findStaleMessages = () => query(`SELECT TOP (500) id FROM dbo.messages
     WHERE (status = 'CREATED' AND created_at < DATEADD(SECOND, -30, SYSUTCDATETIME()))
        OR (status = 'QUEUED' AND updated_at < DATEADD(MINUTE, -15, SYSUTCDATETIME()))
     ORDER BY created_at`);
export async function listMessages(f) {
    const where = [
        f.projectId && 'm.project_id = @projectId',
        f.status && 'm.status = @status',
        f.instanceId && 'm.instance_id = @instanceId',
        f.recipient && 'm.recipient LIKE @recipient',
        f.from && 'm.created_at >= @from',
        f.to && 'm.created_at < @to',
    ].filter(Boolean);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const params = {
        projectId: [sql.UniqueIdentifier, f.projectId ?? null],
        status: [sql.VarChar(20), f.status ?? null],
        instanceId: [sql.UniqueIdentifier, f.instanceId ?? null],
        recipient: [sql.VarChar(22), f.recipient ? `${f.recipient}%` : null],
        from: [sql.DateTime2(3), f.from ?? null],
        to: [sql.DateTime2(3), f.to ?? null],
        skip: [sql.Int, (f.page - 1) * f.pageSize],
        take: [sql.Int, f.pageSize],
    };
    const items = await query(`SELECT m.id, m.project_id, p.name AS project_name, m.instance_id, i.name AS instance_name, i.provider,
            m.recipient, m.message_type, m.status, m.idempotency_key, m.failure_code, m.failure_reason,
            m.created_at, m.sent_at, m.delivered_at, m.read_at, m.failed_at, m.updated_at
     FROM dbo.messages m
     JOIN dbo.projects p ON p.id = m.project_id
     LEFT JOIN dbo.whatsapp_instances i ON i.id = m.instance_id
     ${whereSql}
     ORDER BY m.created_at DESC, m.id DESC
     OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`, { ...params });
    const [{ total }] = await query(`SELECT COUNT_BIG(*) AS total FROM dbo.messages m ${whereSql}`, { ...params });
    return { items, total: Number(total), page: f.page, pageSize: f.pageSize };
}
export async function getMessageDetail(id) {
    const message = await queryOne(`SELECT m.*, p.name AS project_name, i.name AS instance_name, i.provider
     FROM dbo.messages m
     JOIN dbo.projects p ON p.id = m.project_id
     LEFT JOIN dbo.whatsapp_instances i ON i.id = m.instance_id
     WHERE m.id = @id`, { id: [sql.UniqueIdentifier, id] });
    if (!message)
        return null;
    const attempts = await query(`SELECT a.id, a.attempt_number, a.instance_id, i.name AS instance_name, a.provider, a.status,
            a.provider_message_id, a.error_code, a.error_message, a.started_at, a.completed_at
     FROM dbo.message_attempts a JOIN dbo.whatsapp_instances i ON i.id = a.instance_id
     WHERE a.message_id = @id ORDER BY a.attempt_number`, { id: [sql.UniqueIdentifier, id] });
    return { ...message, content: JSON.parse(message.content), attempts };
}
/** Client view: scoped to the calling project, no provider/instance details. */
export const findClientMessage = (projectId, id) => queryOne(`SELECT id, recipient, message_type, status, idempotency_key, failure_code, failure_reason,
            created_at, queued_at, sent_at, delivered_at, read_at, failed_at
     FROM dbo.messages WHERE id = @id AND project_id = @projectId`, { id: [sql.UniqueIdentifier, id], projectId: [sql.UniqueIdentifier, projectId] });
export const projectUsage = (projectId, from) => query(`SELECT status, COUNT(*) AS count FROM dbo.messages
     WHERE project_id = @projectId AND created_at >= @from GROUP BY status`, { projectId: [sql.UniqueIdentifier, projectId], from: [sql.DateTime2(3), from] });
//# sourceMappingURL=messageRepository.js.map