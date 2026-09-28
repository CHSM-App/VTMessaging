import { Router } from 'express';
import { runHealthChecks } from '../application/healthChecks.js';

/** Mounted at / and /api/v1 */
export const healthRoutes = Router();

healthRoutes.get('/health', async (_req, res) => {
  const result = await runHealthChecks();
  res.status(result.ready ? 200 : 503).json({ success: result.ready, data: result });
});

healthRoutes.get('/health/live', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

healthRoutes.get('/health/ready', async (_req, res) => {
  const result = await runHealthChecks();
  res.status(result.ready ? 200 : 503).json({ success: result.ready, data: { ready: result.ready, checks: result.checks } });
});
