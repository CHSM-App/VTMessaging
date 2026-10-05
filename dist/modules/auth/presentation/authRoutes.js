import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../../middleware/authentication.js';
import { requireRole } from '../../../middleware/authorization.js';
import { loginLimiter } from '../../../middleware/rateLimiter.js';
import { adminActor, ok } from '../../../shared/http.js';
import { idParam } from '../../../shared/validation.js';
import * as auth from '../application/authUseCases.js';
import { ROLES } from '../domain/auth.js';
import { listAdmins } from '../infrastructure/adminUserRepository.js';
const password = z.string().min(10, 'Password must be at least 10 characters').max(200);
const loginBody = z.object({ email: z.email(), password: z.string().min(1).max(200) });
const changePasswordBody = z.object({ currentPassword: z.string().min(1), newPassword: password });
const createUserBody = z.object({ email: z.email(), name: z.string().min(1).max(150), role: z.enum(ROLES), password });
const updateUserBody = z.object({
    name: z.string().min(1).max(150).optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
    password: password.optional(),
});
/** Mounted at /api/v1/auth */
export const authRoutes = Router();
authRoutes.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = loginBody.parse(req.body);
    ok(res, await auth.login(email, password));
});
authRoutes.get('/me', requireAdmin, (req, res) => ok(res, req.admin));
authRoutes.post('/change-password', requireAdmin, async (req, res) => {
    const body = changePasswordBody.parse(req.body);
    await auth.changePassword(req.admin, body.currentPassword, body.newPassword);
    ok(res, { changed: true });
});
/** Mounted under /api/v1/admin (already authenticated) */
export const adminUserRoutes = Router();
adminUserRoutes.get('/users', requireRole('ADMIN'), async (_req, res) => ok(res, await listAdmins()));
adminUserRoutes.post('/users', requireRole('ADMIN'), async (req, res) => {
    ok(res, await auth.createAdminUser(adminActor(req), createUserBody.parse(req.body)), 201);
});
adminUserRoutes.patch('/users/:id', requireRole('ADMIN'), async (req, res) => {
    const { id } = idParam.parse(req.params);
    await auth.updateAdminUser(adminActor(req), id, updateUserBody.parse(req.body));
    ok(res, { updated: true });
});
//# sourceMappingURL=authRoutes.js.map