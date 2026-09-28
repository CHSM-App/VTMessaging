# Vengurla Tech WhatsApp Messaging Platform

A company-wide, provider-independent WhatsApp messaging service. Vittam, the Hotel App, CRM and future Vengurla Tech applications send messages through **one REST API with a project API key**. The platform picks the provider (Baileys first, Meta Cloud API as the safe fallback), queues, retries, tracks delivery, and reports back through webhooks.

```text
backend/    Node 22 + TypeScript + Express 5 API and worker (MSSQL, Redis/BullMQ, Baileys, Meta)
frontend/   React 19 + TypeScript + Tailwind admin dashboard (neumorphism design)
database/   MSSQL migrations, rollback and seeds
docs/       architecture, database, api, messaging-flow, failover, deployment, security
scripts/    deploy.ps1
ecosystem.config.cjs   PM2: vengurla-messaging-api + vengurla-messaging-worker
```

## Send a message (for application developers)

```bash
curl -X POST https://<messaging-api>/api/v1/messages \
  -H "Authorization: Bearer vmp_xxxxxxxxxxxx.<secret>" \
  -H "Content-Type: application/json" \
  -d '{ "to": "919876543210", "type": "text", "text": { "body": "Your bill has been generated." }, "idempotencyKey": "invoice-1001-whatsapp" }'
# -> 202 { "success": true, "data": { "messageId": "…", "status": "QUEUED" } }
```

Text, image, document/PDF and template messages are supported. See [docs/api.md](docs/api.md), or Swagger at `/api/docs`.

## Run locally

Requirements: Node.js 22.18+, SQL Server (SQL authentication enabled), and Redis 6.2+ for `RUN_MODE=split`. **No Redis?** Set `RUN_MODE=single` in `backend/.env`: SQL Server becomes the queue and only the API process runs (skip the worker terminal).

```bash
# 1. install
npm install --prefix database && npm install --prefix backend && npm install --prefix frontend

# 2. configure
cp backend/.env.example backend/.env       # MSSQL_*, REDIS_*, JWT_SECRET, ENCRYPTION_KEY
cp frontend/.env.example frontend/.env

# 3. database
npm run --prefix backend db:migrate
npm run --prefix backend db:seed           # Vittam, Hotel App, CRM + admin (password printed once)

# 4. run (three terminals)
npm run --prefix backend dev               # API      http://localhost:3000   (Swagger: /api/docs)
npm run --prefix backend dev:worker        # worker   (WhatsApp connections, queues)
npm run --prefix frontend dev              # dashboard http://localhost:5173
```

Then, in the dashboard: **WhatsApp Instances › Add instance** (Baileys) › **Connect** › scan the QR code. Then **Projects › (project) ›** assign the instance, set it as the priority in **WhatsApp Service**, and **Generate key**.

## Tests

```bash
npm --prefix backend test                  # unit: failover/retry/idempotency engine with mocked providers, domain + security rules
npm --prefix backend run test:integration  # API against the real MSSQL from backend/.env (creates and cleans up its own data)
npm --prefix backend run typecheck && npm --prefix frontend run typecheck
```

No real WhatsApp account is needed for automated tests.

## Production

VPS: `scripts/deploy.ps1` (install → build → migrate → PM2 reload). Shared hosting without VPS/Redis (e.g. GrabWeb Plesk): `RUN_MODE=single` + `backend/web.config`. Details, including the reverse proxy, startup persistence, the Meta webhook and backups, are in [docs/deployment.md](docs/deployment.md).

## Key rules

1. Clients never choose a provider. Each project's **WhatsApp Service** (in the DB) sets a priority instance and an optional fallback instance.
2. One instance can serve many projects; priority and fallback must be assigned to the project and must differ.
3. The fallback is used only when the priority **definitely did not send** the message. An ambiguous outcome becomes `UNKNOWN` and is never blindly resent ([docs/failover.md](docs/failover.md)).
4. `idempotencyKey` guarantees one message per key per project.
5. Meta instances are READY only after Meta confirms credentials, phone registration and the webhook. Templates are APPROVED only when Meta says so.
6. Secrets (Meta tokens, webhook secrets) are AES-256-GCM encrypted. API keys and passwords are stored only as hashes. Baileys sessions stay on disk and are never committed.
