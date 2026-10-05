import makeWASocket, {
  type AnyMessageContent,
  Browsers,
  type ConnectionState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  useMultiFileAuthState,
  type WAMessageUpdate,
  type WASocket,
} from 'baileys';
import { createHash } from 'node:crypto';
import { access, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import QRCode from 'qrcode';
import type { Logger } from '../../../config/logger.js';
import { ProviderError } from '../contracts/errors.js';
import type {
  BaileysStatus,
  HealthStatus,
  ProviderHealth,
  ProviderMessageStatus,
  SendMediaRequest,
  SendResult,
  SendTemplateRequest,
  SendTextRequest,
} from '../contracts/types.js';
import type { WhatsAppProvider } from '../contracts/WhatsAppProvider.js';
import { TimeoutError, fetchMedia, mimeFromFilename, withTimeout } from '../media.js';

export interface BaileysHooks {
  onStatus(status: BaileysStatus, detail: string | null, health: HealthStatus): void;
  onQr(qrDataUrl: string | null): void;
  onConnected(phoneNumber: string): void;
  onReceipt(receipt: ProviderMessageStatus): void;
}

// proto.WebMessageInfo.Status: ERROR=0 PENDING=1 SERVER_ACK=2 DELIVERY_ACK=3 READ=4 PLAYED=5
const RECEIPTS: Record<number, ProviderMessageStatus['status']> = { 0: 'FAILED', 2: 'SENT', 3: 'DELIVERED', 4: 'READ', 5: 'READ' };

export class BaileysProvider implements WhatsAppProvider {
  readonly type = 'BAILEYS' as const;
  private sock?: WASocket;
  private status: BaileysStatus = 'DISCONNECTED';
  private stopping = false;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private consecutiveFailures = 0;
  private lastSuccessAt?: Date;
  private lastConnectedAt?: Date;
  private lastDisconnectReason?: string;

  constructor(
    readonly instanceId: string,
    private readonly authDir: string,
    private readonly hooks: BaileysHooks,
    private readonly log: Logger,
    private readonly sendTimeoutMs: number,
  ) {}

  static instanceDirFor(root: string, instanceId: string) {
    return join(root, instanceId.toLowerCase());
  }

  static authDirFor(root: string, instanceId: string) {
    return join(BaileysProvider.instanceDirFor(root, instanceId), 'auth');
  }

  static async hasSession(authDir: string) {
    return access(join(authDir, 'creds.json')).then(
      () => true,
      () => false,
    );
  }

  /** WhatsApp message id derived from our attempt id, so we know it even if the send times out. */
  static messageIdFor(clientMessageId: string) {
    return '3EB0' + createHash('sha256').update(clientMessageId).digest('hex').slice(0, 36).toUpperCase();
  }

  async connect(): Promise<void> {
    if (this.sock) return;
    this.stopping = false;
    clearTimeout(this.reconnectTimer);
    await mkdir(this.authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const version = await fetchLatestBaileysVersion()
      .then((r) => r.version)
      .catch(() => undefined); // fall back to the version bundled with Baileys

    this.setStatus(state.creds.me ? 'CONNECTING' : 'WAITING_FOR_PAIRING');
    const sock = makeWASocket({
      auth: state,
      version,
      logger: this.log.child({ module: 'baileys' }, { level: 'warn' }) as any,
      browser: Browsers.ubuntu('Vengurla Messaging'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    this.sock = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u) => void this.onConnectionUpdate(sock, u));
    sock.ev.on('messages.update', (u) => this.onMessagesUpdate(u));
  }

  async disconnect(options: { logout?: boolean } = {}): Promise<void> {
    this.stopping = true;
    clearTimeout(this.reconnectTimer);
    const sock = this.sock;
    this.sock = undefined; // close events from this socket are now ignored
    if (sock) {
      if (options.logout) await sock.logout().catch(() => {});
      else sock.end(undefined);
    }
    // Let in-flight creds writes finish so the session on disk is never left half-written.
    await new Promise((r) => setTimeout(r, 500));
    if (options.logout) await rm(this.authDir, { recursive: true, force: true });
    this.hooks.onQr(null);
    this.setStatus('DISCONNECTED', options.logout ? 'Logged out; pair again to reconnect' : 'Disconnected');
  }

  async getStatus() {
    return this.status;
  }

  async getHealth(): Promise<ProviderHealth> {
    return {
      status: this.health(),
      details: {
        connection: this.status,
        consecutiveFailures: this.consecutiveFailures,
        reconnectAttempts: this.reconnectAttempts,
        lastSuccessAt: this.lastSuccessAt ?? null,
        lastConnectedAt: this.lastConnectedAt ?? null,
        lastDisconnectReason: this.lastDisconnectReason ?? null,
      },
    };
  }

  sendText(req: SendTextRequest) {
    return this.deliver(req.to, req.clientMessageId, async () => ({ text: req.body }));
  }

  sendImage(req: SendMediaRequest) {
    return this.deliver(req.to, req.clientMessageId, async () => {
      const media = await fetchMedia(req.url);
      return { image: media.data, caption: req.caption, mimetype: req.mimeType ?? media.contentType };
    });
  }

  sendDocument(req: SendMediaRequest) {
    return this.deliver(req.to, req.clientMessageId, async () => {
      const media = await fetchMedia(req.url);
      const fileName = req.filename ?? decodeURIComponent(new URL(req.url).pathname.split('/').pop() || 'document');
      return {
        document: media.data,
        fileName,
        caption: req.caption,
        mimetype: req.mimeType ?? mimeFromFilename(fileName) ?? media.contentType ?? 'application/octet-stream',
      };
    });
  }

  /** Baileys doesn't use Meta templates: the rendered template text is sent as a normal message. */
  sendTemplate(req: SendTemplateRequest) {
    return this.deliver(req.to, req.clientMessageId, async () => ({ text: req.renderedText }));
  }

  // --- internals -------------------------------------------------------------------------------

  private async deliver(to: string, clientMessageId: string, build: () => Promise<AnyMessageContent>): Promise<SendResult> {
    try {
      const sock = this.sock;
      if (!sock || this.status !== 'CONNECTED') {
        throw new ProviderError('PROVIDER_NOT_CONNECTED', `Baileys instance is ${this.status}`);
      }
      const content = await build();

      // Everything up to here happens before anything is sent: failures are NOT_SENT.
      let jid: string;
      try {
        const [r] = (await withTimeout(sock.onWhatsApp(to), 15_000)) ?? [];
        if (!r?.exists) throw new ProviderError('INVALID_RECIPIENT', `${to} is not registered on WhatsApp`);
        jid = r.jid;
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        throw new ProviderError('NETWORK_ERROR', `Recipient lookup failed: ${(e as Error).message}`);
      }

      // From here WhatsApp may have received the message: any failure is UNKNOWN, never retried blindly.
      const messageId = BaileysProvider.messageIdFor(clientMessageId);
      try {
        await withTimeout(sock.sendMessage(jid, content, { messageId }), this.sendTimeoutMs);
      } catch (e) {
        throw new ProviderError(
          e instanceof TimeoutError ? 'SEND_TIMEOUT' : 'SEND_OUTCOME_UNKNOWN',
          `Send did not complete cleanly: ${(e as Error).message}`,
          messageId,
        );
      }
      this.consecutiveFailures = 0;
      this.lastSuccessAt = new Date();
      return { providerMessageId: messageId };
    } catch (e) {
      if (!(e instanceof ProviderError) || e.code !== 'INVALID_RECIPIENT') this.consecutiveFailures++;
      throw e;
    }
  }

  private async onConnectionUpdate(sock: WASocket, u: Partial<ConnectionState>) {
    if (sock !== this.sock) return; // event from a socket we already replaced/closed

    if (u.qr) {
      this.setStatus('WAITING_FOR_PAIRING');
      this.hooks.onQr(await QRCode.toDataURL(u.qr, { margin: 1, width: 320 }));
    }

    if (u.connection === 'open') {
      this.reconnectAttempts = 0;
      this.lastConnectedAt = new Date();
      this.hooks.onQr(null);
      this.setStatus('CONNECTED');
      const phone = jidNormalizedUser(sock.user?.id ?? '').split('@')[0] ?? '';
      if (phone) this.hooks.onConnected(phone);
      this.log.info({ instanceId: this.instanceId, provider: this.type }, 'WhatsApp instance connected');
    }

    if (u.connection === 'close') {
      this.sock = undefined;
      const err = u.lastDisconnect?.error as { output?: { statusCode?: number }; message?: string } | undefined;
      const code = err?.output?.statusCode;
      this.lastDisconnectReason = (code && DisconnectReason[code]) || err?.message || 'unknown';
      this.log.warn({ instanceId: this.instanceId, provider: this.type, code, reason: this.lastDisconnectReason }, 'Baileys connection closed');

      if (this.stopping) return this.setStatus('DISCONNECTED');

      if (code === DisconnectReason.loggedOut) {
        await rm(this.authDir, { recursive: true, force: true });
        this.hooks.onQr(null);
        return this.setStatus('DISCONNECTED', 'Logged out from the phone. Connect again and scan a new QR code.');
      }
      if (code === DisconnectReason.connectionReplaced) {
        return this.setStatus('ERROR', 'This WhatsApp session was opened somewhere else (connection replaced).');
      }
      if (!sock.authState.creds.me && code === DisconnectReason.timedOut) {
        this.hooks.onQr(null);
        return this.setStatus('DISCONNECTED', 'QR code expired before pairing. Click Connect to get a new one.');
      }
      this.scheduleReconnect(code === DisconnectReason.restartRequired ? 0 : undefined);
    }
  }

  private scheduleReconnect(delayMs?: number) {
    this.reconnectAttempts++;
    const ms = delayMs ?? Math.min(60_000, 2_000 * 2 ** Math.min(this.reconnectAttempts - 1, 5));
    this.setStatus('RECONNECTING', `Reconnect attempt ${this.reconnectAttempts} in ${Math.round(ms / 1000)}s`);
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        this.sock = undefined;
        this.log.error({ err, instanceId: this.instanceId }, 'Baileys reconnect failed');
        this.scheduleReconnect();
      });
    }, ms);
  }

  private onMessagesUpdate(updates: WAMessageUpdate[]) {
    for (const { key, update } of updates) {
      const status = update.status != null ? RECEIPTS[update.status] : undefined;
      if (!key.fromMe || !key.id || !status) continue;
      this.hooks.onReceipt({ provider: 'BAILEYS', providerMessageId: key.id, status, timestamp: new Date() });
    }
  }

  private health(): HealthStatus {
    if (this.status === 'CONNECTED') return this.consecutiveFailures >= 3 ? 'DEGRADED' : 'HEALTHY';
    if (this.status === 'RECONNECTING' || this.status === 'CONNECTING') return 'DEGRADED';
    return 'UNAVAILABLE';
  }

  private setStatus(status: BaileysStatus, detail: string | null = null) {
    this.status = status;
    this.hooks.onStatus(status, detail, this.health());
  }
}
