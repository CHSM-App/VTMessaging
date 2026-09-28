import { query, sql } from '../../../config/database.js';

export async function insertAuditLog(e: {
  actorType: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata?: Record<string, unknown>;
}) {
  await query(
    `INSERT INTO dbo.audit_logs (actor_type, actor_id, action, resource_type, resource_id, metadata)
     VALUES (@actorType, @actorId, @action, @resourceType, @resourceId, @metadata)`,
    {
      actorType: [sql.VarChar(20), e.actorType],
      actorId: [sql.VarChar(100), e.actorId],
      action: [sql.VarChar(100), e.action],
      resourceType: [sql.VarChar(50), e.resourceType],
      resourceId: [sql.VarChar(100), e.resourceId],
      metadata: [sql.NVarChar(sql.MAX), e.metadata ? JSON.stringify(e.metadata) : null],
    },
  );
}

export async function listAuditLogs(f: {
  resourceType?: string;
  resourceId?: string;
  action?: string;
  page: number;
  pageSize: number;
}) {
  const where = [
    f.resourceType && 'resource_type = @resourceType',
    f.resourceId && 'resource_id = @resourceId',
    f.action && 'action = @action',
  ].filter(Boolean);
  const params = {
    resourceType: [sql.VarChar(50), f.resourceType],
    resourceId: [sql.VarChar(100), f.resourceId],
    action: [sql.VarChar(100), f.action],
    skip: [sql.Int, (f.page - 1) * f.pageSize],
    take: [sql.Int, f.pageSize],
  } as const;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query<{ metadata: string | null } & Record<string, unknown>>(
    `SELECT id, actor_type, actor_id, action, resource_type, resource_id, metadata, created_at
     FROM dbo.audit_logs ${whereSql}
     ORDER BY id DESC OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
    { ...params },
  );
  const [{ total }] = await query<{ total: number }>(`SELECT COUNT_BIG(*) AS total FROM dbo.audit_logs ${whereSql}`, { ...params });
  return {
    items: rows.map((r) => ({ ...r, id: String(r.id), metadata: r.metadata ? JSON.parse(r.metadata) : null })),
    total: Number(total),
  };
}
