import sql from 'mssql';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MIGRATIONS_DIR = join(ROOT, 'migrations');

// Shares the backend's .env so there is one source of DB credentials. Real env vars win.
try {
  process.loadEnvFile(join(ROOT, '..', 'backend', '.env'));
} catch {
  /* no .env file: rely on the process environment */
}

export async function connect(): Promise<sql.ConnectionPool> {
  const env = process.env;
  for (const k of ['MSSQL_HOST', 'MSSQL_DATABASE', 'MSSQL_USER', 'MSSQL_PASSWORD']) {
    if (!env[k]) throw new Error(`Missing environment variable ${k} (set it in backend/.env)`);
  }
  return new sql.ConnectionPool({
    server: env.MSSQL_HOST!,
    port: Number(env.MSSQL_PORT ?? 1433),
    database: env.MSSQL_DATABASE!,
    user: env.MSSQL_USER!,
    password: env.MSSQL_PASSWORD!,
    options: {
      encrypt: env.MSSQL_ENCRYPT === 'true',
      trustServerCertificate: env.MSSQL_TRUST_SERVER_CERT !== 'false',
    },
  }).connect();
}

export async function ensureMigrationsTable(pool: sql.ConnectionPool) {
  await pool.request().batch(`
    IF OBJECT_ID('dbo.schema_migrations', 'U') IS NULL
    CREATE TABLE dbo.schema_migrations (
      id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_schema_migrations PRIMARY KEY CLUSTERED,
      migration_name  VARCHAR(255)      NOT NULL CONSTRAINT UQ_schema_migrations_name UNIQUE,
      executed_at     DATETIME2(3)      NOT NULL CONSTRAINT DF_schema_migrations_executed DEFAULT SYSUTCDATETIME()
    );`);
}

export function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
}

/** A migration file holds the "up" SQL, then an optional `-- ==== DOWN ====` section. */
export function readMigration(file: string): { up: string[]; down: string[] } {
  const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  const [up, down = ''] = text.split(/^--\s*=+\s*DOWN\s*=+\s*$/m);
  return { up: splitBatches(up), down: splitBatches(down) };
}

/** Splits on T-SQL `GO` batch separators (the driver cannot execute GO itself). */
export function splitBatches(text: string): string[] {
  return text
    .split(/^\s*GO\s*;?\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b.replace(/--.*$/gm, '').trim().length > 0);
}

/** Runs all batches in one transaction; SQL Server DDL is transactional. */
export async function runInTransaction(
  pool: sql.ConnectionPool,
  batches: string[],
  after: (tx: sql.Transaction) => Promise<unknown>,
) {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const b of batches) await new sql.Request(tx).batch(b);
    await after(tx);
    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

export { sql };
