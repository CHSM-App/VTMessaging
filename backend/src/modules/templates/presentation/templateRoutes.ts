import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../../middleware/authorization.js';
import { adminActor, ok } from '../../../shared/http.js';
import { httpUrl, id, idParam } from '../../../shared/validation.js';
import * as templates from '../application/templateUseCases.js';
import { TEMPLATE_CATEGORIES, TEMPLATE_NAME } from '../domain/template.js';
import { listTemplates } from '../infrastructure/templateRepository.js';

const buttonText = z.string().min(1).max(25);
const definition = z.object({
  name: z.string().regex(TEMPLATE_NAME, 'Lowercase letters, numbers and underscores only'),
  category: z.enum(TEMPLATE_CATEGORIES),
  language: z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, 'e.g. en, en_US, mr').default('en'),
  header: z.string().max(60).nullish().transform((v) => v || null),
  body: z.string().min(1).max(1024),
  footer: z.string().max(60).nullish().transform((v) => v || null),
  variables: z.array(z.string().min(1).max(200)).max(20).default([]),
  buttons: z
    .array(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('QUICK_REPLY'), text: buttonText }),
        z.object({ type: z.literal('URL'), text: buttonText, url: httpUrl }),
        z.object({ type: z.literal('PHONE_NUMBER'), text: buttonText, phone_number: z.string().regex(/^\+?\d{8,15}$/) }),
      ]),
    )
    .max(10)
    .default([]),
});

/** Mounted under /api/v1/admin */
export const templateRoutes = Router();

templateRoutes.get('/templates', async (req, res) => {
  const { projectId } = z.object({ projectId: id.optional() }).parse(req.query);
  ok(res, await listTemplates(projectId));
});

templateRoutes.post('/templates', requireRole('OPERATOR'), async (req, res) => {
  const { projectId, ...def } = definition.extend({ projectId: id }).parse(req.body);
  ok(res, await templates.createTemplate(adminActor(req), projectId, def), 201);
});

templateRoutes.post('/templates/sync', requireRole('OPERATOR'), async (req, res) => {
  ok(res, await templates.syncAllTemplates(adminActor(req)));
});

templateRoutes.get('/templates/:id', async (req, res) => ok(res, await templates.requireTemplate(idParam.parse(req.params).id)));

templateRoutes.put('/templates/:id', requireRole('OPERATOR'), async (req, res) => {
  const { id } = idParam.parse(req.params);
  ok(res, await templates.updateTemplate(adminActor(req), id, definition.parse(req.body)));
});

templateRoutes.delete('/templates/:id', requireRole('OPERATOR'), async (req, res) => {
  await templates.deleteTemplate(adminActor(req), idParam.parse(req.params).id);
  ok(res, { deleted: true });
});

templateRoutes.post('/templates/:id/submit', requireRole('OPERATOR'), async (req, res) => {
  const templateId = idParam.parse(req.params).id;
  const { instanceId } = z.object({ instanceId: id }).parse(req.body);
  ok(res, await templates.submitTemplate(adminActor(req), templateId, instanceId));
});

templateRoutes.post('/templates/:id/sync', requireRole('OPERATOR'), async (req, res) => {
  ok(res, await templates.syncTemplate(adminActor(req), idParam.parse(req.params).id));
});
