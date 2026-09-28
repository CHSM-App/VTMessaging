# Messaging flow

```text
Client ──> API ──> MSSQL ──> Queue (BullMQ/Redis) ──> Worker ──> Provider ──> WhatsApp
                                                        │
                           receipts / webhooks <────────┘ ──> MSSQL ──> project webhook + dashboard
```

## 1. API (`messaging/application/sendMessage.ts`)

1. **Validate:** a Zod schema per message type; the recipient is normalized to digits.
2. **Authenticate:** the API key resolves the project. A project id is never accepted from the client.
3. **Idempotency:** if `(project, idempotencyKey)` exists, return that message. Two concurrent requests with the same key race on the filtered unique index, exactly one insert wins, and the loser returns the winner's message.
4. **Create:** insert the `messages` row with status `CREATED`. From here MSSQL holds the truth.
5. **Queue:** add job `send_<messageId>`, then `CREATED → QUEUED`. The update is conditional, so it never overwrites progress the worker has already made.
6. **Return** `{ messageId, status }` (202).

If Redis is unreachable, step 5 times out after 5 s. The API still returns 202 with status `CREATED`, and the worker's recovery sweep queues the message once Redis is back.

## 2. Worker (`messaging/application/processMessage.ts`)

For each job:

1. Load the message. If it is already `SENT`/`DELIVERED`/`READ`/`FAILED`/`UNKNOWN`, **skip**. The worker never re-sends a settled message.
2. If it is `SENDING`, a previous worker died mid-send. Mark it **`UNKNOWN`** (`INTERRUPTED_DURING_SEND`) and do not send.
3. Mark it `PROCESSING` and load the route: `[priority, fallback]`, only instances still assigned and enabled for the project.
4. For each instance in order:
   - record a `message_attempts` row (STARTED) and set the message to `SENDING`
   - call the provider through the `WhatsAppProvider` interface
   - **success:** attempt `SENT`, message `SENT` with the provider message id. Done.
   - **UNKNOWN outcome:** attempt and message `UNKNOWN`. **Stop: no fallback, no retry.**
   - **NOT_SENT:** attempt `FAILED`, message back to `PROCESSING`. Try the fallback if the error allows it (see [failover.md](failover.md)).
5. If every instance failed with NOT_SENT and at least one failure was temporary, the message goes back to `QUEUED` and the job is retried with exponential backoff (10 s, 20 s, 40 s, …). On the final attempt the message becomes `FAILED`.

Only one job id exists per message, and BullMQ locks active jobs, so a message is never processed by two workers at once.

## 3. After sending

- **Baileys** reports receipts through `messages.update` (server ack → `SENT`, delivery → `DELIVERED`, read/played → `READ`).
- **Meta** reports `sent`/`delivered`/`read`/`failed` through the signed webhook.
- `applyReceipt` moves messages **forward only**. A receipt for an `UNKNOWN` message resolves it: Baileys message ids are derived from the attempt id before sending, so they are known even after a timeout.
- Every status change is pushed to the dashboard (`message.status`) and queued as a project webhook delivery (`message.sent`, `.delivered`, `.read`, `.failed`, `.unknown`).

## Lifecycle

```text
CREATED → QUEUED → PROCESSING → SENDING → SENT → DELIVERED → READ
                        ↑           │
                        └── retry ──┤  (NOT_SENT, temporary)
                                    ├──> FAILED   (permanent, or retries exhausted)
                                    └──> UNKNOWN  (ambiguous; waits for a receipt or an operator)
```

## Operator actions

- **Retry** a `FAILED` message: back to `QUEUED`, re-sent from the priority instance.
- **Retry** an `UNKNOWN` message: needs explicit confirmation (`confirmUnknown: true`) because the recipient may already have it. Audited as `message.retried`.

## Recovery sweep (worker, every 60 s)

- `CREATED` older than 30 s → queue (the API could not reach Redis)
- `QUEUED` untouched for 15 min → re-add the job (no-op if the job still exists)
- unprocessed `webhook_events` older than 1 min → re-queue
