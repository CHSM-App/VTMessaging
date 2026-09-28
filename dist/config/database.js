import sql from 'mssql';
import { env } from './env.js';
let poolPromise;
export function db() {
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
    if (p)
        await (await p).close();
}
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
/** Runs a parameterized query and returns rows with camelCase keys. */
export async function query(text, params = {}, tx) {
    const req = tx ? new sql.Request(tx) : (await db()).request();
    for (const [name, [type, value]] of Object.entries(params))
        req.input(name, type, value);
    const { recordset } = await req.query(text);
    return (recordset ?? []).map((row) => {
        const out = {};
        for (const k in row)
            out[camel(k)] = row[k];
        return out;
    });
}
export async function queryOne(text, params = {}, tx) {
    return (await query(text, params, tx))[0] ?? null;
}
export async function withTransaction(fn) {
    const tx = new sql.Transaction(await db());
    await tx.begin();
    try {
        const result = await fn(tx);
        await tx.commit();
        return result;
    }
    catch (err) {
        await tx.rollback().catch(() => { });
        throw err;
    }
}
/** SQL Server duplicate key (unique constraint 2627 / unique index 2601). */
export const isDuplicateKey = (err) => [2627, 2601].includes(err?.number ?? 0);
export { sql };
//# sourceMappingURL=database.js.map