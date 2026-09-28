import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';

// backend/ root, from both src/config and dist/config. Hosts like iisnode don't guarantee the cwd.
const BACKEND_ROOT = fileURLToPath(new URL('../../', import.meta.url));

try {
  process.loadEnvFile(resolve(BACKEND_ROOT, '.env')); // real environment variables take precedence
} catch {
  /* no .env file */
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // A number, or a named pipe when hosted by iisnode (IIS/Plesk).
  PORT: z.string().default('3000').transform((p) => (/^\d+$/.test(p) ? Number(p) : p)),
  // split  = API + worker processes, Redis/BullMQ queues (VPS).
  // single = one process, SQL Server as the queue, no Redis (shared hosting).
  RUN_MODE: z.enum(['split', 'single']).default('split'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  MSSQL_HOST: z.string().min(1),
  MSSQL_PORT: z.coerce.number().int().default(1433),
  MSSQL_DATABASE: z.string().min(1),
  MSSQL_USER: z.string().min(1),
  MSSQL_PASSWORD: z.string().min(1),
  MSSQL_ENCRYPT: z.stringbool().default(false),
  MSSQL_TRUST_SERVER_CERT: z.stringbool().default(true),

  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().default(6379),
  REDIS_PASSWORD: z.string().optional().transform((v) => v || undefined),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),

  BAILEYS_AUTH_DIR: z.string().default('./storage/baileys/instances').transform((p) => resolve(BACKEND_ROOT, p)),
  BAILEYS_SEND_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  META_API_VERSION: z.string().default('v21.0'),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional().transform((v) => v || undefined),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional().transform((v) => v || undefined),

  FRONTEND_URL: z.string().default('http://localhost:5173'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_REQUESTS_PER_WINDOW: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_MESSAGES_PER_WINDOW: z.coerce.number().int().positive().default(60),

  SEND_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(6),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Logger depends on env, so this one message goes straight to stderr.
  process.stderr.write(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}\n`);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const singleProcess = env.RUN_MODE === 'single';
