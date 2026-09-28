import { query, queryOne, sql } from '../../../config/database.js';
import type { Role } from '../domain/auth.js';

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  passwordHash: string;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const COLUMNS = 'id, email, name, role, is_active, password_hash, last_login_at, created_at';

export const findAdminByEmail = (email: string) =>
  queryOne<AdminUserRow>(`SELECT ${COLUMNS} FROM dbo.admin_users WHERE email = @email`, {
    email: [sql.VarChar(254), email.toLowerCase()],
  });

export const findAdminById = (id: string) =>
  queryOne<AdminUserRow>(`SELECT ${COLUMNS} FROM dbo.admin_users WHERE id = @id`, { id: [sql.UniqueIdentifier, id] });

export async function listAdmins() {
  const rows = await query<AdminUserRow>(`SELECT ${COLUMNS} FROM dbo.admin_users ORDER BY created_at`);
  return rows.map(({ passwordHash: _, ...u }) => u);
}

export async function insertAdmin(u: { email: string; name: string; role: Role; passwordHash: string }) {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO dbo.admin_users (email, name, role, password_hash) OUTPUT INSERTED.id
     VALUES (@email, @name, @role, @hash)`,
    {
      email: [sql.VarChar(254), u.email.toLowerCase()],
      name: [sql.NVarChar(150), u.name],
      role: [sql.VarChar(20), u.role],
      hash: [sql.VarChar(255), u.passwordHash],
    },
  );
  return row!.id;
}

export async function updateAdmin(id: string, u: { name?: string; role?: Role; isActive?: boolean; passwordHash?: string }) {
  await query(
    `UPDATE dbo.admin_users SET
       name = COALESCE(@name, name),
       role = COALESCE(@role, role),
       is_active = COALESCE(@isActive, is_active),
       password_hash = COALESCE(@hash, password_hash),
       updated_at = SYSUTCDATETIME()
     WHERE id = @id`,
    {
      id: [sql.UniqueIdentifier, id],
      name: [sql.NVarChar(150), u.name ?? null],
      role: [sql.VarChar(20), u.role ?? null],
      isActive: [sql.Bit, u.isActive ?? null],
      hash: [sql.VarChar(255), u.passwordHash ?? null],
    },
  );
}

export const touchAdminLogin = (id: string) =>
  query('UPDATE dbo.admin_users SET last_login_at = SYSUTCDATETIME() WHERE id = @id', { id: [sql.UniqueIdentifier, id] });

export async function countActiveAdmins() {
  const r = await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM dbo.admin_users WHERE role = 'ADMIN' AND is_active = 1");
  return r?.n ?? 0;
}
