import { hasRole } from '../modules/auth/domain/auth.js';
import { forbidden, unauthorized } from '../shared/errors/AppError.js';
/** Minimum role (VIEWER < OPERATOR < ADMIN). */
export const requireRole = (role) => (req, _res, next) => {
    if (!req.admin)
        throw unauthorized();
    if (!hasRole(req.admin.role, role))
        throw forbidden(`Requires ${role} role`);
    next();
};
/** VIEWERs may only read. */
export function readOnlyForViewers(req, _res, next) {
    if (req.method !== 'GET' && req.admin?.role === 'VIEWER')
        throw forbidden('VIEWER role is read-only');
    next();
}
//# sourceMappingURL=authorization.js.map