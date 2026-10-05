import { randomBytes } from 'node:crypto';
import { randomToken, sha256 } from '../../../shared/utils/crypto.js';
/**
 * Key format: vmp_<12 hex prefix>.<43 char secret>
 * The prefix is stored in clear for lookup; only SHA-256(full key) is stored. Keys are 256-bit
 * random, so a fast hash is appropriate (no dictionary to attack, unlike passwords).
 */
const KEY_PATTERN = /^(vmp_[0-9a-f]{12})\.([A-Za-z0-9_-]{32,})$/;
export function generateApiKey() {
    const prefix = `vmp_${randomBytes(6).toString('hex')}`;
    const key = `${prefix}.${randomToken(32)}`;
    return { key, prefix, hash: sha256(key) };
}
export function parseApiKey(key) {
    const m = KEY_PATTERN.exec(key);
    return m ? { prefix: m[1], hash: sha256(key) } : null;
}
//# sourceMappingURL=apiKey.js.map