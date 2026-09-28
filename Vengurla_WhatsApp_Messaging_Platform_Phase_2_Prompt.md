# Vengurla Tech WhatsApp Messaging Platform
## Phase 2 - Production Architecture & Implementation Prompt

You are building Phase 2 of the Vengurla Tech WhatsApp Messaging Platform.

## 1. Project Overview

Build an independent, production-oriented, company-wide WhatsApp Messaging Platform for Vengurla Tech.

This platform is **not part of Vittam**.

It will be consumed by:

- Vittam
- Hotel Management App
- CRM
- Future Vengurla Tech applications

The platform must provide a provider-independent WhatsApp messaging API.

Client applications should only need to know:

- Messaging Platform API URL
- Project API key
- Message payload

They must NOT know anything about:

- Baileys
- Meta Cloud API
- WhatsApp sessions
- QR codes
- provider health
- provider failover
- Redis
- BullMQ
- provider-specific errors
- Meta templates

---

## 2. High-Level Architecture

Use a proper layered architecture.

```text
Vengurla Tech
│
├── Vittam
├── Hotel App
├── CRM
│
└── Vengurla WhatsApp Messaging Platform
        │
        ├── Frontend / Admin Dashboard
        │
        └── Backend API
              │
              ├── Application Layer
              ├── Domain Layer
              ├── Infrastructure Layer
              │
              ├── MSSQL
              ├── Redis
              ├── BullMQ
              │
              └── WhatsApp Providers
                    ├── Baileys
                    └── Meta Cloud API
```

Use this architecture:

```text
                    ┌──────────────────────────┐
                    │     Client Applications   │
                    │                           │
                    │ Vittam | Hotel | CRM     │
                    └────────────┬─────────────┘
                                 │
                                 │ REST API
                                 ▼
                    ┌──────────────────────────┐
                    │   Messaging Platform     │
                    │      Backend API          │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
               Application                  Queue
                 Layer                 Redis + BullMQ
                    │                         │
                    │                         ▼
                    │                       Worker
                    │                         │
                    └────────────┬────────────┘
                                 │
                                 ▼
                         Messaging Service
                                 │
                       Provider Abstraction
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
                 Baileys                Meta Cloud API
                 Primary                   Fallback
```

---

## 3. Frontend and Backend Must Be Separate

Do NOT mix frontend and backend source code.

Use separate frontend and backend applications.

Recommended project structure:

```text
vengurla-messaging-platform/
│
├── backend/
├── frontend/
├── database/
├── docs/
├── scripts/
├── .gitignore
└── README.md
```

The frontend and backend must have independent `package.json` files.

The frontend must never directly access MSSQL.

The frontend communicates only with backend APIs and WebSocket/Socket.IO.

The backend owns:

- database
- Redis
- BullMQ
- providers
- authentication
- authorization
- business rules
- messaging
- webhooks

---

## 4. Final Technology Stack

### Backend

- Node.js
- TypeScript
- Express.js

### Database

- Microsoft SQL Server (MSSQL)

**Do NOT use PostgreSQL.**

### WhatsApp

- Baileys = primary/preferred provider
- Meta WhatsApp Cloud API = fallback provider

### Queue

- Redis
- BullMQ

### Admin Dashboard

- React
- TypeScript
- Tailwind CSS

### Realtime

- Socket.IO

### Validation

- Zod

### Logging

- Pino

### Process Manager

- PM2

### API Documentation

- Swagger/OpenAPI

### Version Control

- Git/GitHub

### Deployment

- Direct Node.js deployment
- PM2

Do NOT use:

- Docker
- Kubernetes
- Docker Compose
- Go

---

## 5. Backend Architecture

Use a clean layered architecture inspired by:

- Clean Architecture
- Hexagonal Architecture
- Domain/Application/Infrastructure separation

Use practical separation of responsibilities without unnecessary complexity.

Recommended backend structure:

```text
backend/
│
├── src/
│   │
│   ├── app/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── routes.ts
│   │   └── container.ts
│   │
│   ├── config/
│   │   ├── env.ts
│   │   ├── database.ts
│   │   ├── redis.ts
│   │   └── logger.ts
│   │
│   ├── modules/
│   │   │
│   │   ├── auth/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   └── presentation/
│   │   │
│   │   ├── projects/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   └── presentation/
│   │   │
│   │   ├── api-keys/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   └── presentation/
│   │   │
│   │   ├── whatsapp-instances/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   └── presentation/
│   │   │
│   │   ├── whatsapp-service/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   └── presentation/
│   │   │
│   │   ├── messaging/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   └── presentation/
│   │   │
│   │   ├── templates/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   └── presentation/
│   │   │
│   │   ├── webhooks/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   └── presentation/
│   │   │
│   │   ├── health/
│   │   │   ├── application/
│   │   │   └── presentation/
│   │   │
│   │   └── audit/
│   │       ├── domain/
│   │       ├── application/
│   │       ├── infrastructure/
│   │       └── presentation/
│   │
│   ├── providers/
│   │   └── whatsapp/
│   │       ├── contracts/
│   │       │   ├── WhatsAppProvider.ts
│   │       │   ├── types.ts
│   │       │   └── errors.ts
│   │       │
│   │       ├── baileys/
│   │       │   ├── BaileysProvider.ts
│   │       │   ├── BaileysSessionManager.ts
│   │       │   ├── BaileysConnectionManager.ts
│   │       │   └── mappers/
│   │       │
│   │       └── meta/
│   │           ├── MetaCloudProvider.ts
│   │           ├── MetaClient.ts
│   │           ├── MetaWebhookHandler.ts
│   │           └── mappers/
│   │
│   ├── queue/
│   │   ├── queues/
│   │   ├── jobs/
│   │   ├── workers/
│   │   └── queue.config.ts
│   │
│   ├── realtime/
│   │   ├── socket.ts
│   │   ├── events.ts
│   │   └── rooms.ts
│   │
│   ├── middleware/
│   │   ├── authentication.ts
│   │   ├── authorization.ts
│   │   ├── validation.ts
│   │   ├── rateLimiter.ts
│   │   ├── errorHandler.ts
│   │   └── requestLogger.ts
│   │
│   ├── shared/
│   │   ├── errors/
│   │   ├── types/
│   │   ├── constants/
│   │   ├── utils/
│   │   └── helpers/
│   │
│   └── docs/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── package.json
├── tsconfig.json
└── .env.example
```

Do not put everything into generic `controllers/`, `services/`, and `utils/` folders if that destroys module boundaries.

---

## 6. Module Architecture

Each major backend module should follow:

```text
module/
│
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── enums/
│   ├── errors/
│   └── repositories/
│
├── application/
│   ├── commands/
│   ├── queries/
│   ├── use-cases/
│   └── dto/
│
├── infrastructure/
│   ├── repositories/
│   ├── database/
│   └── mappers/
│
└── presentation/
    ├── controllers/
    ├── routes/
    ├── validators/
    └── serializers/
```

Do not force every module to contain every folder if it genuinely does not need it.

---

## 7. Domain Layer

Domain layer must not depend on:

- Express
- React
- MSSQL driver
- Redis
- BullMQ
- Baileys
- Meta SDK

Domain should contain business concepts and rules.

Example:

WhatsApp Instance domain can understand:

- instance status
- provider type
- health state
- instance identity

But should not know how Baileys connects.

---

## 8. Application Layer

Application layer contains use cases.

Examples:

- CreateProject
- GenerateApiKey
- CreateWhatsAppInstance
- AssignInstanceToProject
- ConfigureWhatsAppService
- SendMessage
- ProcessMessage
- RetryMessage
- FailoverMessage
- ConnectBaileysInstance
- DisconnectInstance
- CreateTemplate
- ProcessWebhook

Use cases coordinate domain and infrastructure.

---

## 9. Infrastructure Layer

Infrastructure implements external systems:

- MSSQL repositories
- Redis
- BullMQ
- Baileys
- Meta Cloud API
- Socket.IO
- external HTTP clients

Do not leak infrastructure implementation into domain.

---

## 10. Presentation Layer

Presentation handles:

- Express controllers
- routes
- request validation
- authentication
- response serialization

Controllers must be thin.

Example:

```text
Controller
    ↓
Validate request
    ↓
Call Use Case
    ↓
Serialize response
```

Do not put business logic inside controllers.

---

# 11. Frontend Architecture

Frontend must be a completely separate React application.

Recommended structure:

```text
frontend/
│
├── src/
│   │
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.tsx
│   │   └── providers.tsx
│   │
│   ├── layouts/
│   │   ├── AdminLayout.tsx
│   │   └── AuthLayout.tsx
│   │
│   ├── pages/
│   │   ├── dashboard/
│   │   ├── projects/
│   │   ├── instances/
│   │   ├── messages/
│   │   ├── templates/
│   │   ├── api-keys/
│   │   ├── webhooks/
│   │   ├── logs/
│   │   └── settings/
│   │
│   ├── features/
│   │   ├── projects/
│   │   ├── instances/
│   │   ├── messages/
│   │   ├── templates/
│   │   └── api-keys/
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── forms/
│   │   ├── tables/
│   │   ├── dialogs/
│   │   └── feedback/
│   │
│   ├── services/
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── projects.ts
│   │   │   ├── instances.ts
│   │   │   ├── messages.ts
│   │   │   ├── templates.ts
│   │   │   └── apiKeys.ts
│   │   │
│   │   └── socket/
│   │       └── socket.ts
│   │
│   ├── hooks/
│   ├── stores/
│   ├── types/
│   ├── schemas/
│   ├── utils/
│   ├── constants/
│   ├── assets/
│   └── styles/
│
├── public/
├── package.json
├── tsconfig.json
└── .env.example
```

Frontend should follow feature-oriented organization.

---

## 12. Frontend Responsibility

Frontend owns:

- UI
- routing
- forms
- tables
- filters
- dashboard
- realtime visualization
- API calls
- client-side state

Frontend must NOT own:

- provider selection
- failover
- database access
- Redis
- queue processing
- WhatsApp authentication
- Meta access tokens
- Baileys sessions
- business-critical authorization

---

# 13. Core Domain Concepts

## Project

A Vengurla Tech application.

Examples:

- Vittam
- Hotel App
- CRM

## WhatsApp Instance

One WhatsApp number + one provider connection.

Examples:

```text
Vittam Primary
Provider: Baileys
Phone: +91XXXXXXXXXX
```

or:

```text
Vengurla Meta Backup
Provider: Meta Cloud API
Phone: +91XXXXXXXXXX
```

One instance can serve multiple projects.

## Provider

The communication mechanism:

- Baileys
- Meta Cloud API

## WhatsApp Service

Project-level configuration:

```text
Project: Vittam

Priority Instance:
Vittam Baileys

Fallback Instance:
Vengurla Meta
```

---

# 14. Provider Rule

Projects must NEVER directly choose:

- Baileys
- Meta

Projects only use:

```text
WhatsApp Messaging Service
```

The platform resolves the provider.

---

# 15. Baileys Is Primary

Company policy:

```text
Priority:
Baileys

Fallback:
Meta Cloud API
```

Baileys is preferred because it does not have Meta Cloud API per-message API charges.

Do not hard-code provider selection throughout the application.

Store provider and instance configuration in the database.

---

# 16. Failover Safety

Never blindly retry an ambiguous timeout through another provider.

Possible states:

```text
NOT_SENT
SENT
FAILED
UNKNOWN
```

Safe:

```text
Baileys fails before sending
→ NOT_SENT
→ Meta fallback allowed
```

Unsafe:

```text
Baileys timeout after request may have been accepted
→ UNKNOWN
→ Do NOT blindly send through Meta
```

Implement safe fallback logic.

---

# 17. Provider Interface

Create a provider abstraction:

```ts
interface WhatsAppProvider {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getHealth(): Promise<ProviderHealth>;
    getStatus(): Promise<ProviderStatus>;
    sendText(request: SendTextRequest): Promise<SendResult>;
    sendImage(request: SendMediaRequest): Promise<SendResult>;
    sendDocument(request: SendMediaRequest): Promise<SendResult>;
    sendTemplate(request: SendTemplateRequest): Promise<SendResult>;
}
```

Implement:

```text
WhatsAppProvider
├── BaileysProvider
└── MetaCloudProvider
```

The application layer depends on the interface, not concrete providers.

---

# 18. Existing Baileys POC

The existing POC supports:

- QR pairing
- WhatsApp authentication
- persistent session
- reconnect/status
- dashboard
- text messages
- PDF/document sending

First inspect it.

Do not rewrite it blindly.

Refactor it into `BaileysProvider` while preserving working functionality.

Verify after refactoring:

- QR works
- authentication works
- session persists
- reconnect works
- text sending works
- PDF sending works
- status works

---

# 19. Baileys Session Storage

Recommended:

```text
storage/
└── baileys/
    └── instances/
        ├── instance-id-1/
        │   └── auth/
        └── instance-id-2/
            └── auth/
```

Do not expose this publicly.

Do not commit it to Git.

Make the storage path configurable through environment variables.

---

# 20. Baileys Instance Lifecycle

```text
CREATING
↓
WAITING_FOR_PAIRING
↓
CONNECTING
↓
CONNECTED
```

Other states:

```text
DISCONNECTED
RECONNECTING
ERROR
```

Dashboard must show live state.

---

# 21. Meta Cloud API

Implement `MetaCloudProvider`.

Support architecture for:

- WABA ID
- Phone Number ID
- Access Token
- Webhook
- template messages
- supported media
- delivery status
- incoming events
- health checks

Current Meta phone registration is not ready.

Do not fake Meta connectivity.

Do not mark Meta instance READY until actual validation succeeds.

---

# 22. Meta Lifecycle

```text
CREATED
↓
CONFIGURING
↓
CREDENTIALS_VALID
↓
PHONE_REGISTERED
↓
WEBHOOK_VERIFIED
↓
READY
```

Possible errors:

```text
CONFIG_ERROR
AUTH_ERROR
PHONE_REGISTRATION_FAILED
WEBHOOK_ERROR
```

---

# 23. Meta Templates

Create template management.

Support:

- create template
- name
- category
- language
- header
- body
- footer
- variables
- buttons
- Meta status
- rejection reason
- synchronization

Meta remains the authority for approval.

Do not show a template as approved unless Meta approved it.

Baileys does not require Meta templates.

---

# 24. Projects

Create Projects module.

Fields:

```text
id
name
slug
description
status
created_at
updated_at
deleted_at
```

Statuses:

```text
ACTIVE
INACTIVE
```

Dashboard should support:

- create
- edit
- activate/deactivate
- view
- API keys
- assigned instances
- WhatsApp Service
- messages
- webhook

---

# 25. API Keys

Each project has API keys.

Requirements:

- generate
- revoke
- rotate
- secure storage
- show full secret only at creation
- created_at
- last_used_at
- optional expiration
- status

Store only secure hashes where appropriate.

Never trust a project ID supplied by a client without validating the API key.

---

# 26. Project ↔ Instance Relationship

One instance can be assigned to multiple projects.

Use:

```text
project_whatsapp_instances
```

Do NOT put a single `project_id` on `whatsapp_instances`.

Fields:

```text
id
project_id
instance_id
is_enabled
created_at
```

Unique:

```text
(project_id, instance_id)
```

---

# 27. Project WhatsApp Service

Use:

```text
project_whatsapp_services
```

Fields:

```text
id
project_id
priority_instance_id
fallback_instance_id
created_at
updated_at
```

Rules:

- priority must belong to project
- fallback is optional
- fallback must belong to project
- priority and fallback cannot be same instance

---

# 28. Database Architecture

Use **Microsoft SQL Server / MSSQL**.

No PostgreSQL.

Create a dedicated:

```text
database/
```

directory:

```text
database/
│
├── migrations/
│   ├── 001_create_projects.sql
│   ├── 002_create_api_keys.sql
│   ├── 003_create_whatsapp_instances.sql
│   ├── 004_create_project_whatsapp_instances.sql
│   ├── 005_create_project_whatsapp_services.sql
│   ├── 006_create_messages.sql
│   ├── 007_create_message_attempts.sql
│   ├── 008_create_templates.sql
│   ├── 009_create_webhook_events.sql
│   ├── 010_create_webhook_deliveries.sql
│   └── 011_create_audit_logs.sql
│
├── seeds/
│   └── development/
│
├── scripts/
│   ├── migrate.ts
│   ├── rollback.ts
│   └── seed.ts
│
└── README.md
```

---

# 29. Migration System

Actually implement the migration system.

Do not just document migrations.

Create:

```text
schema_migrations
```

with:

```text
id
migration_name
executed_at
```

Migration runner must:

- connect to MSSQL
- execute migrations in order
- never execute the same migration twice
- track execution
- use transactions where practical
- report failures
- support rollback where practical

Commands:

```text
npm run db:migrate
npm run db:rollback
npm run db:seed
```

Do not rely on manually creating tables in SSMS.

---

# 30. Required MSSQL Migrations

Actually create these files:

```text
001_create_projects.sql
002_create_api_keys.sql
003_create_whatsapp_instances.sql
004_create_project_whatsapp_instances.sql
005_create_project_whatsapp_services.sql
006_create_messages.sql
007_create_message_attempts.sql
008_create_templates.sql
009_create_webhook_events.sql
010_create_webhook_deliveries.sql
011_create_audit_logs.sql
```

Each file must contain real MSSQL SQL.

Do NOT use PostgreSQL syntax.

Use appropriate SQL Server types such as:

- UNIQUEIDENTIFIER
- NVARCHAR
- BIT
- DATETIME2
- INT/BIGINT as appropriate

For GUID primary keys, consider `NEWSEQUENTIALID()` where appropriate.

Store timestamps in UTC.

Use `DATETIME2`.

---

# 31. Projects Table

Create:

```text
projects
```

Fields:

```text
id
name
slug
description
status
created_at
updated_at
deleted_at
```

Create a unique constraint on `slug`.

---

# 32. API Keys Table

Create:

```text
api_keys
```

Fields:

```text
id
project_id
name
key_prefix
key_hash
status
expires_at
last_used_at
created_at
revoked_at
```

Foreign key:

```text
api_keys.project_id → projects.id
```

Do not store raw API secrets.

---

# 33. WhatsApp Instances Table

Create:

```text
whatsapp_instances
```

Fields:

```text
id
name
provider
phone_number
status
health_status
provider_config
created_at
updated_at
deleted_at
```

Provider values:

```text
BAILEYS
META_CLOUD
```

Sensitive provider configuration must be securely protected.

Do not store Baileys session/auth data here.

---

# 34. Project Instance Table

Create:

```text
project_whatsapp_instances
```

Fields:

```text
id
project_id
instance_id
is_enabled
created_at
```

Foreign keys:

```text
project_id → projects.id
instance_id → whatsapp_instances.id
```

Unique:

```text
(project_id, instance_id)
```

---

# 35. Project WhatsApp Service Table

Create:

```text
project_whatsapp_services
```

Fields:

```text
id
project_id
priority_instance_id
fallback_instance_id
created_at
updated_at
```

Foreign keys:

```text
project_id → projects.id
priority_instance_id → whatsapp_instances.id
fallback_instance_id → whatsapp_instances.id
```

Validate project ownership in application layer.

---

# 36. Messages Table

Create:

```text
messages
```

Fields:

```text
id
project_id
instance_id
recipient
message_type
content
template_id
status
idempotency_key
provider_message_id
failure_code
failure_reason
created_at
queued_at
processing_at
sent_at
delivered_at
read_at
failed_at
updated_at
```

Indexes:

```text
project_id
status
created_at
idempotency_key
```

Create appropriate uniqueness for:

```text
project_id + idempotency_key
```

---

# 37. Message Attempts Table

Create:

```text
message_attempts
```

Fields:

```text
id
message_id
instance_id
provider
attempt_number
status
provider_message_id
error_code
error_message
started_at
completed_at
created_at
```

Index:

```text
message_id
```

---

# 38. Templates Table

Create:

```text
templates
```

Fields:

```text
id
project_id
provider
name
category
language
header
body
footer
variables
buttons
provider_template_id
status
rejection_reason
created_at
updated_at
```

---

# 39. Webhook Events

Create:

```text
webhook_events
```

Fields:

```text
id
provider
event_type
external_event_id
payload
processed
processed_at
error
created_at
```

Add appropriate uniqueness for provider/external event ID where safe.

---

# 40. Webhook Deliveries

Create:

```text
webhook_deliveries
```

Fields:

```text
id
project_id
event_type
payload
target_url
status
attempts
last_attempt_at
delivered_at
failure_reason
created_at
```

---

# 41. Audit Logs

Create:

```text
audit_logs
```

Fields:

```text
id
actor_type
actor_id
action
resource_type
resource_id
metadata
created_at
```

---

# 42. Message Architecture

Messages are provider-independent.

Supported:

- text
- image
- document/PDF
- template

Message lifecycle:

```text
CREATED
↓
QUEUED
↓
PROCESSING
↓
SENDING
↓
SENT
↓
DELIVERED
↓
READ
```

Failure:

```text
FAILED
UNKNOWN
```

---

# 43. Message Attempts

Every provider attempt must be recorded.

Example:

```text
Message
├── Attempt 1
│   Provider: Baileys
│   Status: FAILED
│
└── Attempt 2
    Provider: Meta
    Status: SENT
```

---

# 44. Unified Messaging API

Create:

```http
POST /api/v1/messages
```

Example:

```json
{
  "to": "919876543210",
  "type": "text",
  "text": {
    "body": "Your bill has been generated."
  },
  "idempotencyKey": "invoice-1001-whatsapp"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "messageId": "msg_123",
    "status": "QUEUED"
  }
}
```

Client must NOT specify provider.

---

# 45. Queue Architecture

Use:

```text
Application
↓
Messaging API
↓
MSSQL Message Record
↓
BullMQ
↓
Redis
↓
Worker
↓
Messaging Service
↓
Provider
↓
WhatsApp
```

API:

1. Validate
2. Authenticate
3. Check idempotency
4. Create message
5. Queue job
6. Return message ID

Worker:

- performs actual sending
- updates status
- records attempts
- handles retry/fallback

---

# 46. Redis + BullMQ Structure

```text
backend/src/queue/

queue/
├── queues/
│   ├── whatsappSendQueue.ts
│   ├── whatsappRetryQueue.ts
│   └── webhookQueue.ts
│
├── jobs/
│   ├── sendMessageJob.ts
│   ├── retryMessageJob.ts
│   └── processWebhookJob.ts
│
├── workers/
│   ├── whatsappWorker.ts
│   └── webhookWorker.ts
│
└── queue.config.ts
```

Use Redis for:

- queue state
- jobs
- retries
- delayed jobs
- worker coordination

MSSQL remains source of truth.

---

# 47. Retry Policy

Retry temporary failures:

- network timeout
- temporary provider unavailable
- connection lost
- rate limit

Do not blindly retry permanent failures:

- invalid phone
- invalid template
- authentication failure
- invalid credentials

Normalize provider errors.

---

# 48. Provider Health

Instance health:

```text
HEALTHY
DEGRADED
UNAVAILABLE
```

Monitor for Baileys:

- connection
- authentication
- reconnect
- send success
- send failures
- last successful message
- connection events

Monitor for Meta:

- credentials
- API response
- webhook health
- API errors
- phone registration
- token validity where possible

Health does NOT permanently change priority.

---

# 49. Dashboard

Main navigation:

```text
Dashboard
Projects
WhatsApp Instances
Messages
Templates
API Keys
Webhooks
Logs
Settings
```

Keep UI clean, professional and practical.

---

# 50. Dashboard Overview

Show actual data:

- Total Projects
- Active WhatsApp Instances
- Healthy Instances
- Messages Today
- Messages Sent
- Messages Failed
- Queued Messages
- Provider Health

Never fabricate metrics.

---

# 51. Project Detail

Sections:

- Project Information
- API Keys
- WhatsApp Service
- Assigned Instances
- Messages
- Usage
- Webhooks

WhatsApp Service:

```text
Priority Instance
[ select ]

Fallback Instance
[ select / None ]

[Save]
```

---

# 52. Instances Dashboard

Show:

- Instance Name
- Phone Number
- Provider
- Status
- Health
- Assigned Projects
- Last Activity
- Actions

---

# 53. Add Instance

Flow:

```text
WhatsApp Instances
↓
Add Instance
↓
Instance Name
↓
Provider
```

Providers:

```text
Baileys
Meta Cloud API
```

Display provider-specific configuration fields.

---

# 54. Instance Assignment

Allow:

- assign project
- remove project
- view assigned projects

One instance can serve many projects.

---

# 55. Instance Deletion

If assigned to projects, do not silently delete.

Show impacted projects.

If it is configured as priority/fallback for any project, explicitly show that.

Require confirmation.

---

# 56. QR Code

For Baileys WAITING_FOR_PAIRING:

- show QR
- refresh QR using Socket.IO
- show connection status

After pairing:

```text
CONNECTED
Phone Number
Health
```

---

# 57. Webhooks

Provider webhooks:

```text
Provider
↓
/api/v1/webhooks/{provider}
↓
Webhook processing
↓
Normalize
↓
Update message
↓
Notify project
```

Project webhooks should send normalized events.

Example:

```json
{
  "event": "message.delivered",
  "messageId": "msg_123",
  "status": "delivered",
  "timestamp": "..."
}
```

Support:

- webhook secret
- signature
- retry
- delivery logs
- failure handling

---

# 58. Security

Implement:

- API key authentication
- secure dashboard authentication
- password hashing
- environment variables
- validation
- rate limiting
- CORS
- request size limits
- authorization
- audit logs
- webhook verification
- secure secret storage

Never expose:

- Meta tokens
- API secrets
- Baileys auth
- passwords
- webhook secrets

Never log sensitive credentials.

---

# 59. Project Isolation

A project may access only:

- own messages
- own API keys
- own webhook configuration
- own assigned instances
- own usage

Enforce backend-side.

---

# 60. Admin Authentication

Keep admin and project authentication separate.

Dashboard:

- secure login
- password hashing
- session/JWT
- role-based authorization

Project API:

- API keys

Roles:

```text
ADMIN
OPERATOR
VIEWER
```

At minimum:

ADMIN = full access

OPERATOR = manage messaging resources but not sensitive system settings

VIEWER = read-only

---

# 61. Rate Limiting

Implement configurable rate limiting for:

- requests per project
- message throughput per project

Keep configurable.

---

# 62. Audit Logging

Record:

- project created
- project updated
- API key created
- API key revoked
- instance created
- instance connected
- instance disconnected
- instance assigned
- instance removed
- priority changed
- fallback changed
- template created
- template submitted
- template status changed

Store:

- actor
- action
- resource
- resource_id
- timestamp
- metadata

---

# 63. Zod

Use Zod for all external input.

Validate:

- body
- params
- query
- configuration
- webhook payloads where appropriate

Create schemas for:

- project creation
- API keys
- instance creation
- Baileys configuration
- Meta configuration
- project-instance assignment
- WhatsApp service configuration
- message requests
- templates
- webhooks

---

# 64. Pino

Use Pino structured logging.

Include:

- request ID
- project ID
- message ID
- instance ID
- provider
- error code

Example:

```ts
logger.info(
  {
    instanceId,
    provider
  },
  "WhatsApp instance connected"
);
```

Do not use uncontrolled `console.log`.

---

# 65. API Error Format

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

Do not expose stack traces in production.

---

# 66. API Versioning

Use:

```text
/api/v1/
```

Examples:

```text
/api/v1/projects
/api/v1/api-keys
/api/v1/instances
/api/v1/messages
/api/v1/templates
/api/v1/webhooks
/api/v1/health
```

Separate admin routes if appropriate:

```text
/api/v1/admin/projects
/api/v1/admin/instances
```

---

# 67. Swagger/OpenAPI

Document:

- authentication
- projects
- API keys
- instances
- messages
- templates
- webhooks
- health

Include request and response examples.

---

# 68. Environment Configuration

Backend:

```env
NODE_ENV=development
PORT=3000

MSSQL_HOST=
MSSQL_PORT=1433
MSSQL_DATABASE=
MSSQL_USER=
MSSQL_PASSWORD=

REDIS_HOST=
REDIS_PORT=6379
REDIS_PASSWORD=

JWT_SECRET=

BAILEYS_AUTH_DIR=

META_API_VERSION=
META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=

FRONTEND_URL=
```

Frontend:

```env
VITE_API_URL=
VITE_SOCKET_URL=
```

Never expose server secrets through Vite variables.

Create `.env.example`.

Never commit `.env`.

---

# 69. PM2

Run:

```text
vengurla-messaging-api
vengurla-messaging-worker
```

Example:

```bash
pm2 start backend/dist/server.js --name vengurla-messaging-api
pm2 start backend/dist/worker.js --name vengurla-messaging-worker
pm2 save
```

Configure automatic restart and startup persistence.

---

# 70. Health Endpoints

Create:

```text
GET /health
GET /health/live
GET /health/ready
```

Check:

- application
- MSSQL
- Redis

Do not expose secrets.

---

# 71. Graceful Shutdown

On shutdown:

1. Stop accepting new work.
2. Finish safe operations.
3. Close Socket.IO.
4. Close MSSQL connections.
5. Close Redis.
6. Disconnect WhatsApp providers safely.
7. Exit cleanly.

Do not corrupt Baileys sessions.

---

# 72. Testing

Backend:

```text
tests/
├── unit/
├── integration/
└── e2e/
```

Test:

- domain rules
- authorization
- idempotency
- provider selection
- failover
- retry
- repositories
- APIs
- queue processing

Mock WhatsApp providers.

Do not require real WhatsApp accounts for automated tests.

---

# 73. Seed Data

Development seed should create:

- sample admin
- Vittam project
- Hotel App project
- CRM project

Do NOT seed:

- real API keys
- real Meta credentials
- real WhatsApp credentials

---

# 74. Gitignore

Include:

```text
.env
.env.*
!.env.example

node_modules/
dist/
logs/

Baileys session directories

coverage/

frontend build output

temporary files
```

---

# 75. Documentation

Create:

```text
docs/
├── architecture.md
├── database.md
├── api.md
├── messaging-flow.md
├── failover.md
├── deployment.md
└── security.md
```

Document:

- architecture
- database
- API
- messaging flow
- failover
- deployment
- security

---

# 76. Final Repository Structure

The final repository should approximately be:

```text
vengurla-messaging-platform/
│
├── backend/
│   ├── src/
│   │   ├── app/
│   │   ├── config/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── projects/
│   │   │   ├── api-keys/
│   │   │   ├── whatsapp-instances/
│   │   │   ├── whatsapp-service/
│   │   │   ├── messaging/
│   │   │   ├── templates/
│   │   │   ├── webhooks/
│   │   │   ├── health/
│   │   │   └── audit/
│   │   ├── providers/
│   │   │   └── whatsapp/
│   │   │       ├── contracts/
│   │   │       ├── baileys/
│   │   │       └── meta/
│   │   ├── queue/
│   │   ├── realtime/
│   │   ├── middleware/
│   │   └── shared/
│   ├── tests/
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── features/
│   │   ├── components/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── types/
│   │   ├── schemas/
│   │   ├── utils/
│   │   └── styles/
│   ├── public/
│   ├── package.json
│   └── .env.example
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   ├── scripts/
│   └── README.md
│
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── api.md
│   ├── messaging-flow.md
│   ├── failover.md
│   ├── deployment.md
│   └── security.md
│
├── scripts/
├── .gitignore
└── README.md
```

---

# 77. Important Business Rules

1. One WhatsApp instance can serve multiple projects.
2. Projects can have multiple assigned instances.
3. Each project has one priority instance and optional fallback instance.
4. Priority/fallback must be assigned to that project.
5. Priority and fallback cannot be the same.
6. Baileys is currently preferred.
7. Meta is fallback.
8. Health does not permanently change priority.
9. Never blindly fallback after UNKNOWN.
10. Idempotency prevents duplicate messages.
11. Projects never select providers directly.
12. Provider-specific logic stays inside adapters.

---

# 78. Future Meta Embedded Signup

Architect for future Meta Embedded Signup/customer-owned WhatsApp onboarding.

Future flow:

```text
Dashboard
↓
Connect WhatsApp
↓
Meta Embedded Signup
↓
Customer authorization
↓
WABA/Phone information
↓
Create Meta Instance
↓
Webhook configuration
↓
READY
```

Do NOT implement this now.

Only make architecture extensible.

---

# 79. No SMS or Email

This platform is WhatsApp-only.

Do not implement:

- SMS
- email
- telecom providers
- OTP SMS

---

# 80. Development Order

Implement incrementally.

### Step 1
Inspect current repository.

### Step 2
Create/refactor separate backend/frontend/database structure.

### Step 3
Set up backend architecture.

### Step 4
Set up MSSQL migration system.

### Step 5
Create initial MSSQL migrations.

### Step 6
Implement Projects.

### Step 7
Implement Admin authentication.

### Step 8
Implement API keys.

### Step 9
Implement WhatsApp Instances.

### Step 10
Implement Project ↔ Instance assignment.

### Step 11
Implement WhatsApp Service configuration.

### Step 12
Refactor existing Baileys implementation into BaileysProvider.

### Step 13
Verify QR/session/reconnect/text/PDF.

### Step 14
Implement MetaCloudProvider architecture.

### Step 15
Implement unified Messaging API.

### Step 16
Implement message persistence.

### Step 17
Implement Redis/BullMQ.

### Step 18
Implement worker.

### Step 19
Implement retries/idempotency.

### Step 20
Implement safe fallback.

### Step 21
Implement message status tracking.

### Step 22
Implement Socket.IO.

### Step 23
Implement provider webhooks.

### Step 24
Implement client webhooks.

### Step 25
Implement templates.

### Step 26
Implement health monitoring.

### Step 27
Implement audit logs.

### Step 28
Implement rate limiting/security.

### Step 29
Implement Swagger.

### Step 30
Implement tests.

### Step 31
Prepare PM2 deployment.

---

# 81. Critical Migration Requirement

Do not merely describe migrations.

Actually create the migration files.

At minimum:

```text
database/migrations/

001_create_projects.sql
002_create_api_keys.sql
003_create_whatsapp_instances.sql
004_create_project_whatsapp_instances.sql
005_create_project_whatsapp_services.sql
006_create_messages.sql
007_create_message_attempts.sql
008_create_templates.sql
009_create_webhook_events.sql
010_create_webhook_deliveries.sql
011_create_audit_logs.sql
```

Each must contain real MSSQL SQL.

Do not use PostgreSQL syntax.

Use:

- CREATE TABLE
- CREATE INDEX
- ALTER TABLE
- FOREIGN KEY
- UNIQUE constraints
- UNIQUEIDENTIFIER
- DATETIME2
- NVARCHAR
- BIT

as appropriate.

Do not create one giant migration.

---

# 82. Architecture Documentation

Create:

```text
docs/architecture.md
docs/database.md
docs/api.md
docs/messaging-flow.md
docs/failover.md
docs/deployment.md
docs/security.md
```

`architecture.md` must explain:

- frontend/backend separation
- layered architecture
- provider abstraction
- database
- queue
- worker
- realtime
- webhooks

`messaging-flow.md`:

```text
Client
→ API
→ MSSQL
→ Queue
→ Worker
→ Provider
→ WhatsApp
```

`failover.md`:

```text
Priority
→ health
→ safe fallback
→ UNKNOWN state
→ recovery to priority
```

---

# 83. Final Acceptance Criteria

The system is complete when:

1. Frontend and backend are separate applications.
2. Backend follows modular layered architecture.
3. MSSQL is fully migration-based.
4. Redis/BullMQ queue works.
5. API and worker are separate processes.
6. Projects work.
7. API keys work.
8. WhatsApp instances work.
9. Multiple projects can share an instance.
10. Priority/fallback configuration works.
11. Existing Baileys functionality still works.
12. Baileys sessions persist.
13. Unified message API works.
14. Idempotency prevents duplicates.
15. Message attempts are tracked.
16. Provider health is tracked.
17. Safe failover works.
18. UNKNOWN messages are not blindly resent.
19. Meta provider architecture exists without faking connectivity.
20. Template architecture exists.
21. Webhooks work.
22. Socket.IO realtime updates work.
23. Audit logs work.
24. Project isolation works.
25. Swagger documentation exists.
26. Automated tests exist.
27. PM2 deployment works.
28. Documentation is complete.

---

# 84. Things You Must NOT Do

DO NOT:

- use PostgreSQL
- introduce Go
- introduce Docker
- introduce Kubernetes
- implement SMS
- implement email
- implement Embedded Signup now
- add unnecessary providers
- put frontend and backend in the same source tree
- let frontend access MSSQL
- let projects directly select providers
- put Baileys logic in controllers
- put Meta logic in controllers
- expose credentials
- blindly fallback after UNKNOWN
- break existing Baileys functionality
- create fake Meta connectivity
- manually create production tables instead of migrations
- create one giant migration
- create one giant service/controller
- overengineer

---

# 85. Development Workflow

Do NOT immediately implement the entire system.

First inspect the existing repository.

Provide:

1. Current folder structure
2. Current frontend structure
3. Current backend structure
4. Current Baileys implementation
5. Current authentication/session handling
6. Current database/storage approach
7. Existing dashboard implementation
8. Existing APIs
9. What can be reused
10. What must be refactored
11. Architectural risks
12. Proposed migration path

Do not modify or delete working functionality during the inspection.

After inspection, wait for the next instruction before beginning implementation.

When implementing later, work incrementally.

After every major module:

1. Implement.
2. Run TypeScript/build checks.
3. Run tests.
4. Fix errors.
5. Verify existing functionality.
6. Continue.

At the end of each major phase, report:

```text
Completed
Files changed
Database changes
API changes
Tests performed
Remaining work
```

The final result must be a clean, maintainable, production-oriented Vengurla Tech WhatsApp Messaging Platform that can be consumed by Vittam and future Vengurla Tech applications through one provider-independent API.
