import { connect, ensureMigrationsTable, listMigrationFiles, readMigration, runInTransaction, sql } from './lib.ts';

const pool = await connect();
try {
  await ensureMigrationsTable(pool);
  const done = new Set(
    (await pool.request().query<{ migration_name: string }>('SELECT migration_name FROM dbo.schema_migrations'))
      .recordset.map((r) => r.migration_name),
  );
  const pending = listMigrationFiles().filter((f) => !done.has(f));
  if (!pending.length) console.log('Database is up to date.');

  for (const file of pending) {
    process.stdout.write(`→ ${file} ... `);
    try {
      await runInTransaction(pool, readMigration(file).up, (tx) =>
        new sql.Request(tx)
          .input('name', sql.VarChar(255), file)
          .query('INSERT INTO dbo.schema_migrations (migration_name) VALUES (@name)'),
      );
      console.log('done');
    } catch (err) {
      console.log('FAILED');
      console.error(`Migration ${file} failed and was rolled back:\n  ${(err as Error).message}`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await pool.close();
}
