export const PROVIDERS = ['BAILEYS', 'META_CLOUD'];
export const initialStatus = (provider) => (provider === 'BAILEYS' ? 'CREATING' : 'CREATED');
/** What the API may show: never the token itself. */
export function publicConfig(provider, config) {
    if (provider !== 'META_CLOUD')
        return {};
    return {
        wabaId: config.wabaId ?? null,
        phoneNumberId: config.phoneNumberId ?? null,
        appId: config.appId ?? null,
        accessTokenConfigured: !!config.accessTokenEnc,
        webhookVerifiedAt: config.webhookVerifiedAt ?? null,
    };
}
//# sourceMappingURL=instance.js.map