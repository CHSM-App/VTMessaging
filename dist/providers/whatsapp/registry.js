import { env } from '../../config/env.js';
import { secrets } from '../../shared/utils/secrets.js';
import { BaileysProvider } from './baileys/BaileysProvider.js';
import { ProviderError } from './contracts/errors.js';
import { MetaClient } from './meta/MetaClient.js';
import { MetaCloudProvider } from './meta/MetaCloudProvider.js';
export function createMetaClient(config) {
    if (!config.accessTokenEnc)
        throw new ProviderError('INVALID_CREDENTIALS', 'Meta access token is not configured');
    return new MetaClient(secrets.decrypt(config.accessTokenEnc), env.META_API_VERSION);
}
/**
 * Owns one live provider per instance (worker process only - Baileys sockets are stateful).
 * Concrete providers are created here and nowhere else.
 */
export class ProviderRegistry {
    loadInstance;
    events;
    log;
    providers = new Map();
    constructor(loadInstance, events, log) {
        this.loadInstance = loadInstance;
        this.events = events;
        this.log = log;
    }
    async get(instanceId) {
        const key = instanceId.toUpperCase();
        const existing = this.providers.get(key);
        if (existing)
            return existing;
        const instance = await this.loadInstance(key);
        if (!instance)
            throw new ProviderError('PROVIDER_NOT_READY', `Instance ${instanceId} not found or deleted`);
        const provider = this.create(instance);
        this.providers.set(key, provider);
        return provider;
    }
    /** Drops the cached provider (after a config change) without ending the WhatsApp session. */
    async reload(instanceId) {
        await this.remove(instanceId, { logout: false });
        return this.get(instanceId);
    }
    async remove(instanceId, opts) {
        const key = instanceId.toUpperCase();
        const provider = this.providers.get(key);
        this.providers.delete(key);
        await provider?.disconnect({ logout: opts.logout });
    }
    all() {
        return [...this.providers.values()];
    }
    async closeAll() {
        // Plain disconnect (no logout) so Baileys sessions survive restarts.
        await Promise.allSettled(this.all().map((p) => p.disconnect()));
        this.providers.clear();
    }
    create(instance) {
        const id = instance.id;
        if (instance.provider === 'BAILEYS') {
            return new BaileysProvider(id, BaileysProvider.authDirFor(env.BAILEYS_AUTH_DIR, id), {
                onStatus: (status, detail, health) => this.events.onStatus(id, status, detail, health),
                onQr: (qr) => this.events.onQr(id, qr),
                onConnected: (phone) => this.events.onConnected(id, phone),
                onReceipt: (r) => this.events.onReceipt(r),
            }, this.log.child({ instanceId: id, provider: 'BAILEYS' }), env.BAILEYS_SEND_TIMEOUT_MS);
        }
        const cfg = instance.providerConfig;
        return new MetaCloudProvider(id, {
            wabaId: cfg.wabaId,
            phoneNumberId: cfg.phoneNumberId,
            accessToken: cfg.accessTokenEnc ? secrets.decrypt(cfg.accessTokenEnc) : '', // empty -> connect() reports CONFIG_ERROR
            apiVersion: env.META_API_VERSION,
            webhookVerifiedAt: cfg.webhookVerifiedAt,
        }, instance.status, {
            onStatus: (status, detail, health) => this.events.onStatus(id, status, detail, health),
            onConnected: (phone) => this.events.onConnected(id, phone),
        });
    }
}
//# sourceMappingURL=registry.js.map