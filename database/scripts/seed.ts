// Usage: npm run seed   (runs seeds/<SEED_ENV|development>/*.sql, then ensures a sample admin)
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashPassword } from '../../backend/src/shared/utils/password.ts';
import { ROOT, connect, runInTransaction, splitBatches, sql } from './lib.ts';

const seedEnv = process.env.SEED_ENV ?? 'development';
if (process.env.NODE_ENV === 'production' && seedEnv === 'development') {
  throw new Error('Refusing to run development seeds with NODE_ENV=production');
}
const dir = join(ROOT, 'seeds', seedEnv);

const pool = await connect();
try {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await runInTransaction(pool, splitBatches(readFileSync(join(dir, file), 'utf8')), async () => {});
    console.log(`✓ ${file}`);
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@vengurlatech.local').toLowerCase();
  const exists = await pool
    .request()
    .input('email', sql.VarChar(254), email)
    .query('SELECT 1 AS x FROM dbo.admin_users WHERE email = @email');

  if (exists.recordset.length) {
    console.log(`✓ admin ${email} already exists`);
  } else {
    const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(12).toString('base64url');
    await pool
      .request()
      .input('email', sql.VarChar(254), email)
      .input('name', sql.NVarChar(150), 'Sample Admin')
      .input('hash', sql.VarChar(255), await hashPassword(password))
      .query(`INSERT INTO dbo.admin_users (email, name, password_hash, role) VALUES (@email, @name, @hash, 'ADMIN')`);
    console.log(`✓ admin created: ${email}`);
    if (!process.env.SEED_ADMIN_PASSWORD) console.log(`  generated password (shown once): ${password}`);
  }
} finally {
  await pool.close();
}
