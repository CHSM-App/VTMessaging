// Password hashing with Node's built-in scrypt. Format: scrypt$<saltB64>$<hashB64>
// Kept dependency-free so database/scripts/seed.ts can import it directly.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const KEYLEN = 64;
function derive(password, salt) {
    return new Promise((resolve, reject) => scrypt(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))));
}
export async function hashPassword(password) {
    const salt = randomBytes(16);
    return `scrypt$${salt.toString('base64')}$${(await derive(password, salt)).toString('base64')}`;
}
export async function verifyPassword(password, stored) {
    const [algo, saltB64, hashB64] = stored.split('$');
    if (algo !== 'scrypt' || !saltB64 || !hashB64)
        return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await derive(password, Buffer.from(saltB64, 'base64'));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}
//# sourceMappingURL=password.js.map