# API

Interactive documentation with request/response examples: **`/api/docs`** (Swagger UI), raw spec at `/api/docs.json`.

All responses:

```json
{ "success": true, "data": { } }
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human readable message" } }
```

Stack traces are never returned in production.

## For client applications (Vittam, Hotel App, CRM, …)

You need three things: the API URL, your project API key, and the message payload. You never choose a provider.

### Authentication

```
Authorization: Bearer vmp_1a2b3c4d5e6f.<secret>
```

or `X-API-Key: vmp_…`. Keys are created in the dashboard (Projects › API keys) and shown only once.

### Send a message: `POST /api/v1/messages`

```json
{
  "to": "919876543210",
  "type": "text",
  "text": { "body": "Your bill has been generated." },
  "idempotencyKey": "invoice-1001-whatsapp"
}
```

Other types:

```json
{ "to": "919876543210", "type": "document", "document": { "url": "https://files.example.com/INV-1001.pdf", "filename": "INV-1001.pdf", "caption": "Invoice" } }
{ "to": "919876543210", "type": "image", "image": { "url": "https://files.example.com/menu.jpg", "caption": "Menu" } }
{ "to": "919876543210", "type": "template", "template": { "name": "bill_generated", "language": "en", "variables": ["Ravi", "INV-1001"] } }
```

Response `202 Accepted`:

```json
{ "success": true, "data": { "messageId": "0E984725-…", "status": "QUEUED" } }
```

- `to`: international format. Spaces, `+`, `-` and brackets are stripped, leaving 8–15 digits.
- `idempotencyKey` (or the `Idempotency-Key` header): sending the same key again returns the original message with `200` and header `Idempotent-Replayed: true`. It is never sent twice. **Always set one** for anything that must not be duplicated (bills, OTP-like notices).
- Media URLs must be reachable from the platform server. Documents and images are downloaded before sending (max 64 MB).
- Templates must exist for your project. Meta sends only templates Meta approved; Baileys sends the rendered text.

Errors worth handling:

| HTTP | code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad payload (details in `error.details`) |
| 400 | `TEMPLATE_VARIABLES_MISMATCH` | Wrong number of template variables |
| 401 | `UNAUTHORIZED` | Missing, invalid, revoked or expired key |
| 403 | `PROJECT_INACTIVE` | Project deactivated |
| 422 | `WHATSAPP_SERVICE_NOT_CONFIGURED` | Platform admin hasn't set up WhatsApp for your project |
| 422 | `TEMPLATE_NOT_FOUND` | Unknown template/language |
| 429 | `RATE_LIMITED` | Per-project limit exceeded; back off and retry |

### Check status: `GET /api/v1/messages/{messageId}`

Returns `status` and timestamps for your own project's messages only (`404` otherwise). Statuses: `CREATED`, `QUEUED`, `PROCESSING`, `SENDING`, `SENT`, `DELIVERED`, `READ`, `FAILED`, `UNKNOWN`.

`UNKNOWN` means the platform could not tell whether WhatsApp accepted the message (for example, a timeout after sending). It is **not** resent automatically, to avoid duplicates. It may later become `SENT`/`DELIVERED` if the provider confirms it, and an operator can review it.

### Usage: `GET /api/v1/usage?days=30`

Message counts by status for your project.

### Webhooks (optional)

Ask the platform admin to set your webhook URL. You will receive:

```json
{
  "event": "message.delivered",
  "messageId": "0E984725-…",
  "status": "delivered",
  "to": "919876543210",
  "idempotencyKey": "invoice-1001-whatsapp",
  "timestamp": "2026-09-26T10:00:04.000Z"
}
```

Events: `message.sent`, `message.delivered`, `message.read`, `message.failed`, `message.unknown` (the last two include `error: { code, message }`), and `webhook.test`.

Headers: `X-Vengurla-Event`, `X-Vengurla-Delivery` (unique id; use it to de-duplicate), `X-Vengurla-Timestamp`, `X-Vengurla-Signature`. Verify every request:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, headers, secret) {
  const ts = headers['x-vengurla-timestamp'];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay window
  const expected = 'sha256=' + createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const given = headers['x-vengurla-signature'] ?? '';
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
```

Respond with any `2xx` within 10 s. Anything else is retried with exponential backoff (`WEBHOOK_MAX_ATTEMPTS`, default 6).

## Dashboard (admin) API

Everything under `/api/v1/admin/*` requires `Authorization: Bearer <JWT>` from `POST /api/v1/auth/login`. Roles: VIEWER (read-only), OPERATOR (manage messaging resources), ADMIN (also users, instance credentials, deletions).

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password`, `GET/POST /admin/users`, `PATCH /admin/users/:id` |
| Projects | `GET/POST /admin/projects`, `GET/PATCH/DELETE /admin/projects/:id`, `PUT /admin/projects/:id/webhook`, `POST …/webhook/rotate-secret`, `POST …/webhook/test` |
| API keys | `GET /admin/api-keys`, `GET/POST /admin/projects/:projectId/api-keys`, `POST /admin/api-keys/:id/revoke`, `POST /admin/api-keys/:id/rotate` |
| Instances | `GET/POST /admin/instances`, `GET/PATCH/DELETE /admin/instances/:id` (`?confirm=true`), `GET …/impact`, `POST …/connect`, `…/disconnect`, `…/logout`, `GET …/qr` |
| Assignment | `GET/POST /admin/projects/:projectId/instances`, `PATCH/DELETE /admin/projects/:projectId/instances/:instanceId` |
| WhatsApp Service | `GET/PUT /admin/projects/:projectId/whatsapp-service` |
| Messages | `GET /admin/messages` (filters), `GET /admin/messages/:id` (with attempts), `POST /admin/messages/:id/retry` |
| Templates | `GET/POST /admin/templates`, `GET/PUT/DELETE /admin/templates/:id`, `POST …/submit`, `POST …/sync`, `POST /admin/templates/sync` |
| Webhooks | `GET /admin/webhooks/events`, `GET /admin/webhooks/deliveries`, `POST /admin/webhooks/deliveries/:id/redeliver` |
| Other | `GET /admin/dashboard`, `GET /admin/audit-logs` |

Provider callbacks: `GET/POST /api/v1/webhooks/meta`. Health: `GET /health`, `/health/live`, `/health/ready`.
