import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { extractMetaEvents, toReceipt, verifyMetaSignature } from '../../../providers/whatsapp/meta/MetaWebhookHandler.js';
import { enqueueInstanceAction, enqueueProviderEvent } from '../../../queue/queues.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { safeEqual } from '../../../shared/utils/crypto.js';
import { SYSTEM, audit } from '../../audit/application/audit.js';
import { applyReceipt } from '../../messaging/application/messageEvents.js';
import { applyTemplateStatusWebhook } from '../../templates/application/templateUseCases.js';
import { markMetaWebhookVerified } from '../../whatsapp-instances/infrastructure/instanceRepository.js';
import * as repo from '../infrastructure/webhookRepository.js';

/** GET /webhooks/meta - Meta's subscription handshake. Returns the challenge to echo. */
export async function verifyMetaSubscription(q: Record<string, unknown>): Promise<string> {
  const token = env.META_WEBHOOK_VERIFY_TOKEN;
  const given = typeof q['hub.verify_token'] === 'string' ? q['hub.verify_token'] : '';
  if (q['hub.mode'] !== 'subscribe' || !token || !safeEqual(given, token)) {
    throw new AppError(403, 'WEBHOOK_VERIFICATION_FAILED', 'Webhook verification failed');
  }
  const instances = await markMetaWebhookVerified();
  for (const { id } of instances) await enqueueInstanceAction(id, 'reload'); // re-run validation -> READY
  await audit(SYSTEM, 'webhook.meta_verified', 'provider', 'META_CLOUD', { instances: instances.length });
  return String(q['hub.challenge'] ?? '');
}

/** POST /webhooks/meta - verify signature, store each event (deduplicated), process asynchronously. */
export async function receiveMetaWebhook(rawBody: Buffer | undefined, signature: string | undefined, body: unknown) {
  if (!env.META_APP_SECRET) throw new AppError(503, 'META_NOT_CONFIGURED', 'META_APP_SECRET is not configured');
  if (!verifyMetaSignature(rawBody, signature, env.META_APP_SECRET)) {
    throw new AppError(401, 'INVALID_SIGNATURE', 'Invalid webhook signature');
  }
  let stored = 0;
  for (const event of extractMetaEvents(body)) {
    const id = await repo.insertWebhookEvent('META_CLOUD', event);
    if (!id) continue; // duplicate delivery from Meta
    stored++;
    await enqueueProviderEvent(id).catch((err) => logger.error({ err, eventId: id }, 'Queueing webhook event failed; recovery sweep will retry'));
  }
  return { stored };
}

/** Worker: turns a stored provider event into message/template updates. */
export async function processProviderEvent(eventId: string) {
  const ev = await repo.getWebhookEvent(eventId);
  if (!ev || ev.processed) return;
  try {
    if (ev.eventType === 'status') {
      const receipt = toReceipt(ev.payload);
      if (receipt) await applyReceipt(receipt);
    } else if (ev.eventType === 'template_status') {
      await applyTemplateStatusWebhook(ev.payload);
    }
    // 'message' (incoming) and 'other' events are stored for inspection only.
    await repo.markWebhookEvent(eventId, null);
  } catch (err) {
    await repo.markWebhookEvent(eventId, (err as Error).message);
    throw err;
  }
}
