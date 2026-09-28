# Deployment

Direct Node.js deployment. No Docker or Kubernetes. Two modes, chosen with `RUN_MODE` in `backend/.env`:

| | `RUN_MODE=split` (VPS) | `RUN_MODE=single` (shared hosting, e.g. GrabWeb Plesk) |
|---|---|---|
| Processes | API + worker (PM2) | one process (IIS/iisnode) |
| Queue | Redis + BullMQ | SQL Server tables (polled every 1-2 s) |
| Redis | required | not used |
| Section | 1-7 below | [Shared hosting](#shared-hosting-run_modesingle) |

The message flow, failover, idempotency and UNKNOWN rules are identical in both.

## Prerequisites

| Component | Version | Notes |
|---|---|---|
| Node.js | 22.18+ | the migration scripts use Node's built-in TypeScript support |
| SQL Server | 2016+ (Express works) | SQL authentication enabled; one database + login with `db_owner` on it |
| Redis | 6.2+ recommended (5.0 minimum for BullMQ) | on Windows: Memurai, or Redis on a Linux host; don't expose it to the internet |
| PM2 | latest | `npm i -g pm2` |
| Reverse proxy | nginx / IIS (ARR) / Caddy | TLS, and WebSocket upgrade for `/socket.io/` |

## 1. Database

```sql
CREATE DATABASE vengurla_messaging;
CREATE LOGIN vengurla_msg WITH PASSWORD = '<strong password>';
USE vengurla_messaging;
CREATE USER vengurla_msg FOR LOGIN vengurla_msg;
ALTER ROLE db_owner ADD MEMBER vengurla_msg;
ALTER DATABASE vengurla_messaging SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
```

## 2. Configuration

```bash
cp backend/.env.example backend/.env      # then fill it in
cp frontend/.env.example frontend/.env    # public URLs only
```

Backend essentials: `NODE_ENV=production`, `MSSQL_*`, `REDIS_*`, `JWT_SECRET`, `ENCRYPTION_KEY`, `FRONTEND_URL` (the dashboard origin; comma-separate several), `BAILEYS_AUTH_DIR` (an absolute path outside the web root), and `META_*` when Meta is used.

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> **Back up `ENCRYPTION_KEY`.** It encrypts Meta access tokens and webhook secrets. If you lose or change it, those values must be re-entered.

The backend refuses to start and lists the problem if any variable is missing or invalid.

## 3. Build, migrate, start

Windows: `powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1`. Linux or manual:

```bash
npm ci --prefix database && npm ci --prefix backend && npm ci --prefix frontend
npm run --prefix backend build
npm run --prefix backend db:migrate
npm run --prefix frontend build          # static files in frontend/dist
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

First install only, create the first dashboard admin (no sample data in production):

```bash
SEED_ENV=production SEED_ADMIN_EMAIL=you@vengurlatech.com SEED_ADMIN_PASSWORD='<strong password>' npm run --prefix backend db:seed
```

On PowerShell set the variables first (`$env:SEED_ENV='production'` …). Change the password after the first login. The development seeds (Vittam, Hotel App and CRM sample projects) refuse to run with `NODE_ENV=production`.

## 4. PM2

`ecosystem.config.cjs` runs two apps from `backend/`:

| App | Script | Notes |
|---|---|---|
| `vengurla-messaging-api` | `dist/app/server.js` | stateless; can be scaled later (then move rate limiting to a Redis store) |
| `vengurla-messaging-worker` | `dist/worker.js` | **exactly one instance**: it owns the Baileys sessions |

Both restart automatically and shut down gracefully:

- **API:** stops accepting requests, finishes in-flight ones, closes Socket.IO, Redis, then MSSQL.
- **Worker:** stops taking jobs, finishes in-flight sends, disconnects providers *without* logging out (sessions survive), closes Redis and MSSQL.

`shutdown_with_message` makes this work on Windows too.

Startup persistence:

- **Linux:** `pm2 startup` (run the printed command), then `pm2 save`.
- **Windows:** `npm i -g pm2-windows-startup && pm2-startup install`, then `pm2 save` (or run PM2 as a service with `pm2-installer`).

Useful: `pm2 status`, `pm2 logs vengurla-messaging-worker`, `pm2 reload vengurla-messaging-api`.

## 5. Reverse proxy

- `https://messaging.example.com/` → `frontend/dist` (static; SPA fallback to `index.html`)
- `https://messaging-api.example.com/` → `http://127.0.0.1:3000`, with WebSocket upgrade for `/socket.io/`

Then set `VITE_API_URL` and `VITE_SOCKET_URL` to the API URL before building the frontend, and `FRONTEND_URL` to the dashboard origin. The API trusts one proxy hop (`trust proxy = 1`) for client IPs.

## 6. Meta webhook

In the Meta app, set the callback URL to `https://<api>/api/v1/webhooks/meta` with verify token `META_WEBHOOK_VERIFY_TOKEN`, and subscribe to `messages` and `message_template_status_update`. `META_APP_SECRET` must be set, or signed POSTs are rejected.

## 7. Operations

- **Health:** `GET /health` (details), `/health/live` (process up), `/health/ready` (MSSQL + Redis). Point your monitor at `/health/ready`.
- **Logs:** Pino JSON on stdout, collected by PM2 (`~/.pm2/logs`). Use `pm2 install pm2-logrotate`.
- **Backups:** the SQL Server database, and the `BAILEYS_AUTH_DIR` directory (losing it means re-pairing every Baileys number). Never put the sessions in Git or a public folder.
- **Upgrades:** run `scripts/deploy.ps1` again. Migrations are forward-only in production; back up before running them.
- **Redis data loss** is survivable: MSSQL is the source of truth and the worker re-queues pending messages within minutes.

## Shared hosting (RUN_MODE=single)

For a Windows/Plesk plan with Node.js support and no VPS (e.g. GrabWeb). No Redis, no PM2.

1. **Ask the host** (once): are Node.js apps supported (iisnode)? Is the app folder writable (Baileys saves its session there)? May `web.config` `<iisnode>` settings be overridden?
2. **Build on your PC:** `npm ci --prefix backend && npm run --prefix backend build`. Then `npm run --prefix frontend build`, with `VITE_API_URL` and `VITE_SOCKET_URL` in `frontend/.env` set to the API site URL.
3. **Upload** `backend/` (including `dist/`, `node_modules/`, `package.json` and `web.config`) to the API site, and the contents of `frontend/dist/` to the dashboard site (any static hosting works).
4. **Create `backend/.env` on the server** with: `RUN_MODE=single`, `NODE_ENV=production`, `MSSQL_*` (e.g. the GrabWeb SQL Server), `JWT_SECRET`, `ENCRYPTION_KEY`, and `FRONTEND_URL` = the dashboard URL. No `REDIS_*` settings are needed.
5. **Migrate from your PC** against the hosted database: `npm run --prefix backend db:migrate`, with the same `MSSQL_*` values in your local `backend/.env`. Then create the first admin (step 3 of the main guide, with `SEED_ENV=production`).
6. **Keep it awake:** IIS stops idle apps after about 20 minutes, which would drop the WhatsApp connection. Add a free uptime monitor (UptimeRobot, cron-job.org) that calls `https://<api>/health/live` every 5 minutes.

What `backend/web.config` does:
- routes every request to `dist/app/server.js`
- hides `.env`, `storage` and `src`
- runs **one Node process** (two would open the same WhatsApp session twice)
- restarts the app only when `web.config` changes, not when Baileys writes its session files

What to expect: the daily IIS recycle takes the app offline for a few seconds. The saved session then reconnects without a new QR scan. Messages accepted during a restart wait in SQL Server and are sent right after. Don't start `dist/worker.js` in this mode; it refuses to run.

Moving to a VPS later: set `RUN_MODE=split`, install Redis and use PM2 (sections 1–7). No code changes, same database.
