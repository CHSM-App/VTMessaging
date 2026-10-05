import { ProviderError, toProviderError } from '../contracts/errors.js';
import { MetaClient } from './MetaClient.js';
/**
 * Meta WhatsApp Cloud API. Never reports READY unless Meta itself confirmed credentials,
 * phone registration and webhook verification.
 */
export class MetaCloudProvider {
    instanceId;
    cfg;
    status;
    hooks;
    client;
    type = 'META_CLOUD';
    consecutiveFailures = 0;
    lastSuccessAt;
    lastValidatedAt;
    lastError;
    constructor(instanceId, cfg, status, hooks, client = new MetaClient(cfg.accessToken, cfg.apiVersion)) {
        this.instanceId = instanceId;
        this.cfg = cfg;
        this.status = status;
        this.hooks = hooks;
        this.client = client;
    }
    /** For Meta, "connect" = validate the configuration against Meta and walk the lifecycle. */
    async connect() {
        const { wabaId, phoneNumberId, accessToken } = this.cfg;
        if (!wabaId || !phoneNumberId || !accessToken) {
            return this.setStatus('CONFIG_ERROR', 'WABA ID, phone number ID and access token are required');
        }
        this.setStatus('CONFIGURING');
        let phone;
        try {
            await this.client.call('GET', `${encodeURIComponent(wabaId)}?fields=id,name`);
            phone = await this.client.call('GET', `${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,platform_type,quality_rating`);
        }
        catch (e) {
            const err = toProviderError(e);
            this.lastError = err.message;
            const authProblem = err.code === 'AUTH_FAILED' || err.code === 'INVALID_CREDENTIALS';
            return this.setStatus(authProblem ? 'AUTH_ERROR' : 'CONFIG_ERROR', err.message);
        }
        this.lastValidatedAt = new Date();
        this.setStatus('CREDENTIALS_VALID', `${phone.verified_name ?? ''} ${phone.display_phone_number ?? ''}`.trim());
        const digits = phone.display_phone_number?.replace(/\D/g, '');
        if (digits)
            this.hooks.onConnected(digits);
        if (phone.platform_type !== 'CLOUD_API') {
            return this.setStatus('PHONE_REGISTRATION_FAILED', `Phone number is not registered for the Cloud API (platform_type=${phone.platform_type ?? 'unknown'})`);
        }
        this.setStatus('PHONE_REGISTERED');
        if (!this.cfg.webhookVerifiedAt) {
            return this.setStatus('PHONE_REGISTERED', 'Waiting for Meta webhook verification (set the callback URL in the Meta app)');
        }
        this.setStatus('WEBHOOK_VERIFIED');
        this.setStatus('READY', phone.quality_rating ? `Quality rating: ${phone.quality_rating}` : null);
    }
    async disconnect() {
        // Stateless HTTP provider: nothing to close.
    }
    async getStatus() {
        return this.status;
    }
    async getHealth() {
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
    sendText(req) {
        return this.send(req.to, { type: 'text', text: { body: req.body, preview_url: false } });
    }
    sendImage(req) {
        return this.send(req.to, { type: 'image', image: { link: req.url, caption: req.caption } });
    }
    sendDocument(req) {
        return this.send(req.to, { type: 'document', document: { link: req.url, caption: req.caption, filename: req.filename } });
    }
    async sendTemplate(req) {
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
    async send(to, payload) {
        if (this.status !== 'READY') {
            throw new ProviderError('PROVIDER_NOT_READY', `Meta instance is ${this.status}, not READY`);
        }
        try {
            const res = await this.client.call('POST', `${encodeURIComponent(this.cfg.phoneNumberId)}/messages`, { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }, { isSend: true });
            const id = res.messages?.[0]?.id;
            if (!id)
                throw new ProviderError('SEND_OUTCOME_UNKNOWN', 'Meta accepted the request but returned no message id');
            this.consecutiveFailures = 0;
            this.lastSuccessAt = new Date();
            return { providerMessageId: id };
        }
        catch (e) {
            const err = toProviderError(e);
            if (err.code !== 'INVALID_RECIPIENT')
                this.consecutiveFailures++;
            this.lastError = err.message;
            throw err;
        }
    }
    health() {
        if (this.status !== 'READY')
            return 'UNAVAILABLE';
        return this.consecutiveFailures >= 3 ? 'DEGRADED' : 'HEALTHY';
    }
    setStatus(status, detail = null) {
        this.status = status;
        this.hooks.onStatus(status, detail, this.health());
    }
}
//# sourceMappingURL=MetaCloudProvider.js.map