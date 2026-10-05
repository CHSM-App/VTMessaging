export type ProviderType = 'BAILEYS' | 'META_CLOUD';

export type BaileysStatus =
  | 'CREATING'
  | 'WAITING_FOR_PAIRING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'ERROR';

export type MetaStatus =
  | 'CREATED'
  | 'CONFIGURING'
  | 'CREDENTIALS_VALID'
  | 'PHONE_REGISTERED'
  | 'WEBHOOK_VERIFIED'
  | 'READY'
  | 'CONFIG_ERROR'
  | 'AUTH_ERROR'
  | 'PHONE_REGISTRATION_FAILED'
  | 'WEBHOOK_ERROR';

export type ProviderStatus = BaileysStatus | MetaStatus;
export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';

export interface ProviderHealth {
  status: HealthStatus;
  details: Record<string, unknown>;
}

interface SendBase {
  /** Recipient in international format, digits only. */
  to: string;
  /** Our attempt id; providers that allow client-side ids derive the provider message id from it. */
  clientMessageId: string;
}

export interface SendTextRequest extends SendBase {
  body: string;
}

export interface SendMediaRequest extends SendBase {
  url: string;
  caption?: string;
  filename?: string;
  mimeType?: string;
}

export interface SendTemplateRequest extends SendBase {
  name: string;
  language: string;
  variables: string[];
  /** Template body with variables substituted (used by providers that don't need Meta templates). */
  renderedText: string;
  /** Meta approval state as last synced from Meta. */
  approved: boolean;
}

export interface SendResult {
  providerMessageId: string;
}

/** Status updates providers report after a message was accepted. */
export interface ProviderMessageStatus {
  provider: ProviderType;
  providerMessageId: string;
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  timestamp: Date;
  errorCode?: string;
  errorMessage?: string;
}
