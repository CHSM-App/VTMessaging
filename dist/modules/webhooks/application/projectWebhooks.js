import { logger } from '../../../config/logger.js';
import { enqueueWebhookDelivery } from '../../../queue/queues.js';
import { badRequest, notFound } from '../../../shared/errors/AppError.js';
import { secrets } from '../../../shared/utils/secrets.js';
import { findProject } from '../../projects/infrastructure/projectRepository.js';
import { signWebhook } from '../domain/signature.js';
import * as repo from '../infrastructure/webhookRepository.js';
/** Records a delivery and queues it, if the project has a webhook configured. */
export async function enqueueProjectEvent(projectId, eventType, payload) {
    const project = await findProject(projectId);
    if (!project?.webhookUrl)
        return null;
    const deliveryId = await repo.insertDelivery({ projectId, eventType, payload, targetUrl: project.webhookUrl });
    await enqueueWebhookDelivery(deliveryId).catch((err) => logger.error({ err, deliveryId, projectId }, 'Could not queue webhook delivery (recoverable via redeliver)'));
    return deliveryId;
}
export async function sendTestWebhook(projectId) {
    const project = await findProject(projectId);
    if (!project)
        throw notFound('Project');
    if (!project.webhookUrl)
        throw badRequest('WEBHOOK_NOT_CONFIGURED', 'Configure a webhook URL first');
    const deliveryId = await enqueueProjectEvent(projectId, 'webhook.test', {
        event: 'webhook.test',
        projectId,
        timestamp: new Date().toISOString(),
    });
    return { deliveryId };
}
export async function redeliver(deliveryId) {
    await repo.resetDelivery(deliveryId);
    await enqueueWebhookDelivery(deliveryId, { redeliver: true });
    return { deliveryId, status: 'PENDING' };
}
/** Worker: POSTs one delivery. Throws on failure so BullMQ retries with backoff. */
export async function deliverWebhook(deliveryId, finalAttempt) {
    const d = await repo.getDeliveryForSend(deliveryId);
    if (!d || d.status === 'DELIVERED')
        return;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Vengurla-Messaging-Webhooks/1.0',
        'X-Vengurla-Event': d.eventType,
        'X-Vengurla-Delivery': d.id,
        'X-Vengurla-Timestamp': timestamp,
    };
    if (d.webhookSecretEnc)
        headers['X-Vengurla-Signature'] = signWebhook(secrets.decrypt(d.webhookSecretEnc), timestamp, d.payload);
    let failure = null;
    try {
        const res = await fetch(d.targetUrl, {
            method: 'POST',
            headers,
            body: d.payload,
            redirect: 'manual',
            signal: AbortSignal.timeout(10_000),
        });
        if (res.status < 200 || res.status >= 300)
            failure = `HTTP ${res.status}`;
    }
    catch (e) {
        const err = e;
        failure = err.cause?.code ?? err.message;
    }
    await repo.recordDeliveryAttempt(deliveryId, failure ? (finalAttempt ? 'FAILED' : 'PENDING') : 'DELIVERED', failure);
    if (failure && !finalAttempt)
        throw new Error(`Webhook delivery failed: ${failure}`);
}
//# sourceMappingURL=projectWebhooks.js.map