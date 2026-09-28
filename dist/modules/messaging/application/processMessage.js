import { toProviderError } from '../../../providers/whatsapp/contracts/errors.js';
import { SETTLED_STATUSES, renderTemplate } from '../domain/message.js';
/**
 * Sends one message: priority instance first, then the fallback - but only when the failure was
 * definitely NOT_SENT. An ambiguous outcome (UNKNOWN) stops everything: no fallback, no retry.
 * Each call starts again from the priority instance, so a recovered primary is used again.
 */
export async function processMessage(messageId, deps, opts) {
    const msg = await deps.loadMessage(messageId);
    if (!msg || SETTLED_STATUSES.has(msg.status))
        return 'SKIPPED';
    // A previous run died between handing the message to a provider and recording the result.
    if (msg.status === 'SENDING') {
        await deps.transition(msg.id, 'UNKNOWN', {
            failureCode: 'INTERRUPTED_DURING_SEND',
            failureReason: 'Worker stopped while the message was being sent; delivery state is unknown',
        });
        return 'UNKNOWN';
    }
    await deps.transition(msg.id, 'PROCESSING');
    const route = await deps.loadRoute(msg.projectId);
    if (!route.length) {
        await deps.transition(msg.id, 'FAILED', {
            failureCode: 'NO_INSTANCE_AVAILABLE',
            failureReason: 'No enabled WhatsApp instance is configured for this project',
        });
        return 'FAILED';
    }
    let template = null;
    if (msg.messageType === 'TEMPLATE') {
        template = msg.templateId ? await deps.loadTemplate(msg.templateId) : null;
        if (!template) {
            await deps.transition(msg.id, 'FAILED', { failureCode: 'INVALID_TEMPLATE', failureReason: 'Template no longer exists' });
            return 'FAILED';
        }
    }
    const errors = [];
    for (const instance of route) {
        const attempt = await deps.startAttempt(msg.id, instance);
        await deps.transition(msg.id, 'SENDING', { instanceId: instance.id });
        try {
            const provider = await deps.getProvider(instance);
            const result = await send(provider, msg, attempt.id, template);
            await deps.finishAttempt(attempt.id, { status: 'SENT', providerMessageId: result.providerMessageId });
            await deps.transition(msg.id, 'SENT', {
                instanceId: instance.id,
                providerMessageId: result.providerMessageId,
                failureCode: null,
                failureReason: null,
            });
            return 'SENT';
        }
        catch (e) {
            const err = toProviderError(e);
            if (err.sendState === 'UNKNOWN') {
                await deps.finishAttempt(attempt.id, {
                    status: 'UNKNOWN',
                    providerMessageId: err.providerMessageId,
                    errorCode: err.code,
                    errorMessage: err.message,
                });
                await deps.transition(msg.id, 'UNKNOWN', {
                    instanceId: instance.id,
                    providerMessageId: err.providerMessageId,
                    failureCode: err.code,
                    failureReason: err.message,
                });
                return 'UNKNOWN';
            }
            await deps.finishAttempt(attempt.id, { status: 'FAILED', errorCode: err.code, errorMessage: err.message });
            await deps.transition(msg.id, 'PROCESSING');
            errors.push(err);
            if (!err.fallbackAllowed)
                break; // the message itself is the problem; another provider won't help
        }
    }
    const last = errors[errors.length - 1];
    const retryable = errors.some((e) => e.retryable) && errors.every((e) => e.fallbackAllowed || e.retryable);
    if (retryable && !opts.finalAttempt) {
        await deps.transition(msg.id, 'QUEUED', { failureCode: last.code, failureReason: last.message });
        return 'RETRY';
    }
    await deps.transition(msg.id, 'FAILED', { failureCode: last.code, failureReason: last.message });
    return 'FAILED';
}
function send(provider, msg, clientMessageId, template) {
    const base = { to: msg.recipient, clientMessageId };
    const c = msg.content;
    switch (msg.messageType) {
        case 'TEXT':
            return provider.sendText({ ...base, body: c.body });
        case 'IMAGE':
            return provider.sendImage({ ...base, url: c.url, caption: c.caption });
        case 'DOCUMENT':
            return provider.sendDocument({ ...base, url: c.url, caption: c.caption, filename: c.filename, mimeType: c.mimeType });
        case 'TEMPLATE': {
            const variables = c.variables ?? [];
            return provider.sendTemplate({
                ...base,
                name: template.name,
                language: template.language,
                variables,
                renderedText: renderTemplate(template.body, variables),
                approved: template.status === 'APPROVED',
            });
        }
    }
}
//# sourceMappingURL=processMessage.js.map