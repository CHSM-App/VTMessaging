import { env } from '../../config/env.js';
import type { Logger } from '../../config/logger.js';
import { secrets } from '../../shared/utils/secrets.js';
import { BaileysProvider } from './baileys/BaileysProvider.js';
import { ProviderError } from './contracts/errors.js';
import type { HealthStatus, MetaStatus, ProviderMessageStatus, ProviderStatus, ProviderType } from './contracts/types.js';
import type { WhatsAppProvider } from './contracts/WhatsAppProvider.js';
import { MetaClient } from './meta/MetaClient.js';
import { MetaCloudProvider } from './meta/MetaCloudProvider.js';

export function createMetaClient(config: Record<string, any>) {
  if (!config.accessTokenEnc) throw new ProviderError('INVALID_CREDENTIALS', 'Meta access token is not configured');
  return new MetaClient(secrets.decrypt(config.accessTokenEnc), env.META_API_VERSION);
}

export interface RegistryInstance {
  id: string;
  provider: ProviderType;
  status: ProviderStatus;
  providerConfig: Record<string, any>;
}

/** Callbacks the worker wires to persistence + realtime. Providers stay unaware of MSSQL/Redis. */
export interface ProviderEvents {
  onStatus(instanceId: string, status: ProviderStatus, detail: string | null, health: HealthStatus): void;
  onQr(instanceId: string, qr: string | null): void;
  onConnected(instanceId: string, phoneNumber: string): void;
  onReceipt(receipt: ProviderMessageStatus): void;
}

/**
 * Owns one live provider per instance (worker process only - Baileys sockets are stateful).
 * Concrete providers are created here and nowhere else.
 */
export class ProviderRegistry {
  private providers = new Map<string, WhatsAppProvider>();

  constructor(
    private readonly loadInstance: (id: string) => Promise<RegistryInstance | null>,
    private readonly events: ProviderEvents,
    private readonly log: Logger,
  ) {}

  async get(instanceId: string): Promise<WhatsAppProvider> {
    const key = instanceId.toUpperCase();
    const existing = this.providers.get(key);
    if (existing) return existing;
    const instance = await this.loadInstance(key);
    if (!instance) throw new ProviderError('PROVIDER_NOT_READY', `Instance ${instanceId} not found or deleted`);
    const provider = this.create(instance);
    this.providers.set(key, provider);
    return provider;
  }

  /** Drops the cached provider (after a config change) without ending the WhatsApp session. */
  async reload(instanceId: string) {
    await this.remove(instanceId, { logout: false });
    return this.get(instanceId);
  }

  async remove(instanceId: string, opts: { logout: boolean }) {
    const key = instanceId.toUpperCase();
    const provider = this.providers.get(key);
    this.providers.delete(key);
    await provider?.disconnect({ logout: opts.logout });
  }

  all(): WhatsAppProvider[] {
    return [...this.providers.values()];
  }

  async closeAll() {
    // Plain disconnect (no logout) so Baileys sessions survive restarts.
    await Promise.allSettled(this.all().map((p) => p.disconnect()));
    this.providers.clear();
  }

  private create(instance: RegistryInstance): WhatsAppProvider {
    const id = instance.id;
    if (instance.provider === 'BAILEYS') {
      return new BaileysProvider(
        id,
        BaileysProvider.authDirFor(env.BAILEYS_AUTH_DIR, id),
        {
          onStatus: (status, detail, health) => this.events.onStatus(id, status, detail, health),
          onQr: (qr) => this.events.onQr(id, qr),
          onConnected: (phone) => this.events.onConnected(id, phone),
          onReceipt: (r) => this.events.onReceipt(r),
        },
        this.log.child({ instanceId: id, provider: 'BAILEYS' }),
        env.BAILEYS_SEND_TIMEOUT_MS,
      );
    }
    const cfg = instance.providerConfig;
    return new MetaCloudProvider(
      id,
      {
        wabaId: cfg.wabaId,
        phoneNumberId: cfg.phoneNumberId,
        accessToken: cfg.accessTokenEnc ? secrets.decrypt(cfg.accessTokenEnc) : '', // empty -> connect() reports CONFIG_ERROR
        apiVersion: env.META_API_VERSION,
        webhookVerifiedAt: cfg.webhookVerifiedAt,
      },
      instance.status as MetaStatus,
      {
        onStatus: (status, detail, health) => this.events.onStatus(id, status, detail, health),
        onConnected: (phone) => this.events.onConnected(id, phone),
      },
    );
  }
}
