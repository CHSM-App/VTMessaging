import jwt from 'jsonwebtoken';
import { env } from '../../../config/env.js';
import { isDuplicateKey } from '../../../config/database.js';
import { AppError, conflict, notFound, unauthorized } from '../../../shared/errors/AppError.js';
import { hashPassword, verifyPassword } from '../../../shared/utils/password.js';
import { type Actor, audit } from '../../audit/application/audit.js';
import type { AdminPrincipal, Role } from '../domain/auth.js';
import * as repo from '../infrastructure/adminUserRepository.js';

// Constant-time-ish login: hash something even when the user doesn't exist.
const DUMMY_HASH = await hashPassword('not-a-real-password');

export async function login(email: string, password: string) {
  const user = await repo.findAdminByEmail(email);
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || !user.isActive) throw unauthorized('Invalid email or password');

  await repo.touchAdminLogin(user.id);
  await audit({ type: 'ADMIN', id: user.email }, 'auth.login', 'admin_user', user.id);
  const principal: AdminPrincipal = { id: user.id, email: user.email, name: user.name, role: user.role };
  const token = jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
  return { token, user: principal };
}

/** Verifies the JWT and re-loads the user, so role changes and deactivation apply immediately. */
export async function authenticateToken(token: string): Promise<AdminPrincipal> {
  let sub: string | undefined;
  try {
    sub = (jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload).sub;
  } catch {
    throw unauthorized('Session expired or invalid; please sign in again');
  }
  const user = sub ? await repo.findAdminById(sub) : null;
  if (!user || !user.isActive) throw unauthorized('Account is disabled');
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function changePassword(admin: AdminPrincipal, currentPassword: string, newPassword: string) {
  const user = await repo.findAdminById(admin.id);
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Current password is incorrect');
  }
  await repo.updateAdmin(admin.id, { passwordHash: await hashPassword(newPassword) });
  await audit({ type: 'ADMIN', id: admin.email }, 'auth.password_changed', 'admin_user', admin.id);
}

export async function createAdminUser(actor: Actor, u: { email: string; name: string; role: Role; password: string }) {
  try {
    const id = await repo.insertAdmin({ ...u, passwordHash: await hashPassword(u.password) });
    await audit(actor, 'admin_user.created', 'admin_user', id, { email: u.email, role: u.role });
    return { id };
  } catch (err) {
    if (isDuplicateKey(err)) throw conflict('EMAIL_TAKEN', 'A user with this email already exists');
    throw err;
  }
}

export async function updateAdminUser(
  actor: Actor,
  id: string,
  changes: { name?: string; role?: Role; isActive?: boolean; password?: string },
) {
  const user = await repo.findAdminById(id);
  if (!user) throw notFound('User');
  const demotesAdmin = user.role === 'ADMIN' && user.isActive && (changes.role && changes.role !== 'ADMIN' || changes.isActive === false);
  if (demotesAdmin && (await repo.countActiveAdmins()) <= 1) {
    throw conflict('LAST_ADMIN', 'Cannot remove the last active ADMIN');
  }
  await repo.updateAdmin(id, {
    name: changes.name,
    role: changes.role,
    isActive: changes.isActive,
    passwordHash: changes.password ? await hashPassword(changes.password) : undefined,
  });
  const { password: _, ...logged } = changes;
  await audit(actor, 'admin_user.updated', 'admin_user', id, { ...logged, passwordReset: !!changes.password });
}
