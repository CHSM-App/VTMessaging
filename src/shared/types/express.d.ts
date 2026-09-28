import type { AdminPrincipal } from '../../modules/auth/domain/auth.js';
import type { ProjectPrincipal } from '../../modules/api-keys/domain/apiKey.js';

declare global {
  namespace Express {
    interface Request {
      admin?: AdminPrincipal;
      project?: ProjectPrincipal;
      rawBody?: Buffer;
    }
  }
}

export {};
