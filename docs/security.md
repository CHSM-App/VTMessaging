# Security

## Two separate authentication systems

| | Client applications | Dashboard users |
|---|---|---|
| Credential | Project API key | Email + password → JWT (HS256, `JWT_EXPIRES_IN`, default 8 h) |
| Where | `/api/v1/messages`, `/api/v1/usage` | `/api/v1/admin/*`, Socket.IO |
| Storage | SHA-256 of the key + public prefix | scrypt password hash (N=16384, per-user salt) |

The JWT is re-checked against the database on every request, so deactivating a user or changing a role takes effect immediately. The dashboard keeps the token in `sessionStorage`, so it is cleared when the tab closes.

## API keys

- Format `vmp_<12 hex>.<43 random chars>` (256-bit secret). The full key is shown **once**, at creation or rotation.
- Only `key_prefix` and `SHA-256(key)` are stored, and the hash is compared in constant time. A fast hash is fine because the key is random, not a guessable password.
- Revoked or expired keys, and keys of inactive or deleted projects, are rejected.
- **The project is always taken from the key.** No endpoint accepts a project id from a client.

## Authorization (roles)

| Role | Can |
|---|---|
| VIEWER | read everything; all non-GET requests are rejected |
| OPERATOR | projects, API keys, assignments, WhatsApp Service, templates, message retry, instance connect/disconnect, project webhooks |
| ADMIN | everything, plus dashboard users, instance creation/credentials, instance logout/deletion, project deletion |

Enforced in the backend (`middleware/authorization.ts`). The last active ADMIN cannot be demoted or disabled.

## Project isolation

Client endpoints filter by the project from the API key (for example, `GET /messages/:id` includes `AND project_id = @projectId`). Another project's message returns 404. Covered by the integration test.

## Secrets at rest

- Meta access tokens and project webhook signing secrets are encrypted with **AES-256-GCM** (`shared/utils/crypto.ts`), keyed by `ENCRYPTION_KEY`. GCM makes tampering detectable.
- API responses never include them. The API reports only `accessTokenConfigured: true` / `webhookSecretConfigured: true`.
- Meta sometimes echoes the token in error messages ("Malformed access token EAAG…"). `MetaClient` redacts the token before the error reaches logs, the database or the UI (unit-tested).
- Baileys session files live under `BAILEYS_AUTH_DIR`. They are not in the database, not served over HTTP, and `storage/` is gitignored.
- Seeds contain no keys, tokens or sessions.

## Webhook verification

- **Inbound Meta:** `X-Hub-Signature-256` = HMAC-SHA256 of the raw body with `META_APP_SECRET`, compared in constant time. Without `META_APP_SECRET`, POSTs are rejected (503). The subscription handshake checks `META_WEBHOOK_VERIFY_TOKEN` in constant time. Events are de-duplicated by the provider's event id.
- **Outbound to projects:** `X-Vengurla-Signature: sha256=HMAC_SHA256(secret, "<X-Vengurla-Timestamp>.<rawBody>")`. Receivers should reject timestamps older than 5 minutes (sample code in [api.md](api.md)). Secrets can be rotated from the dashboard.

## Transport and input

- **Helmet** security headers; `x-powered-by` disabled.
- **CORS** allows only `FRONTEND_URL`. Client apps call the API server-to-server, so they don't need CORS.
- **Request limits:** JSON body ≤ 1 MB; request timeout 30 s.
- **Zod** validates every body, parameter and query, and the environment. Unknown fields are dropped, so a client can't sneak in a `provider`.
- **SQL:** parameterized queries with explicit SQL types only.
- **Rate limiting** (configurable): login 20 per 15 min per IP; client requests `RATE_LIMIT_REQUESTS_PER_WINDOW` per project; message submissions `RATE_LIMIT_MESSAGES_PER_WINDOW` per project; admin API 600/min per IP.

## Logging

Pino structured logs with a request id (also returned as `X-Request-Id`), project/admin id, message id, instance id, provider and error codes. `authorization`, `x-api-key`, cookies and any `password`/`token`/`secret`/`accessToken` fields are redacted. Stack traces are never sent to clients in production.

## Audit log

Recorded (actor, action, resource, id, timestamp, metadata): logins, project created/updated/activated/deactivated/deleted, API key created/revoked/rotated, instance created/updated/deleted/connected/disconnected/assigned/removed, connect/disconnect/logout requests, priority/fallback changes, template created/updated/submitted/status changed/deleted, message retries, webhook configuration and secret rotation, user changes. Secrets are never written to the audit metadata.

## Known limits and recommendations

- **Media URLs** in messages are fetched by the server (SSRF surface). Clients are trusted internal applications with API keys. If that changes, restrict media to an allowlist of hosts.
- Rate-limit counters are in-memory per API process. Use a Redis store if you run more than one API process.
- Put the API behind TLS. Keep Redis and SQL Server off the public network.
