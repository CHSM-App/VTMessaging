import { query, queryOne, sql } from '../../../config/database.js';
export const listProjectInstances = (projectId) => query(`SELECT i.id, i.name, i.provider, i.phone_number, i.status, i.health_status, i.last_activity_at,
            pi.is_enabled, pi.created_at AS assigned_at
     FROM dbo.project_whatsapp_instances pi
     JOIN dbo.whatsapp_instances i ON i.id = pi.instance_id AND i.deleted_at IS NULL
     WHERE pi.project_id = @projectId
     ORDER BY i.name`, { projectId: [sql.UniqueIdentifier, projectId] });
export const findAssignment = (projectId, instanceId) => queryOne('SELECT id, is_enabled FROM dbo.project_whatsapp_instances WHERE project_id = @projectId AND instance_id = @instanceId', { projectId: [sql.UniqueIdentifier, projectId], instanceId: [sql.UniqueIdentifier, instanceId] });
export const insertAssignment = (projectId, instanceId) => query('INSERT INTO dbo.project_whatsapp_instances (project_id, instance_id) VALUES (@projectId, @instanceId)', {
    projectId: [sql.UniqueIdentifier, projectId],
    instanceId: [sql.UniqueIdentifier, instanceId],
});
export const deleteAssignment = (projectId, instanceId) => query('DELETE FROM dbo.project_whatsapp_instances WHERE project_id = @projectId AND instance_id = @instanceId', {
    projectId: [sql.UniqueIdentifier, projectId],
    instanceId: [sql.UniqueIdentifier, instanceId],
});
export const setAssignmentEnabled = (projectId, instanceId, enabled) => query('UPDATE dbo.project_whatsapp_instances SET is_enabled = @enabled WHERE project_id = @projectId AND instance_id = @instanceId', {
    projectId: [sql.UniqueIdentifier, projectId],
    instanceId: [sql.UniqueIdentifier, instanceId],
    enabled: [sql.Bit, enabled],
});
//# sourceMappingURL=assignmentRepository.js.map