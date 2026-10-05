import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../../middleware/authorization.js';
import { adminActor, ok } from '../../../shared/http.js';
import { httpUrl, idParam } from '../../../shared/validation.js';
import { sendTestWebhook } from '../../webhooks/application/projectWebhooks.js';
import * as projects from '../application/projectUseCases.js';
import { PROJECT_STATUSES, SLUG_PATTERN } from '../domain/project.js';
import { listProjects } from '../infrastructure/projectRepository.js';
const createBody = z.object({
    name: z.string().trim().min(1).max(150),
    slug: z.string().regex(SLUG_PATTERN, 'Use lowercase letters, numbers and dashes').max(100).optional(),
    description: z.string().max(1000).nullish(),
});
const updateBody = z.object({
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().max(1000).nullish(),
    status: z.enum(PROJECT_STATUSES).optional(),
});
const webhookBody = z.object({ url: httpUrl.max(2048).nullable() });
/** Mounted at /api/v1/admin/projects */
export const projectRoutes = Router();
projectRoutes.get('/', async (_req, res) => ok(res, await listProjects()));
projectRoutes.post('/', requireRole('OPERATOR'), async (req, res) => {
    ok(res, await projects.createProject(adminActor(req), createBody.parse(req.body)), 201);
});
projectRoutes.get('/:id', async (req, res) => {
    ok(res, await projects.getProjectDetail(idParam.parse(req.params).id));
});
projectRoutes.patch('/:id', requireRole('OPERATOR'), async (req, res) => {
    const { id } = idParam.parse(req.params);
    ok(res, await projects.updateProject(adminActor(req), id, updateBody.parse(req.body)));
});
projectRoutes.delete('/:id', requireRole('ADMIN'), async (req, res) => {
    await projects.deleteProject(adminActor(req), idParam.parse(req.params).id);
    ok(res, { deleted: true });
});
projectRoutes.put('/:id/webhook', requireRole('OPERATOR'), async (req, res) => {
    const { id } = idParam.parse(req.params);
    ok(res, await projects.configureWebhook(adminActor(req), id, webhookBody.parse(req.body).url));
});
projectRoutes.post('/:id/webhook/rotate-secret', requireRole('OPERATOR'), async (req, res) => {
    ok(res, await projects.rotateWebhookSecret(adminActor(req), idParam.parse(req.params).id));
});
projectRoutes.post('/:id/webhook/test', requireRole('OPERATOR'), async (req, res) => {
    ok(res, await sendTestWebhook(idParam.parse(req.params).id), 202);
});
//# sourceMappingURL=projectRoutes.js.map