import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../../middleware/authorization.js';
import { adminActor, ok } from '../../../shared/http.js';
import { id, idParam } from '../../../shared/validation.js';
import * as instances from '../application/instanceUseCases.js';
import { PROVIDERS } from '../domain/instance.js';
import { listProjectInstances } from '../infrastructure/assignmentRepository.js';
const metaConfig = z.object({
    wabaId: z.string().trim().regex(/^\d{5,30}$/, 'WABA ID is numeric'),
    phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, 'Phone number ID is numeric'),
    accessToken: z.string().trim().min(20).max(1000),
    appId: z.string().trim().regex(/^\d{5,30}$/).optional(),
});
const createBody = z.discriminatedUnion('provider', [
    z.object({ provider: z.literal('BAILEYS'), name: z.string().trim().min(1).max(150) }),
    z.object({ provider: z.literal('META_CLOUD'), name: z.string().trim().min(1).max(150), meta: metaConfig }),
]);
const updateBody = z.object({
    name: z.string().trim().min(1).max(150).optional(),
    meta: metaConfig.partial().optional(),
});
const deleteQuery = z.object({ confirm: z.stringbool().default(false) });
const projectParams = z.object({ projectId: id });
const assignmentParams = z.object({ projectId: id, instanceId: id });
/** Mounted under /api/v1/admin */
export const instanceRoutes = Router();
instanceRoutes.get('/instances', async (_req, res) => ok(res, await instances.listInstances()));
instanceRoutes.get('/instances/providers', (_req, res) => ok(res, PROVIDERS));
instanceRoutes.post('/instances', requireRole('ADMIN'), async (req, res) => {
    ok(res, await instances.createInstance(adminActor(req), createBody.parse(req.body)), 201);
});
instanceRoutes.get('/instances/:id', async (req, res) => ok(res, await instances.getInstance(idParam.parse(req.params).id)));
instanceRoutes.patch('/instances/:id', requireRole('ADMIN'), async (req, res) => {
    const { id } = idParam.parse(req.params);
    ok(res, await instances.updateInstance(adminActor(req), id, updateBody.parse(req.body)));
});
instanceRoutes.get('/instances/:id/impact', async (req, res) => {
    ok(res, await instances.getDeletionImpact(idParam.parse(req.params).id));
});
instanceRoutes.delete('/instances/:id', requireRole('ADMIN'), async (req, res) => {
    const { id } = idParam.parse(req.params);
    ok(res, await instances.deleteInstance(adminActor(req), id, deleteQuery.parse(req.query).confirm));
});
for (const action of ['connect', 'disconnect']) {
    instanceRoutes.post(`/instances/:id/${action}`, requireRole('OPERATOR'), async (req, res) => {
        ok(res, await instances.controlInstance(adminActor(req), idParam.parse(req.params).id, action), 202);
    });
}
instanceRoutes.post('/instances/:id/logout', requireRole('ADMIN'), async (req, res) => {
    ok(res, await instances.controlInstance(adminActor(req), idParam.parse(req.params).id, 'logout'), 202);
});
instanceRoutes.get('/instances/:id/qr', async (req, res) => ok(res, await instances.getQr(idParam.parse(req.params).id)));
// --- assignment ---
instanceRoutes.get('/projects/:projectId/instances', async (req, res) => {
    ok(res, await listProjectInstances(projectParams.parse(req.params).projectId));
});
instanceRoutes.post('/projects/:projectId/instances', requireRole('OPERATOR'), async (req, res) => {
    const { projectId } = projectParams.parse(req.params);
    const { instanceId } = z.object({ instanceId: id }).parse(req.body);
    await instances.assignInstance(adminActor(req), projectId, instanceId);
    ok(res, { assigned: true }, 201);
});
instanceRoutes.patch('/projects/:projectId/instances/:instanceId', requireRole('OPERATOR'), async (req, res) => {
    const { projectId, instanceId } = assignmentParams.parse(req.params);
    const { isEnabled } = z.object({ isEnabled: z.boolean() }).parse(req.body);
    await instances.setAssignmentEnabled(adminActor(req), projectId, instanceId, isEnabled);
    ok(res, { isEnabled });
});
instanceRoutes.delete('/projects/:projectId/instances/:instanceId', requireRole('OPERATOR'), async (req, res) => {
    const { projectId, instanceId } = assignmentParams.parse(req.params);
    await instances.unassignInstance(adminActor(req), projectId, instanceId);
    ok(res, { removed: true });
});
//# sourceMappingURL=instanceRoutes.js.map