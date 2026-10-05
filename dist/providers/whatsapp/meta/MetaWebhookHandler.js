import { hmacSha256, safeEqual } from '../../../shared/utils/crypto.js';
/** Meta signs the raw body with the app secret: X-Hub-Signature-256: sha256=<hex>. */
export function verifyMetaSignature(rawBody, header, appSecret) {
    if (!rawBody || !header?.startsWith('sha256='))
        return false;
    return safeEqual(header, `sha256=${hmacSha256(appSecret, rawBody)}`);
}
/** Splits one webhook POST into individually processable (and de-duplicable) events. */
export function extractMetaEvents(body) {
    const events = [];
    for (const entry of body?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
            const value = change?.value ?? {};
            if (change?.field === 'messages') {
                for (const s of value.statuses ?? []) {
                    events.push({
                        eventType: 'status',
                        externalEventId: s?.id && s?.status ? `status:${s.id}:${s.status}` : null,
                        payload: { ...s, phone_number_id: value.metadata?.phone_number_id },
                    });
                }
                for (const m of value.messages ?? []) {
                    events.push({
                        eventType: 'message',
                        externalEventId: m?.id ? `message:${m.id}` : null,
                        payload: { ...m, phone_number_id: value.metadata?.phone_number_id },
                    });
                }
            }
            else if (change?.field === 'message_template_status_update') {
                events.push({
                    eventType: 'template_status',
                    externalEventId: value.message_template_id ? `template:${value.message_template_id}:${value.event}:${entry.time ?? ''}` : null,
                    payload: value,
                });
            }
            else {
                events.push({ eventType: 'other', externalEventId: null, payload: { field: change?.field, value } });
            }
        }
    }
    return events;
}
const STATUS_MAP = {
    sent: 'SENT',
    delivered: 'DELIVERED',
    read: 'READ',
    failed: 'FAILED',
};
export function toReceipt(payload) {
    const status = STATUS_MAP[payload.status];
    if (!status || !payload.id)
        return null;
    const error = payload.errors?.[0];
    return {
        provider: 'META_CLOUD',
        providerMessageId: payload.id,
        status,
        timestamp: payload.timestamp ? new Date(Number(payload.timestamp) * 1000) : new Date(),
        errorCode: error?.code ? String(error.code) : undefined,
        errorMessage: error ? (error.error_data?.details ?? error.message ?? error.title) : undefined,
    };
}
//# sourceMappingURL=MetaWebhookHandler.js.map