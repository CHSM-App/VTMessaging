/**
 * Normalized provider errors. Every provider translates its own failures into these, so the
 * application layer can decide retry/fallback without knowing anything provider-specific.
 *
 * sendState is the key safety signal:
 *   NOT_SENT - the provider definitely did not accept the message -> fallback may be allowed
 *   UNKNOWN  - the request may have been accepted (e.g. timeout after sending) -> never resend blindly
 */
export type SendState = 'NOT_SENT' | 'UNKNOWN';

export type ProviderErrorCode =
  | 'PROVIDER_NOT_CONNECTED'
  | 'PROVIDER_NOT_READY'
  | 'PROVIDER_UNAVAILABLE'
  | 'AUTH_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'NETWORK_ERROR'
  | 'RATE_LIMITED'
  | 'INVALID_RECIPIENT'
  | 'INVALID_TEMPLATE'
  | 'TEMPLATE_NOT_APPROVED'
  | 'MEDIA_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'SEND_TIMEOUT'
  | 'SEND_OUTCOME_UNKNOWN';

interface Semantics {
  sendState: SendState;
  /** Temporary: the same send may succeed later. */
  retryable: boolean;
  /** Another instance/provider could succeed (false for problems with the message itself). */
  fallbackAllowed: boolean;
}

const SEMANTICS: Record<ProviderErrorCode, Semantics> = {
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

export class ProviderError extends Error implements Semantics {
  readonly sendState: SendState;
  readonly retryable: boolean;
  readonly fallbackAllowed: boolean;

  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    /** Provider message id we attempted with, if known (lets late receipts resolve UNKNOWN). */
    public readonly providerMessageId?: string,
    overrides: Partial<Semantics> = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.sendState = overrides.sendState ?? SEMANTICS[code].sendState;
    this.retryable = overrides.retryable ?? SEMANTICS[code].retryable;
    this.fallbackAllowed = overrides.fallbackAllowed ?? SEMANTICS[code].fallbackAllowed;
  }
}

/** Anything a provider throws that is not a ProviderError is treated as ambiguous (UNKNOWN) - the safe default. */
export function toProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  return new ProviderError('SEND_OUTCOME_UNKNOWN', `Unexpected provider error: ${(err as Error)?.message ?? String(err)}`);
}
