import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../../middleware/authorization.js';
import { adminActor, ok } from '../../../shared/http.js';
import { id } from '../../../shared/validation.js';
import { configureWhatsAppService } from '../application/configureService.js';
import { findService } from '../infrastructure/serviceRepository.js';

const params = z.object({ projectId: id });
const body = z.object({ priorityInstanceId: id, fallbackInstanceId: id.nullable().default(null) });

/** Mounted under /api/v1/admin */
export const serviceRoutes = Router();

serviceRoutes.get('/projects/:projectId/whatsapp-service', async (req, res) => {
  ok(res, await findService(params.parse(req.params).projectId));
});

serviceRoutes.put('/projects/:projectId/whatsapp-service', requireRole('OPERATOR'), async (req, res) => {
  const { projectId } = params.parse(req.params);
  ok(res, await configureWhatsAppService(adminActor(req), projectId, body.parse(req.body)));
});
