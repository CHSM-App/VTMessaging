import { query, queryOne, sql } from '../../../config/database.js';
const COLUMNS = `t.id, t.project_id, p.name AS project_name, t.instance_id, t.provider, t.name, t.category, t.language,
  t.header, t.body, t.footer, t.variables, t.buttons, t.provider_template_id, t.status, t.rejection_reason, t.created_at, t.updated_at`;
const parse = (r) => ({ ...r, variables: JSON.parse(r.variables), buttons: JSON.parse(r.buttons) });
export async function listTemplates(projectId) {
    const rows = await query(`SELECT ${COLUMNS} FROM dbo.templates t JOIN dbo.projects p ON p.id = t.project_id
     WHERE p.deleted_at IS NULL ${projectId ? 'AND t.project_id = @projectId' : ''}
     ORDER BY p.name, t.name, t.language`, { projectId: [sql.UniqueIdentifier, projectId ?? null] });
    return rows.map(parse);
}
export async function findTemplate(id) {
    const r = await queryOne(`SELECT ${COLUMNS} FROM dbo.templates t JOIN dbo.projects p ON p.id = t.project_id WHERE t.id = @id`, {
        id: [sql.UniqueIdentifier, id],
    });
    return r && parse(r);
}
export const findTemplateByName = (projectId, name, language) => queryOne('SELECT id, body, status FROM dbo.templates WHERE project_id = @projectId AND name = @name AND language = @language', {
    projectId: [sql.UniqueIdentifier, projectId],
    name: [sql.VarChar(512), name],
    language: [sql.VarChar(15), language],
});
export const findTemplateForSend = (id) => queryOne('SELECT name, language, body, status FROM dbo.templates WHERE id = @id', { id: [sql.UniqueIdentifier, id] });
export const findTemplatesByProviderId = (providerTemplateId) => query('SELECT id, status, project_id FROM dbo.templates WHERE provider_template_id = @pid', { pid: [sql.VarChar(100), providerTemplateId] });
const definitionParams = (t) => ({
    name: [sql.VarChar(512), t.name],
    category: [sql.VarChar(20), t.category],
    language: [sql.VarChar(15), t.language],
    header: [sql.NVarChar(60), t.header],
    body: [sql.NVarChar(1024), t.body],
    footer: [sql.NVarChar(60), t.footer],
    variables: [sql.NVarChar(sql.MAX), JSON.stringify(t.variables)],
    buttons: [sql.NVarChar(sql.MAX), JSON.stringify(t.buttons)],
});
export async function insertTemplate(projectId, t) {
    const row = await queryOne(`INSERT INTO dbo.templates (project_id, name, category, language, header, body, footer, variables, buttons)
     OUTPUT INSERTED.id
     VALUES (@projectId, @name, @category, @language, @header, @body, @footer, @variables, @buttons)`, { projectId: [sql.UniqueIdentifier, projectId], ...definitionParams(t) });
    return row.id;
}
export async function updateTemplate(id, t) {
    await query(`UPDATE dbo.templates SET name = @name, category = @category, language = @language, header = @header, body = @body,
       footer = @footer, variables = @variables, buttons = @buttons, updated_at = SYSUTCDATETIME()
     WHERE id = @id`, { id: [sql.UniqueIdentifier, id], ...definitionParams(t) });
}
export const deleteTemplate = (id) => query('DELETE FROM dbo.templates WHERE id = @id AND NOT EXISTS (SELECT 1 FROM dbo.messages WHERE template_id = @id)', {
    id: [sql.UniqueIdentifier, id],
});
export const isTemplateUsed = async (id) => !!(await queryOne('SELECT TOP (1) 1 AS x FROM dbo.messages WHERE template_id = @id', { id: [sql.UniqueIdentifier, id] }));
export async function setTemplateProviderState(id, s) {
    await query(`UPDATE dbo.templates SET status = @status, rejection_reason = @reason,
       provider_template_id = COALESCE(@pid, provider_template_id),
       instance_id = COALESCE(@instanceId, instance_id),
       updated_at = SYSUTCDATETIME()
     WHERE id = @id`, {
        id: [sql.UniqueIdentifier, id],
        status: [sql.VarChar(20), s.status],
        reason: [sql.NVarChar(1000), s.rejectionReason?.slice(0, 1000) ?? null],
        pid: [sql.VarChar(100), s.providerTemplateId ?? null],
        instanceId: [sql.UniqueIdentifier, s.instanceId ?? null],
    });
}
export const listSubmittedTemplateIds = () => query("SELECT id FROM dbo.templates WHERE provider_template_id IS NOT NULL AND status IN ('PENDING', 'APPROVED', 'PAUSED')");
//# sourceMappingURL=templateRepository.js.map