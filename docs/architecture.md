# Architecture

The Vengurla WhatsApp Messaging Platform is a company-wide service. Vittam, the Hotel App, CRM and future applications send WhatsApp messages through one provider-independent REST API. They only know the API URL, their project API key and the message payload. Providers, sessions, failover, queues and templates stay inside the platform.

```text
 Vittam   Hotel App   CRM                       Admin dashboard (React)
    \        |        /                                  |
     \       |       /  REST + API key                   | REST + JWT, Socket.IO
      v      v      v                                    v
 +--------------------------------------------------------------+
 |  API process  (backend/src/app/server.ts)                    |
 |  Express -> presentation -> application -> domain            |
 +---------------+-------------------------------+--------------+
                 | MSSQL (source of truth)       | BullMQ jobs, pub/sub
                 v                               v
            SQL Server  <-------------------  Redis
                 ^                               |
 +---------------+-------------------------------v--------------+
 |  Worker process  (backend/src/worker.ts)                     |
 |  queues -> ProcessMessage -> ProviderRegistry                |
 |                 +-> BaileysProvider   (primary)              |
 |                 +-> MetaCloudProvider (fallback)             |
 +--------------------------------------------------------------+
```

## Frontend and backend are separate

| | `frontend/` | `backend/` |
|---|---|---|
| Stack | React 19, TypeScript, Tailwind v4, Vite | Node 22, TypeScript, Express 5 |
| Owns | UI, routing, forms, tables, realtime display | database, Redis, BullMQ, providers, auth, business rules, webhooks |
| Talks to | backend REST (`VITE_API_URL`) and Socket.IO only | MSSQL, Redis, WhatsApp, Meta Graph API |

Each has its own `package.json` and build. The frontend never touches MSSQL, Redis, provider credentials or sessions. Its role checks are UI hints only; the backend enforces every permission.

## Backend layers

Each module under `backend/src/modules/<module>/` uses only the layers it needs:

| Layer | Contains | May depend on |
|---|---|---|
| `domain/` | Business concepts and pure rules, e.g. `serviceRules.ts`, `message.ts` (status transitions, template rendering) | nothing external |
| `application/` | Use cases, e.g. `sendMessage`, `processMessage`, `configureWhatsAppService`, `rotateApiKey` | domain, repositories, provider **interface** |
| `infrastructure/` | MSSQL repositories (parameterized, typed queries) | `config/database.ts` |
| `presentation/` | Express routes: Zod-validate the input, call a use case, respond. No business logic. | application |

Modules: `auth`, `projects`, `api-keys`, `whatsapp-instances` (instances and project assignment), `whatsapp-service` (priority/fallback), `messaging`, `templates`, `webhooks`, `health`, `audit`, `dashboard`.

Cross-cutting code lives in `middleware/` (authentication, authorization, rate limiting, errors, request logging), `shared/` (errors, crypto, validation), `config/` (env, database, redis, logger), `queue/` and `realtime/`.

## Provider abstraction

`providers/whatsapp/contracts/WhatsAppProvider.ts` is the only thing the application layer knows:

```ts
interface WhatsAppProvider {
  connect(); disconnect({ logout? }); getHealth(); getStatus();
  sendText(); sendImage(); sendDocument(); sendTemplate();
}
```

- `baileys/BaileysProvider.ts`: QR pairing, multi-file session on disk, reconnect with backoff, delivery receipts.
- `meta/MetaCloudProvider.ts` and `MetaClient.ts`: Graph API, credential and phone-registration validation, error mapping.
- `registry.ts`: the only place that creates concrete providers (one live provider per instance, worker process only).

Every provider failure is translated into a `ProviderError` with a `sendState` (`NOT_SENT` or `UNKNOWN`), `retryable` and `fallbackAllowed` (see `contracts/errors.ts`). The failover logic uses only these three facts. See [failover.md](failover.md).

## Database

SQL Server, fully migration-based (`database/migrations`, `npm run db:migrate`). It is the source of truth for everything, including message state. Redis only holds jobs. See [database.md](database.md).

## Queue and worker

> With `RUN_MODE=single` (shared hosting, no Redis) the worker runs inside the API process and polls SQL Server instead of BullMQ (`queue/workers/sqlPollers.ts`): due rows are claimed atomically with a lease (`next_attempt_at`), retries use `retry_count` backoff, and realtime/QR use in-process memory. Everything below describes `RUN_MODE=split`.

BullMQ on Redis, prefix `vmp`:

| Queue | Jobs | Notes |
|---|---|---|
| `whatsapp-send` | `send {messageId}` | job id `send_<messageId>`; exponential backoff; `SEND_MAX_ATTEMPTS` |
| `webhooks` | `provider-event {eventId}`, `deliver {deliveryId}` | inbound Meta events and outbound project webhooks |
| `instance-control` | `connect`, `disconnect`, `logout`, `reload`, `remove` | the API asks the worker to act on WhatsApp connections |

Retries use BullMQ's own attempts and backoff, so there is no separate retry queue. The API and the worker are separate processes (PM2 apps `vengurla-messaging-api` and `vengurla-messaging-worker`). Only the worker opens WhatsApp connections, and exactly one worker must run, because a Baileys session cannot be shared.

The worker also:
- restores saved Baileys sessions and re-validates Meta instances on startup
- checks provider health every 60 s and re-validates Meta credentials every 15 min
- every 60 s, re-queues messages stuck in `CREATED`/`QUEUED` (for example after a Redis outage) and unprocessed webhook events

## Realtime

WhatsApp connections live in the worker, and browsers connect to the API. The worker publishes events to the Redis channel `vmp:realtime`. The API subscribes and emits them over Socket.IO to authenticated admins (the JWT is checked in the handshake):

| Event | Payload |
|---|---|
| `instance.status` | `{ instanceId, status, detail, healthStatus }` |
| `instance.qr` | `{ instanceId, qr }` (PNG data URL, or `null` once paired/expired) |
| `instance.health` | `{ instanceId, healthStatus }` |
| `message.status` | `{ messageId, projectId, status }` |

The latest QR code is also cached in Redis for 120 s, so a dashboard opened mid-pairing shows it immediately.

## Webhooks

- **Inbound (providers):** `GET/POST /api/v1/webhooks/meta`. The signature is verified, each event is stored in `webhook_events` (de-duplicated by the provider's event id), then processed by the worker. Status updates move messages forward (sent → delivered → read), and template status changes update templates.
- **Outbound (projects):** each status change creates a `webhook_deliveries` row and a job. The payload is signed (see [security.md](security.md)), retried with backoff, and can be redelivered from the dashboard.

## Future: Meta Embedded Signup

Not implemented, but the model already supports it. Embedded Signup would end by calling the same `createInstance(provider='META_CLOUD', {wabaId, phoneNumberId, accessToken})` use case. Validation, webhook verification and the READY lifecycle are unchanged.
