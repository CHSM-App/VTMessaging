# Database

Microsoft SQL Server 2016+ (developed on SQL Server 2019 Express). The schema is created only by migrations: see [database/README.md](../database/README.md) for commands and conventions.

Conventions: `UNIQUEIDENTIFIER` keys with `NEWSEQUENTIALID()` (sequential, so no page splits); `DATETIME2(3)` in UTC via `SYSUTCDATETIME()`; `NVARCHAR` for human text and `VARCHAR` for codes; JSON in `NVARCHAR(MAX)` with `ISJSON` checks; every constraint named; every foreign key indexed.

## Tables

| # | Table | Purpose |
|---|---|---|
| 001 | `projects` | Client applications (Vittam, Hotel App, CRM). Soft delete via `deleted_at`. Unique `slug`. Also holds the project webhook URL and its encrypted signing secret. |
| 002 | `api_keys` | Per-project keys. Stores `key_prefix` (lookup) and `key_hash` (SHA-256), never the key itself. `status` ACTIVE/REVOKED, optional `expires_at`, `last_used_at`. |
| 003 | `whatsapp_instances` | One number + one provider (`BAILEYS` / `META_CLOUD`). `status`, `status_detail`, `health_status`, `provider_config` (JSON; Meta token encrypted), `last_activity_at`. **No `project_id`.** Baileys sessions are on disk, not here. |
| 004 | `project_whatsapp_instances` | Many-to-many assignment. Unique `(project_id, instance_id)`, `is_enabled`. |
| 005 | `project_whatsapp_services` | One row per project: `priority_instance_id`, optional `fallback_instance_id`, with `CHECK (fallback <> priority)`. "Must be assigned to the project" is enforced in the application layer. |
| 006 | `messages` | Provider-independent messages. Filtered unique index `(project_id, idempotency_key)`. Status timestamps (`queued_at` … `failed_at`). |
| 007 | `message_attempts` | One row per provider attempt: instance, provider, `attempt_number`, STARTED/SENT/FAILED/UNKNOWN, provider message id, error. |
| 008 | `templates` | Meta templates per project: name/category/language/header/body/footer, `variables` and `buttons` (JSON), `provider_template_id`, Meta `status`, `rejection_reason`, and `instance_id` (the WABA it was submitted through). Adds `messages.template_id` FK. |
| 009 | `webhook_events` | Raw inbound provider events. Filtered unique `(provider, external_event_id)` for de-duplication. |
| 010 | `webhook_deliveries` | Outbound project webhook log: payload, target URL, status, attempts, failure. |
| 011 | `audit_logs` | Append-only trail (`BIGINT IDENTITY`): actor, action, resource, metadata JSON. |
| 012 | `admin_users` | Dashboard users: email, scrypt password hash, role ADMIN/OPERATOR/VIEWER, `is_active`. |
| — | `schema_migrations` | Created by the migration runner. |

## Relationships

```text
projects 1─* api_keys
projects *─* whatsapp_instances        (via project_whatsapp_instances)
projects 1─1 project_whatsapp_services ─> priority/fallback whatsapp_instances
projects 1─* messages 1─* message_attempts *─1 whatsapp_instances
projects 1─* templates *─1 whatsapp_instances (Meta WABA)
projects 1─* webhook_deliveries
```

## Status values

- **Instance (Baileys):** CREATING → WAITING_FOR_PAIRING → CONNECTING → CONNECTED; also DISCONNECTED, RECONNECTING, ERROR
- **Instance (Meta):** CREATED → CONFIGURING → CREDENTIALS_VALID → PHONE_REGISTERED → WEBHOOK_VERIFIED → READY; errors CONFIG_ERROR, AUTH_ERROR, PHONE_REGISTRATION_FAILED, WEBHOOK_ERROR
- **Health:** HEALTHY, DEGRADED, UNAVAILABLE
- **Message:** CREATED → QUEUED → PROCESSING → SENDING → SENT → DELIVERED → READ; FAILED, UNKNOWN
- **Template:** DRAFT, PENDING, APPROVED, REJECTED, PAUSED, DISABLED

## Access from code

`backend/src/config/database.ts` exposes `query(sql, params, tx?)`, where every parameter has an explicit SQL type (`[sql.VarChar(20), value]`) to avoid implicit conversions. It also exposes `withTransaction(fn)` and `isDuplicateKey(err)`. Rows come back with camelCase keys. There is no ORM, and no string-built SQL with user values.
