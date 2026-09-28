import { query, queryOne, sql, withTransaction } from '../../../config/database.js';
import type { ProviderType } from '../../../providers/whatsapp/contracts/types.js';

export interface ServiceRow {
  id: string;
  projectId: string;
  priorityInstanceId: string;
  priorityInstanceName: string;
  priorityProvider: ProviderType;
  fallbackInstanceId: string | null;
  fallbackInstanceName: string | null;
  fallbackProvider: ProviderType | null;
  updatedAt: Date;
}

export const findService = (projectId: string) =>
  queryOne<ServiceRow>(
    `SELECT s.id, s.project_id, s.updated_at,
            s.priority_instance_id, pi.name AS priority_instance_name, pi.provider AS priority_provider,
            s.fallback_instance_id, fi.name AS fallback_instance_name, fi.provider AS fallback_provider
     FROM dbo.project_whatsapp_services s
     JOIN dbo.whatsapp_instances pi ON pi.id = s.priority_instance_id
     LEFT JOIN dbo.whatsapp_instances fi ON fi.id = s.fallback_instance_id
     WHERE s.project_id = @projectId`,
    { projectId: [sql.UniqueIdentifier, projectId] },
  );

/** Race-safe upsert (UPDLOCK + SERIALIZABLE), one service row per project. */
export async function upsertService(projectId: string, priorityInstanceId: string, fallbackInstanceId: string | null) {
  await withTransaction((tx) =>
    query(
      `UPDATE dbo.project_whatsapp_services WITH (UPDLOCK, SERIALIZABLE)
       SET priority_instance_id = @priority, fallback_instance_id = @fallback, updated_at = SYSUTCDATETIME()
       WHERE project_id = @projectId;
       IF @@ROWCOUNT = 0
         INSERT INTO dbo.project_whatsapp_services (project_id, priority_instance_id, fallback_instance_id)
         VALUES (@projectId, @priority, @fallback);`,
      {
        projectId: [sql.UniqueIdentifier, projectId],
        priority: [sql.UniqueIdentifier, priorityInstanceId],
        fallback: [sql.UniqueIdentifier, fallbackInstanceId],
      },
      tx,
    ),
  );
}

/**
 * Send route for a project: [priority, fallback], skipping instances that are deleted
 * or whose assignment is disabled. Health does not reorder this - the DB config is the policy.
 */
export async function findRoute(projectId: string): Promise<{ id: string; provider: ProviderType }[]> {
  return query<{ id: string; provider: ProviderType }>(
    `SELECT i.id, i.provider
     FROM dbo.project_whatsapp_services s
     CROSS APPLY (VALUES (1, s.priority_instance_id), (2, s.fallback_instance_id)) AS r(ord, instance_id)
     JOIN dbo.whatsapp_instances i ON i.id = r.instance_id AND i.deleted_at IS NULL
     JOIN dbo.project_whatsapp_instances pi ON pi.project_id = s.project_id AND pi.instance_id = i.id AND pi.is_enabled = 1
     WHERE s.project_id = @projectId
     ORDER BY r.ord`,
    { projectId: [sql.UniqueIdentifier, projectId] },
  );
}
