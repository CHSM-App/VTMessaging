import { ProviderError } from '../contracts/errors.js';

interface GraphError {
  code?: number;
  message?: string;
  error_data?: { details?: string };
}

// Connection errors that prove the request never reached Meta.
const NEVER_SENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT']);

/** Thin Graph API client. All failures are normalized into ProviderError. */
export class MetaClient {
  constructor(
    private readonly accessToken: string,
    private readonly apiVersion: string,
  ) {}

  async call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, opts: { isSend?: boolean } = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`https://graph.facebook.com/${this.apiVersion}/${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      const err = e as Error & { cause?: { code?: string } };
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      if (opts.isSend && !NEVER_SENT.has(err.cause?.code ?? '')) {
        throw new ProviderError(
          timedOut ? 'SEND_TIMEOUT' : 'SEND_OUTCOME_UNKNOWN',
          `Meta API request interrupted (${err.cause?.code ?? err.name}); the message may have been accepted`,
        );
      }
      throw new ProviderError('NETWORK_ERROR', `Could not reach Meta API: ${err.cause?.code ?? err.message}`);
    }
    const json = (await res.json().catch(() => ({}))) as { error?: GraphError };
    if (res.ok) return json as T;
    // Meta echoes the token back in some errors ("Malformed access token EAAG..."); never let it reach logs/DB/UI.
    const error = json.error && {
      ...json.error,
      message: redact(json.error.message, this.accessToken),
      error_data: json.error.error_data && { details: redact(json.error.error_data.details, this.accessToken) },
    };
    throw mapMetaError(res.status, error, opts.isSend ?? false);
  }
}

export function redact(text: string | undefined, secret?: string): string | undefined {
  if (!text) return text;
  const out = secret ? text.split(secret).join('[REDACTED]') : text;
  return out.replace(/EAA[A-Za-z0-9_-]{10,}/g, '[REDACTED]');
}

export function mapMetaError(httpStatus: number, error: GraphError | undefined, isSend: boolean): ProviderError {
  const code = error?.code ?? 0;
  const msg = `Meta API error ${code || httpStatus}: ${error?.error_data?.details ?? error?.message ?? 'unknown error'}`;

  if (code === 190 || httpStatus === 401) return new ProviderError('AUTH_FAILED', msg);
  if (code === 10 || code === 200 || httpStatus === 403) return new ProviderError('INVALID_CREDENTIALS', msg);
  if ([4, 80007, 130429, 131048, 131056, 613].includes(code)) return new ProviderError('RATE_LIMITED', msg);
  if (code === 131026 || code === 131021) return new ProviderError('INVALID_RECIPIENT', msg);
  if (code >= 132000 && code < 133000) return new ProviderError('INVALID_TEMPLATE', msg);
  if (code === 131052 || code === 131053) return new ProviderError('MEDIA_UNAVAILABLE', msg);
  if (code === 133010) return new ProviderError('PROVIDER_NOT_READY', msg); // phone number not registered
  if (code === 131016 || httpStatus === 503) return new ProviderError('PROVIDER_UNAVAILABLE', msg);
  if (httpStatus >= 500) {
    // A 5xx on send does not prove the message was rejected.
    return isSend ? new ProviderError('SEND_OUTCOME_UNKNOWN', msg) : new ProviderError('PROVIDER_UNAVAILABLE', msg);
  }
  // Other 4xx: rejected by this provider (nothing was sent); another provider may accept it.
  return new ProviderError('INVALID_REQUEST', msg, undefined, { fallbackAllowed: true });
}
