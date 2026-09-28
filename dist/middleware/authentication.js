import { authenticateApiKey } from '../modules/api-keys/application/apiKeyUseCases.js';
import { authenticateToken } from '../modules/auth/application/authUseCases.js';
import { unauthorized } from '../shared/errors/AppError.js';
const bearer = (req) => req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
/** Dashboard users: JWT in "Authorization: Bearer <token>". */
export async function requireAdmin(req, _res, next) {
    const token = bearer(req);
    if (!token)
        throw unauthorized();
    req.admin = await authenticateToken(token);
    next();
}
/** Client applications: project API key in "Authorization: Bearer <key>" or "X-API-Key". */
export async function requireApiKey(req, _res, next) {
    const key = req.headers['x-api-key']?.trim() || bearer(req);
    if (!key)
        throw unauthorized('API key required');
    req.project = await authenticateApiKey(key);
    next();
}
//# sourceMappingURL=authentication.js.map