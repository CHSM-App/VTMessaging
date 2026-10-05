import { Router } from 'express';
import { requireAdmin, requireApiKey } from '../middleware/authentication.js';
import { readOnlyForViewers } from '../middleware/authorization.js';
import { adminLimiter, projectRequestLimiter } from '../middleware/rateLimiter.js';
import { apiKeyRoutes } from '../modules/api-keys/presentation/apiKeyRoutes.js';
import { auditRoutes } from '../modules/audit/presentation/auditRoutes.js';
import { adminUserRoutes, authRoutes } from '../modules/auth/presentation/authRoutes.js';
import { dashboardRoutes } from '../modules/dashboard/dashboardRoutes.js';
import { healthRoutes } from '../modules/health/presentation/healthRoutes.js';
import { adminMessageRoutes, clientMessageRoutes } from '../modules/messaging/presentation/messageRoutes.js';
import { projectRoutes } from '../modules/projects/presentation/projectRoutes.js';
import { templateRoutes } from '../modules/templates/presentation/templateRoutes.js';
import { adminWebhookRoutes, providerWebhookRoutes } from '../modules/webhooks/presentation/webhookRoutes.js';
import { instanceRoutes } from '../modules/whatsapp-instances/presentation/instanceRoutes.js';
import { serviceRoutes } from '../modules/whatsapp-service/presentation/serviceRoutes.js';

/** Everything under /api/v1 */
export function apiRoutes() {
  const api = Router();

  api.use(healthRoutes);
  api.use('/auth', authRoutes);
  api.use('/webhooks', providerWebhookRoutes); // provider-signed, no API key

  // Dashboard (JWT + roles). VIEWER is read-only everywhere.
  const admin = Router();
  admin.use(adminLimiter, requireAdmin, readOnlyForViewers);
  admin.use(dashboardRoutes, adminUserRoutes, auditRoutes, apiKeyRoutes, instanceRoutes, serviceRoutes);
  admin.use(adminMessageRoutes, templateRoutes, adminWebhookRoutes);
  admin.use('/projects', projectRoutes);
  api.use('/admin', admin);

  // Client applications (project API key). The project comes from the key, never from the request.
  api.use(['/messages', '/usage'], requireApiKey, projectRequestLimiter);
  api.use(clientMessageRoutes);

  return api;
}
