import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../../shared/http.js';
import { pagination } from '../../../shared/validation.js';
import { listAuditLogs } from '../infrastructure/auditRepository.js';

const listQuery = pagination.extend({
  resourceType: z.string().max(50).optional(),
  resourceId: z.string().max(100).optional(),
  action: z.string().max(100).optional(),
});

export const auditRoutes = Router();

auditRoutes.get('/audit-logs', async (req, res) => {
  const q = listQuery.parse(req.query);
  ok(res, { ...(await listAuditLogs(q)), page: q.page, pageSize: q.pageSize });
});
