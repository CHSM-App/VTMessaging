import { query, queryOne, sql } from '../../../config/database.js';
const COLUMNS = 'p.id, p.name, p.slug, p.description, p.status, p.webhook_url, p.webhook_secret_enc, p.created_at, p.updated_at';
export async function listProjects() {
    return query(`SELECT p.id, p.name, p.slug, p.description, p.status, p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM dbo.api_keys k WHERE k.project_id = p.id AND k.status = 'ACTIVE') AS active_api_keys,
            (SELECT COUNT(*) FROM dbo.project_whatsapp_instances pi WHERE pi.project_id = p.id) AS instance_count,
            CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.project_whatsapp_services s WHERE s.project_id = p.id) THEN 1 ELSE 0 END AS BIT) AS service_configured,
            (SELECT COUNT(*) FROM dbo.messages m WHERE m.project_id = p.id AND m.created_at >= DATEADD(DAY, -1, SYSUTCDATETIME())) AS messages_24h
     FROM dbo.projects p
     WHERE p.deleted_at IS NULL
     ORDER BY p.name`);
}
export const findProject = (id, tx) => queryOne(`SELECT ${COLUMNS} FROM dbo.projects p WHERE p.id = @id AND p.deleted_at IS NULL`, { id: [sql.UniqueIdentifier, id] }, tx);
export async function insertProject(p) {
    const row = await queryOne(`INSERT INTO dbo.projects (name, slug, description) OUTPUT INSERTED.id VALUES (@name, @slug, @description)`, {
        name: [sql.NVarChar(150), p.name],
        slug: [sql.VarChar(100), p.slug],
        description: [sql.NVarChar(1000), p.description ?? null],
    });
    return row.id;
}
export async function updateProject(id, p) {
    await query(`UPDATE dbo.projects SET
       name = COALESCE(@name, name),
       description = CASE WHEN @setDescription = 1 THEN @description ELSE description END,
       status = COALESCE(@status, status),
       updated_at = SYSUTCDATETIME()
     WHERE id = @id AND deleted_at IS NULL`, {
        id: [sql.UniqueIdentifier, id],
        name: [sql.NVarChar(150), p.name ?? null],
        setDescription: [sql.Bit, p.description !== undefined],
        description: [sql.NVarChar(1000), p.description ?? null],
        status: [sql.VarChar(20), p.status ?? null],
    });
}
export async function softDeleteProject(id, tx) {
    await query(`UPDATE dbo.projects SET deleted_at = SYSUTCDATETIME(), status = 'INACTIVE', updated_at = SYSUTCDATETIME() WHERE id = @id;
     UPDATE dbo.api_keys SET status = 'REVOKED', revoked_at = SYSUTCDATETIME() WHERE project_id = @id AND status = 'ACTIVE';`, { id: [sql.UniqueIdentifier, id] }, tx);
}
export async function setProjectWebhook(id, url, secretEnc) {
    await query(`UPDATE dbo.projects SET webhook_url = @url, webhook_secret_enc = @secret, updated_at = SYSUTCDATETIME() WHERE id = @id`, { id: [sql.UniqueIdentifier, id], url: [sql.NVarChar(2048), url], secret: [sql.VarChar(512), secretEnc] });
}
//# sourceMappingURL=projectRepository.js.map