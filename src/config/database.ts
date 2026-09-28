import sql from 'mssql';
import { env } from './env.js';

let poolPromise: Promise<sql.ConnectionPool> | undefined;

export function db(): Promise<sql.ConnectionPool> {
  poolPromise ??= new sql.ConnectionPool({
    server: env.MSSQL_HOST,
    port: env.MSSQL_PORT,
    database: env.MSSQL_DATABASE,
    user: env.MSSQL_USER,
    password: env.MSSQL_PASSWORD,
    options: { encrypt: env.MSSQL_ENCRYPT, trustServerCertificate: env.MSSQL_TRUST_SERVER_CERT },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
  })
    .connect()
    .catch((err) => {
      poolPromise = undefined; // allow a later retry
      throw err;
    });
  return poolPromise;
}

export async function closeDb() {
  const p = poolPromise;
  poolPromise = undefined;
  if (p) await (await p).close();
}

/** Typed parameters: always declare the SQL type (avoids implicit conversions that kill index seeks). */
export type Params = Record<string, readonly [sql.ISqlType | sql.ISqlTypeFactory, unknown]>;
export type Tx = sql.Transaction;

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Runs a parameterized query and returns rows with camelCase keys. */
export async function query<T = Record<string, unknown>>(text: string, params: Params = {}, tx?: Tx): Promise<T[]> {
  const req = tx ? new sql.Request(tx) : (await db()).request();
  for (const [name, [type, value]] of Object.entries(params)) req.input(name, type as sql.ISqlType, value);
  const { recordset } = await req.query(text);
  return (recordset ?? []).map((row: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const k in row) out[camel(k)] = row[k];
    return out as T;
  });
}

export async function queryOne<T = Record<string, unknown>>(text: string, params: Params = {}, tx?: Tx) {
  return (await query<T>(text, params, tx))[0] ?? null;
}

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = new sql.Transaction(await db());
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

/** SQL Server duplicate key (unique constraint 2627 / unique index 2601). */
export const isDuplicateKey = (err: unknown) => [2627, 2601].includes((err as { number?: number })?.number ?? 0);

export { sql };
