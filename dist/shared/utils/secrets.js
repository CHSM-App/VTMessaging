import { env } from '../../config/env.js';
import { createCipher } from './crypto.js';
/** Process-wide cipher for secrets at rest. */
export const secrets = createCipher(env.ENCRYPTION_KEY);
//# sourceMappingURL=secrets.js.map