import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../../middleware/authorization.js';
import { adminActor, ok } from '../../../shared/http.js';
import { id, idParam } from '../../../shared/validation.js';
import * as keys from '../application/apiKeyUseCases.js';
import { listAllApiKeys, listProjectApiKeys } from '../infrastructure/apiKeyRepository.js';
const createBody = z.object({
    name: z.string().trim().min(1).max(100),
    expiresAt: z.coerce.date().nullish(),
});
const projectParam = z.object({ projectId: id });
/** Mounted under /api/v1/admin */
export const apiKeyRoutes = Router();
apiKeyRoutes.get('/api-keys', async (_req, res) => ok(res, await listAllApiKeys()));
apiKeyRoutes.get('/projects/:projectId/api-keys', async (req, res) => {
    ok(res, await listProjectApiKeys(projectParam.parse(req.params).projectId));
});
apiKeyRoutes.post('/projects/:projectId/api-keys', requireRole('OPERATOR'), async (req, res) => {
    const { projectId } = projectParam.parse(req.params);
    ok(res, await keys.createApiKey(adminActor(req), projectId, createBody.parse(req.body)), 201);
});
apiKeyRoutes.post('/api-keys/:id/revoke', requireRole('OPERATOR'), async (req, res) => {
    await keys.revokeApiKey(adminActor(req), idParam.parse(req.params).id);
    ok(res, { revoked: true });
});
apiKeyRoutes.post('/api-keys/:id/rotate', requireRole('OPERATOR'), async (req, res) => {
    ok(res, await keys.rotateApiKey(adminActor(req), idParam.parse(req.params).id), 201);
});
//# sourceMappingURL=apiKeyRoutes.js.map