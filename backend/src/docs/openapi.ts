// OpenAPI 3.1 description of the public surface. Served at /api/docs (UI) and /api/docs.json.

const ok = (example: unknown, description = 'OK') => ({
  description,
  content: { 'application/json': { example: { success: true, data: example } } },
});
const err = (code: string, message: string, description: string) => ({
  description,
  content: { 'application/json': { example: { success: false, error: { code, message } } } },
});
const json = (example: unknown, schema?: object) => ({
  required: true,
  content: { 'application/json': { ...(schema ? { schema } : {}), example } },
});
const idParam = (name = 'id') => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 25, maximum: 200 } },
];

const admin = [{ adminJwt: [] }];
const apiKey = [{ apiKey: [] }];
const ID = '0E984725-C51C-4BF4-9960-E1C80E27ABA0';

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Vengurla Tech WhatsApp Messaging Platform',
    version: '2.0.0',
    description: [
      'Provider-independent WhatsApp messaging for Vengurla Tech applications.',
      '',
      '**Client applications** (Vittam, Hotel App, CRM, ...) authenticate with a project API key and only use `/api/v1/messages` and `/api/v1/usage`. They never choose or see providers.',
      '',
      '**Dashboard** endpoints live under `/api/v1/admin` and use a JWT from `/api/v1/auth/login`.',
      '',
      'All responses use `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code", "message" } }`.',
    ].join('\n'),
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      apiKey: { type: 'http', scheme: 'bearer', description: 'Project API key: `Authorization: Bearer vmp_xxxxxxxxxxxx.<secret>` (or `X-API-Key` header)' },
      adminJwt: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Dashboard token from POST /api/v1/auth/login' },
    },
    schemas: {
      SendMessage: {
        type: 'object',
        required: ['to', 'type'],
        properties: {
          to: { type: 'string', example: '919876543210', description: 'International format, digits only' },
          type: { type: 'string', enum: ['text', 'image', 'document', 'template'] },
          idempotencyKey: { type: 'string', maxLength: 200, description: 'Same key => same message, never sent twice. Also accepted as Idempotency-Key header.' },
          text: { type: 'object', properties: { body: { type: 'string', maxLength: 4096 } } },
          image: { type: 'object', properties: { url: { type: 'string' }, caption: { type: 'string' } } },
          document: {
            type: 'object',
            properties: { url: { type: 'string' }, filename: { type: 'string' }, caption: { type: 'string' }, mimeType: { type: 'string' } },
          },
          template: {
            type: 'object',
            properties: { name: { type: 'string' }, language: { type: 'string', default: 'en' }, variables: { type: 'array', items: { type: 'string' } } },
          },
        },
      },
      MessageStatus: {
        type: 'string',
        enum: ['CREATED', 'QUEUED', 'PROCESSING', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNKNOWN'],
      },
    },
  },
  tags: [
    { name: 'Messages (client API)' },
    { name: 'Authentication' },
    { name: 'Projects' },
    { name: 'API Keys' },
    { name: 'Instances' },
    { name: 'WhatsApp Service' },
    { name: 'Messages (admin)' },
    { name: 'Templates' },
    { name: 'Webhooks' },
    { name: 'Health' },
  ],
  paths: {
    // --- client API ----------------------------------------------------------------------------
    '/api/v1/messages': {
      post: {
        tags: ['Messages (client API)'],
        summary: 'Send a WhatsApp message',
        description:
          'Validates, stores and queues the message, then returns immediately. Delivery happens asynchronously; follow it with GET /messages/{id} or your project webhook. Retrying with the same idempotencyKey returns the original message (HTTP 200, header Idempotent-Replayed: true).',
        security: apiKey,
        requestBody: {
          ...json(
            { to: '919876543210', type: 'text', text: { body: 'Your bill has been generated.' }, idempotencyKey: 'invoice-1001-whatsapp' },
            { $ref: '#/components/schemas/SendMessage' },
          ),
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendMessage' },
              examples: {
                text: { value: { to: '919876543210', type: 'text', text: { body: 'Your bill has been generated.' }, idempotencyKey: 'invoice-1001-whatsapp' } },
                document: {
                  value: {
                    to: '919876543210',
                    type: 'document',
                    document: { url: 'https://files.example.com/invoice-1001.pdf', filename: 'Invoice-1001.pdf', caption: 'Invoice 1001' },
                    idempotencyKey: 'invoice-1001-pdf',
                  },
                },
                image: { value: { to: '919876543210', type: 'image', image: { url: 'https://files.example.com/menu.jpg', caption: "Today's menu" } } },
                template: {
                  value: { to: '919876543210', type: 'template', template: { name: 'bill_generated', language: 'en', variables: ['Ravi', 'INV-1001'] } },
                },
              },
            },
          },
        },
        responses: {
          202: ok({ messageId: ID, status: 'QUEUED' }, 'Accepted and queued'),
          200: ok({ messageId: ID, status: 'DELIVERED' }, 'Duplicate idempotencyKey: original message returned'),
          400: err('VALIDATION_ERROR', 'Phone must be 8-15 digits in international format', 'Invalid request'),
          401: err('UNAUTHORIZED', 'Invalid API key', 'Missing/invalid/revoked/expired API key'),
          422: err('WHATSAPP_SERVICE_NOT_CONFIGURED', 'WhatsApp messaging is not configured for this project yet', 'Project not ready'),
          429: err('RATE_LIMITED', 'Too many requests, slow down', 'Per-project rate limit'),
        },
      },
    },
    '/api/v1/messages/{id}': {
      get: {
        tags: ['Messages (client API)'],
        summary: 'Get message status (own project only)',
        security: apiKey,
        parameters: [idParam()],
        responses: {
          200: ok({
            id: ID,
            recipient: '919876543210',
            messageType: 'TEXT',
            status: 'DELIVERED',
            idempotencyKey: 'invoice-1001-whatsapp',
            failureCode: null,
            failureReason: null,
            createdAt: '2026-09-26T10:00:00.000Z',
            sentAt: '2026-09-26T10:00:02.000Z',
            deliveredAt: '2026-09-26T10:00:04.000Z',
            readAt: null,
          }),
          404: err('NOT_FOUND', 'Message not found', 'Not found (or belongs to another project)'),
        },
      },
    },
    '/api/v1/usage': {
      get: {
        tags: ['Messages (client API)'],
        summary: 'Message counts by status for the calling project',
        security: apiKey,
        parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', default: 30, maximum: 90 } }],
        responses: { 200: ok({ from: '2026-08-27T00:00:00.000Z', total: 120, byStatus: [{ status: 'DELIVERED', count: 110 }, { status: 'FAILED', count: 10 }] }) },
      },
    },

    // --- auth ------------------------------------------------------------------------------------
    '/api/v1/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Dashboard login',
        requestBody: json({ email: 'admin@vengurlatech.local', password: '********' }),
        responses: {
          200: ok({ token: 'eyJhbGciOi...', user: { id: ID, email: 'admin@vengurlatech.local', name: 'Admin', role: 'ADMIN' } }),
          401: err('UNAUTHORIZED', 'Invalid email or password', 'Bad credentials'),
        },
      },
    },
    '/api/v1/auth/me': { get: { tags: ['Authentication'], summary: 'Current user', security: admin, responses: { 200: ok({ id: ID, role: 'ADMIN' }) } } },
    '/api/v1/auth/change-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Change own password',
        security: admin,
        requestBody: json({ currentPassword: '********', newPassword: '**********' }),
        responses: { 200: ok({ changed: true }) },
      },
    },
    '/api/v1/admin/users': {
      get: { tags: ['Authentication'], summary: 'List dashboard users (ADMIN)', security: admin, responses: { 200: ok([]) } },
      post: {
        tags: ['Authentication'],
        summary: 'Create dashboard user (ADMIN)',
        security: admin,
        requestBody: json({ email: 'ops@vengurlatech.com', name: 'Ops', role: 'OPERATOR', password: '**********' }),
        responses: { 201: ok({ id: ID }) },
      },
    },
    '/api/v1/admin/users/{id}': {
      patch: {
        tags: ['Authentication'],
        summary: 'Update role / deactivate / reset password (ADMIN)',
        security: admin,
        parameters: [idParam()],
        requestBody: json({ role: 'VIEWER', isActive: true }),
        responses: { 200: ok({ updated: true }) },
      },
    },

    // --- projects ----------------------------------------------------------------------------------
    '/api/v1/admin/projects': {
      get: { tags: ['Projects'], summary: 'List projects', security: admin, responses: { 200: ok([{ id: ID, name: 'Vittam', slug: 'vittam', status: 'ACTIVE' }]) } },
      post: {
        tags: ['Projects'],
        summary: 'Create project',
        security: admin,
        requestBody: json({ name: 'Vittam', slug: 'vittam', description: 'Billing' }),
        responses: { 201: ok({ id: ID, name: 'Vittam', slug: 'vittam', status: 'ACTIVE' }), 409: err('SLUG_TAKEN', 'A project with slug "vittam" already exists', 'Duplicate') },
      },
    },
    '/api/v1/admin/projects/{id}': {
      get: { tags: ['Projects'], summary: 'Project detail (keys, instances, service, webhook)', security: admin, parameters: [idParam()], responses: { 200: ok({ id: ID }) } },
      patch: {
        tags: ['Projects'],
        summary: 'Edit / activate / deactivate',
        security: admin,
        parameters: [idParam()],
        requestBody: json({ status: 'INACTIVE' }),
        responses: { 200: ok({ id: ID, status: 'INACTIVE' }) },
      },
      delete: { tags: ['Projects'], summary: 'Soft-delete (revokes keys) (ADMIN)', security: admin, parameters: [idParam()], responses: { 200: ok({ deleted: true }) } },
    },
    '/api/v1/admin/projects/{id}/webhook': {
      put: {
        tags: ['Webhooks'],
        summary: 'Set or clear the project webhook URL',
        description: 'The signing secret is generated the first time and returned only in this response.',
        security: admin,
        parameters: [idParam()],
        requestBody: json({ url: 'https://vittam.example.com/hooks/whatsapp' }),
        responses: { 200: ok({ url: 'https://vittam.example.com/hooks/whatsapp', secret: 'whsec_...' }) },
      },
    },
    '/api/v1/admin/projects/{id}/webhook/rotate-secret': {
      post: { tags: ['Webhooks'], summary: 'Rotate webhook signing secret', security: admin, parameters: [idParam()], responses: { 200: ok({ secret: 'whsec_...' }) } },
    },
    '/api/v1/admin/projects/{id}/webhook/test': {
      post: { tags: ['Webhooks'], summary: 'Send a webhook.test event', security: admin, parameters: [idParam()], responses: { 202: ok({ deliveryId: ID }) } },
    },

    // --- api keys ----------------------------------------------------------------------------------
    '/api/v1/admin/api-keys': { get: { tags: ['API Keys'], summary: 'All API keys (no secrets)', security: admin, responses: { 200: ok([]) } } },
    '/api/v1/admin/projects/{projectId}/api-keys': {
      get: { tags: ['API Keys'], summary: "Project's API keys", security: admin, parameters: [idParam('projectId')], responses: { 200: ok([]) } },
      post: {
        tags: ['API Keys'],
        summary: 'Generate API key (full key shown once)',
        security: admin,
        parameters: [idParam('projectId')],
        requestBody: json({ name: 'Vittam production', expiresAt: null }),
        responses: { 201: ok({ id: ID, name: 'Vittam production', keyPrefix: 'vmp_1a2b3c4d5e6f', key: 'vmp_1a2b3c4d5e6f.xxxxxxxx', expiresAt: null }) },
      },
    },
    '/api/v1/admin/api-keys/{id}/revoke': { post: { tags: ['API Keys'], summary: 'Revoke', security: admin, parameters: [idParam()], responses: { 200: ok({ revoked: true }) } } },
    '/api/v1/admin/api-keys/{id}/rotate': {
      post: { tags: ['API Keys'], summary: 'Rotate (new key, old revoked)', security: admin, parameters: [idParam()], responses: { 201: ok({ id: ID, key: 'vmp_...' }) } },
    },

    // --- instances ---------------------------------------------------------------------------------
    '/api/v1/admin/instances': {
      get: { tags: ['Instances'], summary: 'List instances with assigned projects', security: admin, responses: { 200: ok([]) } },
      post: {
        tags: ['Instances'],
        summary: 'Create instance (ADMIN)',
        security: admin,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              examples: {
                baileys: { value: { name: 'Vittam Primary', provider: 'BAILEYS' } },
                meta: {
                  value: { name: 'Vengurla Meta Backup', provider: 'META_CLOUD', meta: { wabaId: '1234567890', phoneNumberId: '9876543210', accessToken: 'EAAG...' } },
                },
              },
            },
          },
        },
        responses: { 201: ok({ id: ID, name: 'Vittam Primary', provider: 'BAILEYS', status: 'CREATING' }) },
      },
    },
    '/api/v1/admin/instances/{id}': {
      get: { tags: ['Instances'], summary: 'Instance detail', security: admin, parameters: [idParam()], responses: { 200: ok({ id: ID }) } },
      patch: { tags: ['Instances'], summary: 'Rename / update Meta credentials (ADMIN)', security: admin, parameters: [idParam()], requestBody: json({ name: 'Renamed' }), responses: { 200: ok({ id: ID }) } },
      delete: {
        tags: ['Instances'],
        summary: 'Delete (ADMIN). Requires ?confirm=true when projects use it.',
        security: admin,
        parameters: [idParam(), { name: 'confirm', in: 'query', schema: { type: 'boolean' } }],
        responses: {
          200: ok({ projects: [], priorityFor: [], fallbackFor: [] }),
          409: err('CONFIRMATION_REQUIRED', 'Instance is assigned to projects; confirm to delete', 'Impact returned in error.details'),
        },
      },
    },
    '/api/v1/admin/instances/{id}/impact': {
      get: {
        tags: ['Instances'],
        summary: 'Projects affected by deleting this instance',
        security: admin,
        parameters: [idParam()],
        responses: { 200: ok({ projects: [{ projectName: 'Vittam', serviceRole: 'PRIORITY' }], priorityFor: ['Vittam'], fallbackFor: [], requiresConfirmation: true }) },
      },
    },
    '/api/v1/admin/instances/{id}/connect': {
      post: {
        tags: ['Instances'],
        summary: 'Connect (Baileys: start pairing / reconnect; Meta: validate with Meta)',
        security: admin,
        parameters: [idParam()],
        responses: { 202: ok({ accepted: true, action: 'connect' }) },
      },
    },
    '/api/v1/admin/instances/{id}/disconnect': {
      post: { tags: ['Instances'], summary: 'Disconnect (session kept)', security: admin, parameters: [idParam()], responses: { 202: ok({ accepted: true }) } },
    },
    '/api/v1/admin/instances/{id}/logout': {
      post: { tags: ['Instances'], summary: 'Baileys: unpair and delete session (ADMIN)', security: admin, parameters: [idParam()], responses: { 202: ok({ accepted: true }) } },
    },
    '/api/v1/admin/instances/{id}/qr': {
      get: {
        tags: ['Instances'],
        summary: 'Latest pairing QR (data URL). Live updates arrive via Socket.IO "instance.qr".',
        security: admin,
        parameters: [idParam()],
        responses: { 200: ok({ qr: 'data:image/png;base64,...' }) },
      },
    },
    '/api/v1/admin/projects/{projectId}/instances': {
      get: { tags: ['Instances'], summary: 'Instances assigned to project', security: admin, parameters: [idParam('projectId')], responses: { 200: ok([]) } },
      post: {
        tags: ['Instances'],
        summary: 'Assign instance to project',
        security: admin,
        parameters: [idParam('projectId')],
        requestBody: json({ instanceId: ID }),
        responses: { 201: ok({ assigned: true }) },
      },
    },
    '/api/v1/admin/projects/{projectId}/instances/{instanceId}': {
      patch: {
        tags: ['Instances'],
        summary: 'Enable/disable assignment',
        security: admin,
        parameters: [idParam('projectId'), idParam('instanceId')],
        requestBody: json({ isEnabled: false }),
        responses: { 200: ok({ isEnabled: false }) },
      },
      delete: {
        tags: ['Instances'],
        summary: 'Remove instance from project',
        security: admin,
        parameters: [idParam('projectId'), idParam('instanceId')],
        responses: { 200: ok({ removed: true }), 409: err('INSTANCE_IN_USE', "Instance is this project's priority instance", 'Used by WhatsApp Service') },
      },
    },

    // --- whatsapp service ---------------------------------------------------------------------------
    '/api/v1/admin/projects/{projectId}/whatsapp-service': {
      get: { tags: ['WhatsApp Service'], summary: 'Priority / fallback configuration', security: admin, parameters: [idParam('projectId')], responses: { 200: ok({ priorityInstanceId: ID, fallbackInstanceId: null }) } },
      put: {
        tags: ['WhatsApp Service'],
        summary: 'Configure priority / fallback',
        description: 'Both must be assigned to the project; they cannot be the same instance; fallback is optional.',
        security: admin,
        parameters: [idParam('projectId')],
        requestBody: json({ priorityInstanceId: ID, fallbackInstanceId: null }),
        responses: { 200: ok({ priorityInstanceId: ID, fallbackInstanceId: null }), 400: err('SAME_INSTANCE', 'Priority and fallback cannot be the same instance', 'Rule violation') },
      },
    },

    // --- admin messages -------------------------------------------------------------------------------
    '/api/v1/admin/messages': {
      get: {
        tags: ['Messages (admin)'],
        summary: 'Search messages',
        security: admin,
        parameters: [
          ...pageParams,
          { name: 'projectId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/MessageStatus' } },
          { name: 'instanceId', in: 'query', schema: { type: 'string' } },
          { name: 'recipient', in: 'query', schema: { type: 'string' }, description: 'Prefix match' },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: { 200: ok({ items: [], total: 0, page: 1, pageSize: 25 }) },
      },
    },
    '/api/v1/admin/messages/{id}': {
      get: { tags: ['Messages (admin)'], summary: 'Message with all provider attempts', security: admin, parameters: [idParam()], responses: { 200: ok({ id: ID, attempts: [] }) } },
    },
    '/api/v1/admin/messages/{id}/retry': {
      post: {
        tags: ['Messages (admin)'],
        summary: 'Retry a FAILED message (UNKNOWN requires confirmUnknown: true)',
        security: admin,
        parameters: [idParam()],
        requestBody: json({ confirmUnknown: false }),
        responses: { 202: ok({ messageId: ID, status: 'QUEUED' }), 409: err('CONFIRMATION_REQUIRED', 'Delivery state is UNKNOWN; confirm to resend', 'Duplicate risk') },
      },
    },
    '/api/v1/admin/dashboard': {
      get: {
        tags: ['Messages (admin)'],
        summary: 'Dashboard metrics',
        security: admin,
        parameters: [{ name: 'since', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Start of "today" (viewer local midnight)' }],
        responses: { 200: ok({ totalProjects: 3, activeInstances: 1, healthyInstances: 1, messagesToday: 40, sentToday: 38, failedToday: 1, unknownToday: 0, queuedMessages: 1 }) },
      },
    },
    '/api/v1/admin/audit-logs': {
      get: { tags: ['Messages (admin)'], summary: 'Audit log', security: admin, parameters: pageParams, responses: { 200: ok({ items: [], total: 0 }) } },
    },

    // --- templates -------------------------------------------------------------------------------------
    '/api/v1/admin/templates': {
      get: { tags: ['Templates'], summary: 'List templates', security: admin, parameters: [{ name: 'projectId', in: 'query', schema: { type: 'string' } }], responses: { 200: ok([]) } },
      post: {
        tags: ['Templates'],
        summary: 'Create template (DRAFT)',
        security: admin,
        requestBody: json({
          projectId: ID,
          name: 'bill_generated',
          category: 'UTILITY',
          language: 'en',
          header: 'Vittam',
          body: 'Hello {{1}}, your bill {{2}} has been generated.',
          footer: 'Vengurla Tech',
          variables: ['Ravi', 'INV-1001'],
          buttons: [{ type: 'URL', text: 'View bill', url: 'https://vittam.example.com/bills' }],
        }),
        responses: { 201: ok({ id: ID, status: 'DRAFT' }) },
      },
    },
    '/api/v1/admin/templates/{id}': {
      get: { tags: ['Templates'], summary: 'Template', security: admin, parameters: [idParam()], responses: { 200: ok({ id: ID }) } },
      put: { tags: ['Templates'], summary: 'Edit (DRAFT/REJECTED only)', security: admin, parameters: [idParam()], responses: { 200: ok({ id: ID }) } },
      delete: { tags: ['Templates'], summary: 'Delete (if unused)', security: admin, parameters: [idParam()], responses: { 200: ok({ deleted: true }) } },
    },
    '/api/v1/admin/templates/{id}/submit': {
      post: {
        tags: ['Templates'],
        summary: 'Submit to Meta through a Meta instance',
        security: admin,
        parameters: [idParam()],
        requestBody: json({ instanceId: ID }),
        responses: { 200: ok({ id: ID, status: 'PENDING' }), 502: err('META_REJECTED', 'Meta API error 100: ...', 'Meta refused') },
      },
    },
    '/api/v1/admin/templates/{id}/sync': {
      post: { tags: ['Templates'], summary: 'Pull status from Meta', security: admin, parameters: [idParam()], responses: { 200: ok({ id: ID, status: 'APPROVED' }) } },
    },
    '/api/v1/admin/templates/sync': { post: { tags: ['Templates'], summary: 'Sync all submitted templates', security: admin, responses: { 200: ok([]) } } },

    // --- webhooks ---------------------------------------------------------------------------------------
    '/api/v1/webhooks/meta': {
      get: {
        tags: ['Webhooks'],
        summary: 'Meta subscription verification (hub.challenge)',
        parameters: [
          { name: 'hub.mode', in: 'query', schema: { type: 'string' } },
          { name: 'hub.verify_token', in: 'query', schema: { type: 'string' } },
          { name: 'hub.challenge', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Echoes hub.challenge' }, 403: err('WEBHOOK_VERIFICATION_FAILED', 'Webhook verification failed', 'Bad token') },
      },
      post: {
        tags: ['Webhooks'],
        summary: 'Meta events (signed with X-Hub-Signature-256)',
        responses: { 200: ok({ stored: 1 }), 401: err('INVALID_SIGNATURE', 'Invalid webhook signature', 'Signature check failed') },
      },
    },
    '/api/v1/admin/webhooks/events': {
      get: { tags: ['Webhooks'], summary: 'Inbound provider events', security: admin, parameters: pageParams, responses: { 200: ok({ items: [], total: 0 }) } },
    },
    '/api/v1/admin/webhooks/deliveries': {
      get: {
        tags: ['Webhooks'],
        summary: 'Outbound project webhook delivery log',
        description:
          'Deliveries are POSTed with headers X-Vengurla-Event, X-Vengurla-Delivery, X-Vengurla-Timestamp and X-Vengurla-Signature = "sha256=" + HMAC_SHA256(secret, timestamp + "." + rawBody). Payload example: {"event":"message.delivered","messageId":"...","status":"delivered","timestamp":"..."}',
        security: admin,
        parameters: pageParams,
        responses: { 200: ok({ items: [], total: 0 }) },
      },
    },
    '/api/v1/admin/webhooks/deliveries/{id}/redeliver': {
      post: { tags: ['Webhooks'], summary: 'Redeliver', security: admin, parameters: [idParam()], responses: { 202: ok({ deliveryId: ID, status: 'PENDING' }) } },
    },

    // --- health -----------------------------------------------------------------------------------------
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Application, MSSQL and Redis status',
        responses: {
          200: ok({ status: 'ok', ready: true, checks: { application: { ok: true }, mssql: { ok: true, latencyMs: 2 }, redis: { ok: true, latencyMs: 1 } } }),
          503: { description: 'A dependency is down' },
        },
      },
    },
    '/health/live': { get: { tags: ['Health'], summary: 'Liveness', responses: { 200: ok({ status: 'ok' }) } } },
    '/health/ready': { get: { tags: ['Health'], summary: 'Readiness (MSSQL + Redis)', responses: { 200: ok({ ready: true }), 503: { description: 'Not ready' } } } },
  },
};
