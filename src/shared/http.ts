import type { Request, Response } from 'express';
import type { Actor } from '../modules/audit/application/audit.js';

/** Standard success envelope: { success: true, data } */
export function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ success: true, data });
}

/** The authenticated admin as an audit actor. */
export const adminActor = (req: Request): Actor => ({ type: 'ADMIN', id: req.admin?.email ?? null });
