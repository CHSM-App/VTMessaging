import { hmacSha256, safeEqual } from '../../../shared/utils/crypto.js';

/**
 * Project webhook signature (documented in docs/security.md):
 *   X-Vengurla-Signature: sha256=HMAC_SHA256(secret, `${X-Vengurla-Timestamp}.${rawBody}`)
 */
export function signWebhook(secret: string, timestamp: string, body: string) {
  return `sha256=${hmacSha256(secret, `${timestamp}.${body}`)}`;
}

/** Reference verification for receivers (also used in tests). Rejects stale timestamps (replay). */
export function verifyWebhookSignature(secret: string, timestamp: string, body: string, signature: string, toleranceSeconds = 300) {
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  return Number.isFinite(age) && age <= toleranceSeconds && safeEqual(signWebhook(secret, timestamp, body), signature);
}
