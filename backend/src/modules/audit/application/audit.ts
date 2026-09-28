import { logger } from '../../../config/logger.js';
import { insertAuditLog } from '../infrastructure/auditRepository.js';

export interface Actor {
  type: 'ADMIN' | 'PROJECT' | 'SYSTEM';
  id: string | null;
}

export const SYSTEM: Actor = { type: 'SYSTEM', id: 'system' };

/** Records an audit entry. Never fails the business operation; a failed write is logged loudly instead. */
export async function audit(
  actor: Actor,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata?: Record<string, unknown>,
) {
  try {
    await insertAuditLog({ actorType: actor.type, actorId: actor.id, action, resourceType, resourceId, metadata });
  } catch (err) {
    logger.error({ err, action, resourceType, resourceId }, 'Failed to write audit log');
  }
}
