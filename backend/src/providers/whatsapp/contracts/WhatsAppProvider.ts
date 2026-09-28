import type {
  ProviderHealth,
  ProviderStatus,
  ProviderType,
  SendMediaRequest,
  SendResult,
  SendTemplateRequest,
  SendTextRequest,
} from './types.js';

/**
 * The only thing the application layer knows about WhatsApp providers.
 * Send methods throw ProviderError (see errors.ts) on failure.
 */
export interface WhatsAppProvider {
  readonly type: ProviderType;
  readonly instanceId: string;

  connect(): Promise<void>;
  /** logout=true also ends the WhatsApp session (Baileys: unpair and delete auth). */
  disconnect(options?: { logout?: boolean }): Promise<void>;
  getHealth(): Promise<ProviderHealth>;
  getStatus(): Promise<ProviderStatus>;

  sendText(request: SendTextRequest): Promise<SendResult>;
  sendImage(request: SendMediaRequest): Promise<SendResult>;
  sendDocument(request: SendMediaRequest): Promise<SendResult>;
  sendTemplate(request: SendTemplateRequest): Promise<SendResult>;
}

export type { ProviderHealth, ProviderStatus, ProviderType } from './types.js';
