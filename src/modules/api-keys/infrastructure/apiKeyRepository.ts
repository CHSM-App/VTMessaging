import { type Tx, query, queryOne, sql } from '../../../config/database.js';

const PUBLIC_COLUMNS = 'k.id, k.project_id, k.name, k.key_prefix, k.status, k.expires_at, k.last_used_at, k.created_at, k.revoked_at';

export const listProjectApiKeys = (projectId: string) =>
  query(`SELECT ${PUBLIC_COLUMNS} FROM dbo.api_keys k WHERE k.project_id = @projectId ORDER BY k.created_at DESC`, {
    projectId: [sql.UniqueIdentifier, projectId],
  });

export const listAllApiKeys = () =>
  query(
    `SELECT ${PUBLIC_COLUMNS}, p.name AS project_name
     FROM dbo.api_keys k JOIN dbo.projects p ON p.id = k.project_id
     WHERE p.deleted_at IS NULL
     ORDER BY k.created_at DESC`,
  );

export const findApiKey = (id: string) =>
  queryOne<{ id: string; projectId: string; name: string; status: string; expiresAt: Date | null }>(
    `SELECT ${PUBLIC_COLUMNS} FROM dbo.api_keys k WHERE k.id = @id`,
    { id: [sql.UniqueIdentifier, id] },
  );

export async function insertApiKey(
  k: { projectId: string; name: string; prefix: string; hash: string; expiresAt: Date | null },
  tx?: Tx,
) {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO dbo.api_keys (project_id, name, key_prefix, key_hash, expires_at) OUTPUT INSERTED.id
     VALUES (@projectId, @name, @prefix, @hash, @expiresAt)`,
    {
      projectId: [sql.UniqueIdentifier, k.projectId],
      name: [sql.NVarChar(100), k.name],
      prefix: [sql.VarChar(20), k.prefix],
      hash: [sql.Char(64), k.hash],
      expiresAt: [sql.DateTime2(3), k.expiresAt],
    },
    tx,
  );
  return row!.id;
}

export const revokeApiKey = (id: string, tx?: Tx) =>
  query(
    `UPDATE dbo.api_keys SET status = 'REVOKED', revoked_at = SYSUTCDATETIME() WHERE id = @id AND status = 'ACTIVE'`,
    { id: [sql.UniqueIdentifier, id] },
    tx,
  );

export const findKeyForAuth = (prefix: string) =>
  queryOne<{
    id: string;
    keyHash: string;
    status: string;
    expiresAt: Date | null;
    projectId: string;
    projectName: string;
    projectSlug: string;
    projectStatus: string;
  }>(
    `SELECT k.id, k.key_hash, k.status, k.expires_at,
            p.id AS project_id, p.name AS project_name, p.slug AS project_slug, p.status AS project_status
     FROM dbo.api_keys k JOIN dbo.projects p ON p.id = k.project_id
     WHERE k.key_prefix = @prefix AND p.deleted_at IS NULL`,
    { prefix: [sql.VarChar(20), prefix] },
  );

/** Throttled to one write per key per minute. */
export const touchApiKey = (id: string) =>
  query(
    `UPDATE dbo.api_keys SET last_used_at = SYSUTCDATETIME()
     WHERE id = @id AND (last_used_at IS NULL OR last_used_at < DATEADD(MINUTE, -1, SYSUTCDATETIME()))`,
    { id: [sql.UniqueIdentifier, id] },
  );
