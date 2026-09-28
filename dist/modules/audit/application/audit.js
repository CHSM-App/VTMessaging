import { logger } from '../../../config/logger.js';
import { insertAuditLog } from '../infrastructure/auditRepository.js';
export const SYSTEM = { type: 'SYSTEM', id: 'system' };
/** Records an audit entry. Never fails the business operation; a failed write is logged loudly instead. */
export async function audit(actor, action, resourceType, resourceId, metadata) {
    try {
        await insertAuditLog({ actorType: actor.type, actorId: actor.id, action, resourceType, resourceId, metadata });
    }
    catch (err) {
        logger.error({ err, action, resourceType, resourceId }, 'Failed to write audit log');
    }
}
//# sourceMappingURL=audit.js.map