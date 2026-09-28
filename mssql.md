---
name: mssql-expert
description: Expert guidance for Microsoft SQL Server (T-SQL) — writing and tuning queries, designing schemas, indexing, concurrency control, transactions, migrations, and safe parameterized access from Node.js/Python/.NET. Use this skill whenever the user mentions SQL Server, MSSQL, T-SQL, Azure SQL, SQL Express, sqlcmd, SSMS, the `mssql`/`tedious` npm package, or pyodbc — and also whenever they are writing any SQL, designing tables, debugging a slow query, planning a migration, or fixing a deadlock in a project whose database is SQL Server, even if they don't name the engine.
---

# MSSQL Expert

Everything here is T-SQL for Microsoft SQL Server (2016+ unless noted), Azure SQL Database, and SQL Server Express. Syntax that only exists in Postgres or MySQL is called out explicitly rather than silently translated — most bugs in "ported" SQL come from assuming a feature carries over.

## Version and edition awareness

Before recommending a feature, check what the target supports. Ask if unclear.

| Feature | Requires |
|---|---|
| `STRING_AGG`, `DROP IF EXISTS`, JSON functions | 2016+ |
| `TRIM`, `TRANSLATE`, `CONCAT_WS`, graph tables | 2017+ |
| `GREATEST`/`LEAST`, `STRING_SPLIT` with ordinal, ledger | 2022+ |
| Online index rebuild, partitioning, data compression | Enterprise (or Azure SQL) |
| `ALTER DATABASE ... SET ACCELERATED_DATABASE_RECOVERY` | 2019+ |

**Express edition limits** (common on small deployments and RDS): 10 GB per database, 1 GB buffer pool, 4 cores, no SQL Agent. Design around them — no scheduled jobs means cleanup and rollup work has to be driven from the application layer or an external scheduler. Watch the 10 GB ceiling on append-only log tables (audit trails, event logs, ball-by-ball style logs); plan archival before it bites.

## Connecting safely

### Node.js (`mssql` package)

Parameterized queries are non-negotiable — they are the actual defense against SQL injection, and they also let SQL Server reuse cached plans.

```javascript
const sql = require('mssql');

const pool = await new sql.ConnectionPool({
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  options: { encrypt: true, trustServerCertificate: false },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
}).connect();

// GOOD — typed parameters
const result = await pool.request()
  .input('tenantId', sql.Int, tenantId)
  .input('status', sql.VarChar(20), status)
  .query('SELECT invoice_id, total_paise FROM invoices WHERE tenant_id = @tenantId AND status = @status');

// BAD — string concatenation, injectable and plan-cache polluting
await pool.request().query(`SELECT * FROM invoices WHERE status = '${status}'`);
```

Always declare the parameter type. Untyped `.input()` lets the driver guess, and a guessed `NVARCHAR` against a `VARCHAR` column causes an implicit conversion that kills index usage (see [Sargability](#sargability)).

For Devanagari, Arabic, emoji, or any non-Latin text, use `sql.NVarChar` against `NVARCHAR` columns and prefix literals with `N`:

```sql
INSERT INTO customers (name) VALUES (N'सुरेश पाटील');
```

Without the `N` prefix the literal is interpreted as `VARCHAR` in the database's default collation and non-representable characters become `?` — silently, with no error.

### Python

```python
import pyodbc
conn = pyodbc.connect(
    "DRIVER={ODBC Driver 18 for SQL Server};SERVER=host;DATABASE=db;UID=user;PWD=pass;Encrypt=yes"
)
cur = conn.cursor()
cur.execute("SELECT id, name FROM users WHERE tenant_id = ? AND status = ?", tenant_id, status)
```

### Dynamic SQL

When a query genuinely needs a dynamic shape (variable sort column, variable table), still parameterize the *values* with `sp_executesql`, and whitelist identifiers rather than interpolating them:

```sql
DECLARE @sql NVARCHAR(MAX) = N'SELECT id, name FROM dbo.users WHERE tenant_id = @tid ORDER BY '
    + QUOTENAME(@sortColumn) + N' DESC';   -- @sortColumn validated against a known list first
EXEC sp_executesql @sql, N'@tid INT', @tid = @tenantId;
```

`QUOTENAME` escapes identifiers but does not validate them semantically — check the column name against an allowlist before it reaches here.

## Data types: choosing correctly

| Need | Use | Avoid, and why |
|---|---|---|
| Unicode text (Marathi, Hindi, mixed script) | `NVARCHAR(n)` | `VARCHAR` — loses non-Latin characters unless the collation is UTF-8 (2019+) |
| ASCII-only codes (GSTIN, status, SKU) | `VARCHAR(n)` | `NVARCHAR` — doubles storage and index size for nothing |
| Money | `DECIMAL(19,4)`, or `BIGINT` for minor units (paise/cents) | `FLOAT`, `REAL` — rounding errors; `MONEY` — awkward rounding semantics |
| Timestamp | `DATETIME2(3)` + `DATETIMEOFFSET` when zone matters | `DATETIME` — 3.33 ms precision, 1753 lower bound |
| Date only | `DATE` | `DATETIME` with a zeroed time |
| Boolean | `BIT` | `CHAR(1)` |
| Surrogate key | `INT`/`BIGINT IDENTITY` | Random `UNIQUEIDENTIFIER` as clustered key — page splits and index bloat |
| Public-facing opaque ID | `UNIQUEIDENTIFIER` or a random token in a **nonclustered unique** index, with an `INT` clustered PK | Exposing sequential IDs in URLs |
| Large text/blob | `NVARCHAR(MAX)`, `VARBINARY(MAX)` | Deprecated `TEXT`, `NTEXT`, `IMAGE` |

`ROWVERSION` gives a free optimistic-concurrency token — add one to any table where two clients might edit the same row.

## Schema design

Normalize to 3NF first; denormalize deliberately and only with a measured reason.

```sql
CREATE TABLE dbo.orders (
    order_id      INT IDENTITY(1,1) NOT NULL,
    tenant_id     INT              NOT NULL,
    customer_id   INT              NOT NULL,
    order_date    DATE             NOT NULL CONSTRAINT DF_orders_date DEFAULT (CAST(SYSUTCDATETIME() AS DATE)),
    total_paise   BIGINT           NOT NULL CONSTRAINT CK_orders_total CHECK (total_paise >= 0),
    status        VARCHAR(20)      NOT NULL CONSTRAINT CK_orders_status
                                   CHECK (status IN ('pending','confirmed','cancelled')),
    created_at    DATETIME2(3)     NOT NULL CONSTRAINT DF_orders_created DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2(3)     NOT NULL CONSTRAINT DF_orders_updated DEFAULT SYSUTCDATETIME(),
    row_ver       ROWVERSION,
    CONSTRAINT PK_orders PRIMARY KEY CLUSTERED (order_id),
    CONSTRAINT FK_orders_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(customer_id)
);
```

Name every constraint explicitly. Auto-generated names like `DF__orders__stat__3B75D760` differ between environments, so migration scripts that drop them by name break in production.

Store timestamps in UTC with `SYSUTCDATETIME()` and convert at the edge. `GETDATE()` returns server local time, which shifts when the server moves.

### Multi-tenant tables

Put `tenant_id` first in the clustered key or in every nonclustered index that serves tenant-scoped queries — it is the highest-selectivity filter on every read path:

```sql
CREATE INDEX IX_orders_tenant_status_date
    ON dbo.orders (tenant_id, status, order_date DESC)
    INCLUDE (customer_id, total_paise);
```

Enforce tenant scoping in a single data-access layer rather than trusting every call site. A missing `WHERE tenant_id = @tid` is a cross-tenant data leak, not just a bug.

### Many-to-many

```sql
CREATE TABLE dbo.enrollments (
    student_id      INT NOT NULL,
    course_id       INT NOT NULL,
    enrollment_date DATE NOT NULL DEFAULT (CAST(SYSUTCDATETIME() AS DATE)),
    grade           CHAR(2) NULL,
    CONSTRAINT PK_enrollments PRIMARY KEY CLUSTERED (student_id, course_id),
    CONSTRAINT FK_enroll_student FOREIGN KEY (student_id) REFERENCES dbo.students(student_id),
    CONSTRAINT FK_enroll_course  FOREIGN KEY (course_id)  REFERENCES dbo.courses(course_id)
);
CREATE INDEX IX_enrollments_course ON dbo.enrollments (course_id);  -- reverse lookup
```

SQL Server does **not** auto-index foreign keys. Every FK column needs its own index, otherwise deletes on the parent table table-scan the child.

## Query patterns

### Pagination

```sql
SELECT order_id, order_date, total_paise
FROM dbo.orders
WHERE tenant_id = @tenantId
ORDER BY order_date DESC, order_id DESC
OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
```

`OFFSET/FETCH` requires `ORDER BY`, and the sort must be deterministic (add a tiebreaker like `order_id`) or rows will repeat across pages. `TOP` without `ORDER BY` returns arbitrary rows. Deep offsets get slow — for infinite scroll, prefer keyset pagination:

```sql
WHERE tenant_id = @tenantId AND (order_date < @lastDate OR (order_date = @lastDate AND order_id < @lastId))
ORDER BY order_date DESC, order_id DESC
OFFSET 0 ROWS FETCH NEXT @take ROWS ONLY;
```

### CTEs and window functions

```sql
WITH ranked AS (
    SELECT
        p.player_id,
        p.name,
        s.runs,
        ROW_NUMBER() OVER (PARTITION BY s.season_id ORDER BY s.runs DESC) AS rn,
        SUM(s.runs) OVER (PARTITION BY p.player_id ORDER BY s.match_date
                          ROWS UNBOUNDED PRECEDING) AS career_runs
    FROM dbo.players p
    JOIN dbo.scores s ON s.player_id = p.player_id
    WHERE p.tenant_id = @tenantId
)
SELECT player_id, name, runs, career_runs
FROM ranked
WHERE rn <= 10;
```

A T-SQL CTE is inlined, not materialized — referencing it twice runs it twice. When a CTE is expensive and reused, dump it into a `#temp` table (which gets statistics) instead.

Note `ROWS` vs the default `RANGE` in window frames: `RANGE UNBOUNDED PRECEDING` lumps ties together and is slower. Specify `ROWS` unless ties genuinely should share a value.

### APPLY — the T-SQL workhorse with no Postgres equivalent in most ports

```sql
-- Latest booking per room, without a correlated subquery per column
SELECT r.room_id, r.room_no, b.check_in, b.guest_name
FROM dbo.rooms r
OUTER APPLY (
    SELECT TOP (1) b.check_in, b.guest_name
    FROM dbo.bookings b
    WHERE b.room_id = r.room_id
    ORDER BY b.check_in DESC
) b
WHERE r.tenant_id = @tenantId;
```

`CROSS APPLY` = inner join semantics, `OUTER APPLY` = left join semantics. This is the standard top-N-per-group pattern.

### UPSERT

`MERGE` exists but has a long history of concurrency and correctness bugs. Prefer an explicit pattern under a lock:

```sql
BEGIN TRANSACTION;

UPDATE dbo.settings WITH (UPDLOCK, SERIALIZABLE)
SET value = @value, updated_at = SYSUTCDATETIME()
WHERE tenant_id = @tenantId AND [key] = @key;

IF @@ROWCOUNT = 0
    INSERT INTO dbo.settings (tenant_id, [key], value) VALUES (@tenantId, @key, @value);

COMMIT;
```

The `UPDLOCK, SERIALIZABLE` hint on the update is what makes this race-safe; without it two concurrent callers both fall through to `INSERT` and one gets a PK violation.

### Set-based JSON and string aggregation

```sql
-- Shred JSON stored in a column
SELECT o.order_id, j.sku, j.qty
FROM dbo.orders o
CROSS APPLY OPENJSON(o.line_items_json)
    WITH (sku VARCHAR(40) '$.sku', qty INT '$.qty') j;

-- Build JSON for an API response
SELECT order_id, total_paise
FROM dbo.orders WHERE tenant_id = @tenantId
FOR JSON PATH;

-- Comma-joined list (2017+)
SELECT o.order_id, STRING_AGG(i.sku, ', ') WITHIN GROUP (ORDER BY i.sku) AS skus
FROM dbo.orders o JOIN dbo.order_items i ON i.order_id = o.order_id
GROUP BY o.order_id;
```

JSON columns are not indexable directly — add a persisted computed column over `JSON_VALUE` and index that if you filter on a JSON field regularly.

## Concurrency and transactions

### The standard safe transaction wrapper

```sql
SET XACT_ABORT ON;   -- ensures the transaction rolls back on most runtime errors
BEGIN TRY
    BEGIN TRANSACTION;

    -- statements

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;   -- re-raise preserving error number, severity, line
END CATCH
```

`THROW` (2012+) preserves the original error; `RAISERROR` does not. Without `XACT_ABORT ON`, some errors leave the transaction open and the connection returns to the pool holding locks.

### Preventing double-booking

This is the pattern to reach for whenever two users can claim the same slot — turf bookings, hotel room-nights, appointment queues:

**Layer 1 — a unique constraint the database enforces regardless of application bugs:**

```sql
CREATE UNIQUE INDEX UX_booking_slots_resource_slot
    ON dbo.booking_slots (resource_id, slot_start)
    WHERE status <> 'cancelled';   -- filtered index: cancelled rows don't block rebooking
```

**Layer 2 — a range lock so concurrent readers serialize before insert:**

```sql
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (
        SELECT 1 FROM dbo.booking_slots WITH (UPDLOCK, HOLDLOCK)
        WHERE resource_id = @resourceId AND slot_start = @slotStart AND status <> 'cancelled'
    )
    BEGIN
        THROW 50001, 'Slot already booked', 1;
    END

    INSERT INTO dbo.booking_slots (resource_id, slot_start, booking_id, status)
    VALUES (@resourceId, @slotStart, @bookingId, 'confirmed');

    COMMIT;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;
END CATCH
```

`UPDLOCK` prevents two readers from both passing the check; `HOLDLOCK` (serializable) locks the *range*, blocking an insert of a row that doesn't exist yet. Both are needed. Still keep Layer 1 — the constraint is the thing that holds when a code path forgets the lock. Catch error 2601/2627 (duplicate key) in the application and surface it as "slot taken" rather than a 500.

### Isolation levels

Default `READ COMMITTED` uses shared locks, so readers block writers. On read-heavy OLTP, enable snapshot reads:

```sql
ALTER DATABASE [MyDb] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
```

Readers then see a versioned row instead of waiting. Cost: tempdb growth from the version store. This single change resolves most "the app freezes during report generation" complaints.

Never use `WITH (NOLOCK)` as a performance fix — it permits dirty reads, missed rows, and duplicated rows during page splits. If you're reaching for it, enable RCSI instead.

### Deadlocks

Deadlocks are normal under load; the fix is prevention plus retry. Prevent by always touching tables in the same order across transactions and keeping transactions short (never hold one open across an HTTP call or user think-time). Retry error 1205 with exponential backoff in the application, capped at ~3 attempts. Diagnose from `sys.event_log` (Azure) or the system_health extended event session.

## Indexing

Every table should be clustered on a narrow, ever-increasing, unique key — usually `INT/BIGINT IDENTITY`. The clustered key is silently appended to every nonclustered index, so a wide clustered key inflates the entire index footprint.

```sql
-- Covering index: the INCLUDE columns avoid a key lookup back to the clustered index
CREATE INDEX IX_invoices_tenant_date
    ON dbo.invoices (tenant_id, invoice_date DESC)
    INCLUDE (customer_id, total_paise, status);

-- Filtered index: small and cheap when only a subset is queried
CREATE INDEX IX_orders_pending
    ON dbo.orders (tenant_id, created_at)
    WHERE status = 'pending';
```

Column order in a composite index follows the query, not intuition: equality predicates first, then the range/sort column. An index on `(tenant_id, status, order_date)` serves `WHERE tenant_id=? AND status=? ORDER BY order_date` perfectly and `WHERE status=?` alone not at all.

Index foreign keys, columns in `WHERE`, `JOIN`, and `ORDER BY`. Skip indexes on tiny tables, on low-selectivity columns alone (a bare `BIT` column), and on hot-write columns where the write cost outweighs read gains.

### Finding what's missing and what's unused

```sql
-- Missing index suggestions, ranked by estimated impact
SELECT TOP 20
    ROUND(s.avg_total_user_cost * s.avg_user_impact * (s.user_seeks + s.user_scans), 0) AS impact,
    d.statement, d.equality_columns, d.inequality_columns, d.included_columns
FROM sys.dm_db_missing_index_group_stats s
JOIN sys.dm_db_missing_index_groups g  ON s.group_handle = g.index_group_handle
JOIN sys.dm_db_missing_index_details d ON g.index_handle  = d.index_handle
ORDER BY impact DESC;

-- Indexes costing writes and returning nothing
SELECT OBJECT_NAME(i.object_id) AS table_name, i.name,
       s.user_seeks, s.user_scans, s.user_lookups, s.user_updates
FROM sys.indexes i
LEFT JOIN sys.dm_db_index_usage_stats s
       ON s.object_id = i.object_id AND s.index_id = i.index_id AND s.database_id = DB_ID()
WHERE i.type_desc = 'NONCLUSTERED' AND OBJECTPROPERTY(i.object_id,'IsUserTable') = 1
  AND ISNULL(s.user_seeks,0) + ISNULL(s.user_scans,0) + ISNULL(s.user_lookups,0) = 0
ORDER BY s.user_updates DESC;
```

Treat missing-index DMV output as a hint, not a prescription — it ignores existing indexes and over-suggests `INCLUDE` columns. Consolidate suggestions into as few indexes as possible. Note these DMVs reset on service restart, so judge them only after a representative workload period.

## Query optimization

Start by measuring:

```sql
SET STATISTICS IO, TIME ON;
-- run the query
SET STATISTICS IO, TIME OFF;
```

Logical reads is the metric that matters — it's stable across cache states, unlike elapsed time. In the actual execution plan (Ctrl+M in SSMS), look for: a large gap between estimated and actual rows (stale statistics or a non-sargable predicate), key lookups (add `INCLUDE` columns), scans where a seek was expected, sort spills to tempdb (yellow warning triangle), and implicit conversion warnings.

### Sargability

A predicate is "sargable" when the optimizer can seek on an index. Wrapping the column in a function destroys that:

```sql
-- BAD: function on the column, index unusable
WHERE YEAR(order_date) = 2026
WHERE LEFT(phone, 3) = '982'
WHERE CAST(created_at AS DATE) = '2026-08-21'

-- GOOD: transform the constant instead
WHERE order_date >= '2026-01-01' AND order_date < '2027-01-01'
WHERE phone LIKE '982%'
WHERE created_at >= '2026-08-21' AND created_at < '2026-08-22'
```

`LIKE '%term%'` cannot seek at all — for real text search use full-text indexing.

Implicit conversion is the sneakiest version of this. If `phone` is `VARCHAR` and the driver sends `NVARCHAR`, SQL Server converts the *column* (NVARCHAR has higher precedence) and scans the whole table. This is the single most common cause of "the query is fast in SSMS but slow from the app" — match parameter types to column types exactly.

### Parameter sniffing

SQL Server caches a plan built for the first parameter values it sees. When data is skewed (one tenant with 2 million rows, the rest with 200), that plan can be catastrophic for everyone else. Options, in order of preference: fix the underlying indexing/statistics first; then `OPTION (RECOMPILE)` on the specific problem query; then `OPTION (OPTIMIZE FOR UNKNOWN)`. Enable Query Store (`ALTER DATABASE [db] SET QUERY_STORE = ON`) to spot regressions and force a known-good plan.

### Maintenance

Update statistics regularly — bad estimates cause bad plans more often than missing indexes do. Reorganize indexes at 5–30% fragmentation, rebuild above 30%; on Express (no Agent) drive this from an application-side scheduled job. Ola Hallengren's maintenance solution is the standard script set worth adopting rather than hand-rolling.

## Migrations

Write every migration as an idempotent, re-runnable script wrapped in a transaction with a rollback path. DDL in SQL Server is transactional (unlike MySQL), so this actually works.

```sql
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.users') AND name = 'status')
BEGIN
    -- 2012+: adding a NOT NULL column WITH a default is a metadata-only operation,
    -- instant even on large tables. Splitting it into three steps is a Postgres habit.
    ALTER TABLE dbo.users
        ADD status VARCHAR(20) NOT NULL
        CONSTRAINT DF_users_status DEFAULT 'active';
END

COMMIT;
```

For a backfill of an existing large column, batch it so the log doesn't blow up and locks stay short:

```sql
WHILE 1 = 1
BEGIN
    UPDATE TOP (5000) dbo.large_table
    SET new_column = source_column
    WHERE new_column IS NULL;

    IF @@ROWCOUNT = 0 BREAK;
    WAITFOR DELAY '00:00:00.100';   -- let other work through
END
```

Renames: `EXEC sp_rename 'dbo.users.old_name', 'new_name', 'COLUMN';`. It does not update references in views, procedures, or computed columns — grep the codebase and re-script dependent objects.

Rollback scripts should exist for every migration and be tested on a restored copy, not written from memory at 2 a.m. Always back up (or take a snapshot) before running against production, and run during low traffic.

## Translating from other dialects

| Postgres / MySQL | T-SQL |
|---|---|
| `LIMIT 10` | `TOP (10)` or `OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY` |
| `LIMIT 10 OFFSET 20` | `ORDER BY ... OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY` |
| `SERIAL` / `AUTO_INCREMENT` | `INT IDENTITY(1,1)` or a `SEQUENCE` |
| `ON CONFLICT DO UPDATE` / `ON DUPLICATE KEY UPDATE` | `UPDATE`-then-`INSERT` under `UPDLOCK, SERIALIZABLE` |
| `COALESCE(a,b)` | `COALESCE` (works) or `ISNULL(a,b)` (two args, different type precedence) |
| `NOW()`, `CURRENT_TIMESTAMP` | `SYSUTCDATETIME()` (prefer) / `GETDATE()` |
| `||` string concat | `+`, or `CONCAT()` which treats NULL as empty |
| `RETURNING` | `OUTPUT INSERTED.*` |
| `ILIKE` | `LIKE` with a case-insensitive collation (the default) |
| `::type` cast | `CAST(x AS type)` / `TRY_CAST` |
| `BOOLEAN true/false` | `BIT 1/0` |
| `TEXT` | `NVARCHAR(MAX)` |
| `EXTRACT(YEAR FROM d)` | `YEAR(d)` / `DATEPART(YEAR, d)` |
| `INTERVAL '1 day'` | `DATEADD(DAY, 1, d)` |
| `string_agg(x, ',')` | `STRING_AGG(x, ',') WITHIN GROUP (ORDER BY x)` |
| `generate_series` | recursive CTE or a numbers table |
| Backtick identifiers | `[square brackets]` |

## Common pitfalls

- **Unindexed foreign keys.** SQL Server doesn't create them; parent deletes then scan children.
- **`WITH (NOLOCK)` sprinkled everywhere.** Dirty and missing reads. Use RCSI.
- **`SELECT *`.** Breaks covering indexes, breaks when columns are added, ships columns nobody uses.
- **Row-by-row loops and cursors** where a set-based statement would do. A `WHILE` loop over a table is usually 10–100× slower than the equivalent `UPDATE ... FROM`.
- **`NOT IN` with a nullable subquery column.** If the subquery returns a single NULL, the whole predicate is never true. Use `NOT EXISTS`.
- **`COUNT(*)` to test existence.** `IF EXISTS (SELECT 1 ...)` short-circuits.
- **Comparing to NULL with `=`.** `NULL = NULL` is unknown; use `IS NULL`. `ANSI_NULLS OFF` is deprecated, don't rely on it.
- **Missing `N` prefix on Unicode literals** — silent data corruption for Devanagari and other non-Latin scripts.
- **Trusting `sp_helpindex`** over `sys.indexes`/`sys.index_columns`; it omits `INCLUDE` and filtered predicates.
- **Long transactions spanning application logic.** Open transaction → HTTP call → commit means locks held for a network round trip.
- **`DISTINCT` as a band-aid** for a join that fans out rows. Fix the join.
- **`FLOAT` for money.** Rounding drift that surfaces months later in reconciliation.
- **Untrusted constraints after bulk load.** `ALTER TABLE ... CHECK CONSTRAINT ALL` after a `WITH NOCHECK` load, or the optimizer ignores them. Audit with `SELECT name FROM sys.foreign_keys WHERE is_not_trusted = 1`.

## Workflow

**Designing a schema:** clarify the entities and the access patterns → pick types with the table above → normalize to 3NF → add named constraints → cluster on a narrow identity key → index FKs and the known query paths → write sample data and check the plans before the schema ships.

**Fixing a slow query:** reproduce with `SET STATISTICS IO, TIME ON` → read the actual plan → check for implicit conversion and non-sargable predicates first (cheapest fixes) → then key lookups → then missing indexes → then statistics and parameter sniffing → re-measure logical reads, not wall clock.

**Writing a migration:** identify dependent objects (`sys.sql_expression_dependencies`) → write forward and rollback scripts → make them idempotent → test on a restored copy of production → back up → run in low traffic → verify row counts and constraint trust afterwards.
