import { query, queryOne, sql } from '../../../config/database.js';
const COLUMNS = 'i.id, i.name, i.provider, i.phone_number, i.status, i.status_detail, i.health_status, i.provider_config, i.last_activity_at, i.created_at, i.updated_at';
const parse = (r) => ({
    ...r,
    providerConfig: typeof r.providerConfig === 'string' ? JSON.parse(r.providerConfig) : r.providerConfig,
});
export async function listInstances() {
    const rows = await query(`SELECT ${COLUMNS},
       (SELECT p.id, p.name, pi.is_enabled AS isEnabled,
               CASE WHEN s.priority_instance_id = i.id THEN 'PRIORITY'
                    WHEN s.fallback_instance_id = i.id THEN 'FALLBACK' END AS serviceRole
        FROM dbo.project_whatsapp_instances pi
        JOIN dbo.projects p ON p.id = pi.project_id AND p.deleted_at IS NULL
        LEFT JOIN dbo.project_whatsapp_services s ON s.project_id = p.id
        WHERE pi.instance_id = i.id
        FOR JSON PATH) AS projects_json
     FROM dbo.whatsapp_instances i
     WHERE i.deleted_at IS NULL
     ORDER BY i.created_at`);
    return rows.map(({ projectsJson, ...r }) => ({ ...parse(r), projects: projectsJson ? JSON.parse(projectsJson) : [] }));
}
export async function findInstance(id, tx) {
    const row = await queryOne(`SELECT ${COLUMNS} FROM dbo.whatsapp_instances i WHERE i.id = @id AND i.deleted_at IS NULL`, { id: [sql.UniqueIdentifier, id] }, tx);
    return row && parse(row);
}
export async function insertInstance(i) {
    const row = await queryOne(`INSERT INTO dbo.whatsapp_instances (name, provider, status, provider_config) OUTPUT INSERTED.id
     VALUES (@name, @provider, @status, @config)`, {
        name: [sql.NVarChar(150), i.name],
        provider: [sql.VarChar(20), i.provider],
        status: [sql.VarChar(40), i.status],
        config: [sql.NVarChar(sql.MAX), JSON.stringify(i.config)],
    });
    return row.id;
}
export async function updateInstance(id, u) {
    await query(`UPDATE dbo.whatsapp_instances SET
       name = COALESCE(@name, name),
       provider_config = COALESCE(@config, provider_config),
       updated_at = SYSUTCDATETIME()
     WHERE id = @id AND deleted_at IS NULL`, {
        id: [sql.UniqueIdentifier, id],
        name: [sql.NVarChar(150), u.name ?? null],
        config: [sql.NVarChar(sql.MAX), u.config ? JSON.stringify(u.config) : null],
    });
}
export async function updateInstanceState(id, s) {
    await query(`UPDATE dbo.whatsapp_instances SET
       status = COALESCE(@status, status),
       status_detail = CASE WHEN @status IS NULL THEN status_detail ELSE @detail END,
       health_status = COALESCE(@health, health_status),
       phone_number = COALESCE(@phone, phone_number),
       updated_at = SYSUTCDATETIME()
     WHERE id = @id`, {
        id: [sql.UniqueIdentifier, id],
        status: [sql.VarChar(40), s.status ?? null],
        detail: [sql.NVarChar(500), s.detail?.slice(0, 500) ?? null],
        health: [sql.VarChar(20), s.health ?? null],
        phone: [sql.VarChar(20), s.phoneNumber ?? null],
    });
}
export const touchInstanceActivity = (id) => query('UPDATE dbo.whatsapp_instances SET last_activity_at = SYSUTCDATETIME() WHERE id = @id', { id: [sql.UniqueIdentifier, id] });
/** Projects affected by removing this instance, and whether it is their priority/fallback. */
export const findInstanceImpact = (id) => query(`SELECT p.id AS project_id, p.name AS project_name, pi.is_enabled,
            CASE WHEN s.priority_instance_id = @id THEN 'PRIORITY'
                 WHEN s.fallback_instance_id = @id THEN 'FALLBACK' END AS service_role
     FROM dbo.project_whatsapp_instances pi
     JOIN dbo.projects p ON p.id = pi.project_id AND p.deleted_at IS NULL
     LEFT JOIN dbo.project_whatsapp_services s ON s.project_id = p.id
     WHERE pi.instance_id = @id
     ORDER BY p.name`, { id: [sql.UniqueIdentifier, id] });
/** Removes the instance from every project/service, then soft-deletes it. */
export async function deleteInstance(id, tx) {
    await query(`DELETE FROM dbo.project_whatsapp_services WHERE priority_instance_id = @id;
     UPDATE dbo.project_whatsapp_services SET fallback_instance_id = NULL, updated_at = SYSUTCDATETIME() WHERE fallback_instance_id = @id;
     DELETE FROM dbo.project_whatsapp_instances WHERE instance_id = @id;
     UPDATE dbo.whatsapp_instances SET deleted_at = SYSUTCDATETIME(), health_status = 'UNAVAILABLE', updated_at = SYSUTCDATETIME() WHERE id = @id;`, { id: [sql.UniqueIdentifier, id] }, tx);
}
/** Webhook verification is per Meta app, so it marks every Meta instance. */
export const markMetaWebhookVerified = () => query(`UPDATE dbo.whatsapp_instances
     SET provider_config = JSON_MODIFY(provider_config, '$.webhookVerifiedAt', CONVERT(VARCHAR(33), SYSUTCDATETIME(), 127) + 'Z'),
         updated_at = SYSUTCDATETIME()
     OUTPUT INSERTED.id
     WHERE provider = 'META_CLOUD' AND deleted_at IS NULL`);
//# sourceMappingURL=instanceRepository.js.map