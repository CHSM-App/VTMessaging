import { ProviderError, toProviderError } from '../contracts/errors.js';
import type {
  HealthStatus,
  MetaStatus,
  ProviderHealth,
  SendMediaRequest,
  SendResult,
  SendTemplateRequest,
  SendTextRequest,
} from '../contracts/types.js';
import type { WhatsAppProvider } from '../contracts/WhatsAppProvider.js';
import { MetaClient } from './MetaClient.js';

export interface MetaInstanceConfig {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  apiVersion: string;
  webhookVerifiedAt?: string | null;
}

export interface MetaHooks {
  onStatus(status: MetaStatus, detail: string | null, health: HealthStatus): void;
  onConnected(phoneNumber: string): void;
}

interface PhoneNumberInfo {
  display_phone_number?: string;
  verified_name?: string;
  platform_type?: string;
  quality_rating?: string;
}

/**
 * Meta WhatsApp Cloud API. Never reports READY unless Meta itself confirmed credentials,
 * phone registration and webhook verification.
 */
export class MetaCloudProvider implements WhatsAppProvider {
  readonly type = 'META_CLOUD' as const;
  private consecutiveFailures = 0;
  private lastSuccessAt?: Date;
  private lastValidatedAt?: Date;
  private lastError?: string;

  constructor(
    readonly instanceId: string,
    private readonly cfg: MetaInstanceConfig,
    private status: MetaStatus,
    private readonly hooks: MetaHooks,
    private readonly client = new MetaClient(cfg.accessToken, cfg.apiVersion),
  ) {}

  /** For Meta, "connect" = validate the configuration against Meta and walk the lifecycle. */
  async connect(): Promise<void> {
    const { wabaId, phoneNumberId, accessToken } = this.cfg;
    if (!wabaId || !phoneNumberId || !accessToken) {
      return this.setStatus('CONFIG_ERROR', 'WABA ID, phone number ID and access token are required');
    }
    this.setStatus('CONFIGURING');

    let phone: PhoneNumberInfo;
    try {
      await this.client.call('GET', `${encodeURIComponent(wabaId)}?fields=id,name`);
      phone = await this.client.call<PhoneNumberInfo>(
        'GET',
        `${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,platform_type,quality_rating`,
      );
    } catch (e) {
      const err = toProviderError(e);
      this.lastError = err.message;
      const authProblem = err.code === 'AUTH_FAILED' || err.code === 'INVALID_CREDENTIALS';
      return this.setStatus(authProblem ? 'AUTH_ERROR' : 'CONFIG_ERROR', err.message);
    }
    this.lastValidatedAt = new Date();
    this.setStatus('CREDENTIALS_VALID', `${phone.verified_name ?? ''} ${phone.display_phone_number ?? ''}`.trim());
    const digits = phone.display_phone_number?.replace(/\D/g, '');
    if (digits) this.hooks.onConnected(digits);

    if (phone.platform_type !== 'CLOUD_API') {
      return this.setStatus(
        'PHONE_REGISTRATION_FAILED',
        `Phone number is not registered for the Cloud API (platform_type=${phone.platform_type ?? 'unknown'})`,
      );
    }
    this.setStatus('PHONE_REGISTERED');

    if (!this.cfg.webhookVerifiedAt) {
      return this.setStatus('PHONE_REGISTERED', 'Waiting for Meta webhook verification (set the callback URL in the Meta app)');
    }
    this.setStatus('WEBHOOK_VERIFIED');
    this.setStatus('READY', phone.quality_rating ? `Quality rating: ${phone.quality_rating}` : null);
  }

  async disconnect(): Promise<void> {
    // Stateless HTTP provider: nothing to close.
  }

  async getStatus() {
    return this.status;
  }

  async getHealth(): Promise<ProviderHealth> {
    return {
      status: this.health(),
      details: {
        status: this.status,
        consecutiveFailures: this.consecutiveFailures,
        lastSuccessAt: this.lastSuccessAt ?? null,
        lastValidatedAt: this.lastValidatedAt ?? null,
        webhookVerifiedAt: this.cfg.webhookVerifiedAt ?? null,
        lastError: this.lastError ?? null,
      },
    };
  }

  sendText(req: SendTextRequest) {
    return this.send(req.to, { type: 'text', text: { body: req.body, preview_url: false } });
  }

  sendImage(req: SendMediaRequest) {
    return this.send(req.to, { type: 'image', image: { link: req.url, caption: req.caption } });
  }

  sendDocument(req: SendMediaRequest) {
    return this.send(req.to, { type: 'document', document: { link: req.url, caption: req.caption, filename: req.filename } });
  }

  async sendTemplate(req: SendTemplateRequest) {
    if (!req.approved) {
      throw new ProviderError('TEMPLATE_NOT_APPROVED', `Template "${req.name}" (${req.language}) is not approved by Meta`);
    }
    return this.send(req.to, {
      type: 'template',
      template: {
        name: req.name,
        language: { code: req.language },
        components: req.variables.length
          ? [{ type: 'body', parameters: req.variables.map((text) => ({ type: 'text', text })) }]
          : undefined,
      },
    });
  }

  private async send(to: string, payload: Record<string, unknown>): Promise<SendResult> {
    if (this.status !== 'READY') {
      throw new ProviderError('PROVIDER_NOT_READY', `Meta instance is ${this.status}, not READY`);
    }
    try {
      const res = await this.client.call<{ messages?: { id: string }[] }>(
        'POST',
        `${encodeURIComponent(this.cfg.phoneNumberId)}/messages`,
        { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload },
        { isSend: true },
      );
      const id = res.messages?.[0]?.id;
      if (!id) throw new ProviderError('SEND_OUTCOME_UNKNOWN', 'Meta accepted the request but returned no message id');
      this.consecutiveFailures = 0;
      this.lastSuccessAt = new Date();
      return { providerMessageId: id };
    } catch (e) {
      const err = toProviderError(e);
      if (err.code !== 'INVALID_RECIPIENT') this.consecutiveFailures++;
      this.lastError = err.message;
      throw err;
    }
  }

  private health(): HealthStatus {
    if (this.status !== 'READY') return 'UNAVAILABLE';
    return this.consecutiveFailures >= 3 ? 'DEGRADED' : 'HEALTHY';
  }

  private setStatus(status: MetaStatus, detail: string | null = null) {
    this.status = status;
    this.hooks.onStatus(status, detail, this.health());
  }
}
