import type { ProviderStatus, ProviderType } from '../../../providers/whatsapp/contracts/types.js';

export const PROVIDERS = ['BAILEYS', 'META_CLOUD'] as const satisfies readonly ProviderType[];

export const initialStatus = (provider: ProviderType): ProviderStatus => (provider === 'BAILEYS' ? 'CREATING' : 'CREATED');

/** Stored in whatsapp_instances.provider_config (JSON). Secrets are encrypted. */
export interface MetaStoredConfig {
  wabaId: string;
  phoneNumberId: string;
  accessTokenEnc: string;
  appId?: string;
  webhookVerifiedAt?: string | null;
}

/** What the API may show: never the token itself. */
export function publicConfig(provider: ProviderType, config: Record<string, any>) {
  if (provider !== 'META_CLOUD') return {};
  return {
    wabaId: config.wabaId ?? null,
    phoneNumberId: config.phoneNumberId ?? null,
    appId: config.appId ?? null,
    accessTokenConfigured: !!config.accessTokenEnc,
    webhookVerifiedAt: config.webhookVerifiedAt ?? null,
  };
}
