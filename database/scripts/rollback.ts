// Usage: npm run rollback            (last migration)
//        npm run rollback -- --steps 3
import { connect, ensureMigrationsTable, readMigration, runInTransaction, sql } from './lib.ts';

const stepsArg = process.argv.indexOf('--steps');
const steps = stepsArg > -1 ? Number(process.argv[stepsArg + 1]) : 1;
if (!Number.isInteger(steps) || steps < 1) throw new Error('--steps must be a positive integer');

const pool = await connect();
try {
  await ensureMigrationsTable(pool);
  const { recordset } = await pool
    .request()
    .input('steps', sql.Int, steps)
    .query<{ migration_name: string }>(
      'SELECT TOP (@steps) migration_name FROM dbo.schema_migrations ORDER BY id DESC',
    );
  if (!recordset.length) console.log('Nothing to roll back.');

  for (const { migration_name: file } of recordset) {
    process.stdout.write(`← ${file} ... `);
    const { down } = readMigration(file);
    if (!down.length) {
      console.log('FAILED');
      console.error(`${file} has no DOWN section; stopping.`);
      process.exitCode = 1;
      break;
    }
    try {
      await runInTransaction(pool, down, (tx) =>
        new sql.Request(tx)
          .input('name', sql.VarChar(255), file)
          .query('DELETE FROM dbo.schema_migrations WHERE migration_name = @name'),
      );
      console.log('rolled back');
    } catch (err) {
      console.log('FAILED');
      console.error(`Rollback of ${file} failed:\n  ${(err as Error).message}`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await pool.close();
}
