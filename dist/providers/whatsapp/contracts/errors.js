const SEMANTICS = {
    PROVIDER_NOT_CONNECTED: { sendState: 'NOT_SENT', retryable: true, fallbackAllowed: true },
    PROVIDER_NOT_READY: { sendState: 'NOT_SENT', retryable: false, fallbackAllowed: true },
    PROVIDER_UNAVAILABLE: { sendState: 'NOT_SENT', retryable: true, fallbackAllowed: true },
    AUTH_FAILED: { sendState: 'NOT_SENT', retryable: false, fallbackAllowed: true },
    INVALID_CREDENTIALS: { sendState: 'NOT_SENT', retryable: false, fallbackAllowed: true },
    NETWORK_ERROR: { sendState: 'NOT_SENT', retryable: true, fallbackAllowed: true },
    RATE_LIMITED: { sendState: 'NOT_SENT', retryable: true, fallbackAllowed: true },
    INVALID_RECIPIENT: { sendState: 'NOT_SENT', retryable: false, fallbackAllowed: false },
    INVALID_TEMPLATE: { sendState: 'NOT_SENT', retryable: false, fallbackAllowed: true },
    TEMPLATE_NOT_APPROVED: { sendState: 'NOT_SENT', retryable: false, fallbackAllowed: true },
    MEDIA_UNAVAILABLE: { sendState: 'NOT_SENT', retryable: true, fallbackAllowed: true },
    INVALID_REQUEST: { sendState: 'NOT_SENT', retryable: false, fallbackAllowed: false },
    SEND_TIMEOUT: { sendState: 'UNKNOWN', retryable: false, fallbackAllowed: false },
    SEND_OUTCOME_UNKNOWN: { sendState: 'UNKNOWN', retryable: false, fallbackAllowed: false },
};
export class ProviderError extends Error {
    code;
    providerMessageId;
    sendState;
    retryable;
    fallbackAllowed;
    constructor(code, message, 
    /** Provider message id we attempted with, if known (lets late receipts resolve UNKNOWN). */
    providerMessageId, overrides = {}) {
        super(message);
        this.code = code;
        this.providerMessageId = providerMessageId;
        this.name = 'ProviderError';
        this.sendState = overrides.sendState ?? SEMANTICS[code].sendState;
        this.retryable = overrides.retryable ?? SEMANTICS[code].retryable;
        this.fallbackAllowed = overrides.fallbackAllowed ?? SEMANTICS[code].fallbackAllowed;
    }
}
/** Anything a provider throws that is not a ProviderError is treated as ambiguous (UNKNOWN) - the safe default. */
export function toProviderError(err) {
    if (err instanceof ProviderError)
        return err;
    return new ProviderError('SEND_OUTCOME_UNKNOWN', `Unexpected provider error: ${err?.message ?? String(err)}`);
}
//# sourceMappingURL=errors.js.map