import { publishRealtime } from '../../../realtime/events.js';
import { enqueueProjectEvent } from '../../webhooks/application/projectWebhooks.js';
import { STATUS_EVENT, canApplyReceipt } from '../domain/message.js';
import * as repo from '../infrastructure/messageRepository.js';
/** Fans a status change out to the dashboard (Socket.IO) and the project's webhook. */
export async function notifyMessageStatus(messageId, status) {
    const m = await repo.findMessageSummary(messageId);
    if (!m)
        return;
    publishRealtime('message.status', { messageId, projectId: m.projectId, status });
    const event = STATUS_EVENT[status];
    if (!event)
        return;
    await enqueueProjectEvent(m.projectId, event, {
        event,
        messageId,
        status: status.toLowerCase(),
        to: m.recipient,
        idempotencyKey: m.idempotencyKey,
        timestamp: new Date().toISOString(),
        ...(status === 'FAILED' || status === 'UNKNOWN' ? { error: { code: m.failureCode, message: m.failureReason } } : {}),
    });
}
/** Applies a provider receipt (sent/delivered/read/failed), whichever provider it came from. */
export async function applyReceipt(r) {
    const m = await repo.findByProviderMessageId(r.providerMessageId);
    if (!m || !canApplyReceipt(m.status, r.status))
        return false;
    await repo.transition(m.id, r.status, r.status === 'FAILED'
        ? { failureCode: r.errorCode ?? 'PROVIDER_FAILED', failureReason: r.errorMessage ?? 'Provider reported delivery failure' }
        : m.status === 'UNKNOWN'
            ? { failureCode: null, failureReason: null }
            : {});
    if (m.status === 'UNKNOWN')
        await repo.resolveUnknownAttempts(r.providerMessageId);
    await notifyMessageStatus(m.id, r.status);
    return true;
}
//# sourceMappingURL=messageEvents.js.map