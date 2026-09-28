import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../../middleware/authorization.js';
import { ok } from '../../../shared/http.js';
import { id, idParam, pagination } from '../../../shared/validation.js';
import { redeliver } from '../application/projectWebhooks.js';
import { receiveMetaWebhook, verifyMetaSubscription } from '../application/providerWebhooks.js';
import { listDeliveries, listWebhookEvents } from '../infrastructure/webhookRepository.js';

/** Public provider callbacks, mounted at /api/v1/webhooks. Authenticated by provider signatures. */
export const providerWebhookRoutes = Router();

providerWebhookRoutes.get('/meta', async (req, res) => {
  res.type('text/plain').send(await verifyMetaSubscription(req.query as Record<string, unknown>));
});

providerWebhookRoutes.post('/meta', async (req, res) => {
  ok(res, await receiveMetaWebhook(req.rawBody, req.header('x-hub-signature-256'), req.body));
});

/** Dashboard, mounted under /api/v1/admin */
export const adminWebhookRoutes = Router();

adminWebhookRoutes.get('/webhooks/events', async (req, res) => {
  const q = pagination.extend({ provider: z.enum(['BAILEYS', 'META_CLOUD']).optional() }).parse(req.query);
  ok(res, await listWebhookEvents(q));
});

adminWebhookRoutes.get('/webhooks/deliveries', async (req, res) => {
  const q = pagination.extend({ projectId: id.optional(), status: z.enum(['PENDING', 'DELIVERED', 'FAILED']).optional() }).parse(req.query);
  ok(res, await listDeliveries(q));
});

adminWebhookRoutes.post('/webhooks/deliveries/:id/redeliver', requireRole('OPERATOR'), async (req, res) => {
  ok(res, await redeliver(idParam.parse(req.params).id), 202);
});
