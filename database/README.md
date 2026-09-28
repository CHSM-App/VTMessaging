# Database (Microsoft SQL Server)

All schema changes go through migrations in `migrations/`. Never create or alter tables by hand in SSMS.

## Commands

Run from `backend/` (they use `backend/.env` for the connection):

| Command | What it does |
|---|---|
| `npm run db:migrate` | Applies pending migrations in filename order, each in its own transaction |
| `npm run db:rollback` | Rolls back the last migration (`npm run db:rollback -- --steps 3` for more) |
| `npm run db:seed` | Development seed: Vittam, Hotel App and CRM projects plus a sample admin |

Or run directly from `database/`: `npm run migrate`, `npm run rollback`, `npm run seed`. The scripts run on Node 22.18+ with its built-in TypeScript support, so there is no build step.

## How it works

- `dbo.schema_migrations (id, migration_name, executed_at)` records every applied migration. A migration never runs twice.
- Each file contains the "up" SQL, then an optional `-- ==== DOWN ====` section used by rollback.
- `GO` separates batches, the same as in SSMS and sqlcmd.
- Each migration, together with its bookkeeping row, runs in one transaction. On failure it is rolled back and the runner stops with exit code 1.

## Adding a migration

1. Create `migrations/013_short_description.sql` (next number, never renumber existing files).
2. Write T-SQL only: `UNIQUEIDENTIFIER`, `NVARCHAR`, `DATETIME2(3)`, `BIT`, `SYSUTCDATETIME()`. No PostgreSQL syntax.
3. Name every constraint and index explicitly (`PK_`, `FK_`, `UQ_`, `CK_`, `DF_`, `IX_`, `UX_`) so a rollback can drop it by name.
4. Index every foreign key column (SQL Server does not do this automatically).
5. Add a `-- ==== DOWN ====` section that undoes the change.
6. Test it: `db:migrate`, then `db:rollback`, then `db:migrate` again.

## Seeds

`seeds/<SEED_ENV>/*.sql` (default `development`) are idempotent. `seeds/production` is intentionally empty, so `SEED_ENV=production` only creates the first admin. `scripts/seed.ts` then creates the admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. If no password is given, it generates one and prints it once. Seeds never contain API keys, Meta credentials or WhatsApp sessions. Development seeds refuse to run when `NODE_ENV=production`.

## Connection notes

- Driver: `mssql` (tedious). SQL authentication must be enabled (mixed mode).
- The filtered unique indexes (idempotency keys, webhook event de-duplication) need `QUOTED_IDENTIFIER ON`. The driver sets it; plain `sqlcmd` needs `-I`.
- Recommended: `ALTER DATABASE <db> SET READ_COMMITTED_SNAPSHOT ON` so dashboard reads never block the worker.
- SQL Express has a 10 GB limit. `audit_logs`, `webhook_events` and `webhook_deliveries` grow continuously, so archive old rows periodically.

See [../docs/database.md](../docs/database.md) for the schema.
