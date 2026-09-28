// API integration test against the real MSSQL database (and Redis if running).
// Run from backend/: npm run test:integration   (uses backend/.env; creates and soft-deletes its own data)
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../src/app/app.js';
import { closeDb, query, sql } from '../../src/config/database.js';
import { logger } from '../../src/config/logger.js';
import { closeRedis } from '../../src/config/redis.js';
import { insertAdmin } from '../../src/modules/auth/infrastructure/adminUserRepository.js';
import { closeQueues } from '../../src/queue/queues.js';
import { pollMessages } from '../../src/queue/workers/sqlPollers.js';
import { hashPassword } from '../../src/shared/utils/password.js';

const run = randomBytes(4).toString('hex');
let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let adminToken = '';
let viewerToken = '';
const created = { projects: [] as string[], admins: [] as string[], instances: [] as string[] };

async function call(method: string, path: string, opts: { token?: string; apiKey?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.apiKey ? { 'X-API-Key': opts.apiKey } : {}),
      ...opts.headers,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, body: json, headers: res.headers };
}

async function login(role: 'ADMIN' | 'VIEWER') {
  const email = `it-${role.toLowerCase()}-${run}@test.local`;
  const password = `pw-${run}-${role}-secret`;
  created.admins.push(await insertAdmin({ email, name: `IT ${role}`, role, passwordHash: await hashPassword(password) }));
  const r = await call('POST', '/api/v1/auth/login', { body: { email, password } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data.token as string;
}

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  adminToken = await login('ADMIN');
  viewerToken = await login('VIEWER');
});

after(async () => {
  for (const id of created.instances) await call('DELETE', `/api/v1/admin/instances/${id}?confirm=true`, { token: adminToken });
  for (const id of created.projects) await call('DELETE', `/api/v1/admin/projects/${id}`, { token: adminToken });
  for (const id of created.admins) {
    await query('UPDATE dbo.admin_users SET is_active = 0 WHERE id = @id', { id: [sql.UniqueIdentifier, id] });
  }
  server.close();
  await closeQueues();
  await closeRedis();
  await closeDb();
});

describe('platform API', () => {
  let projectId = '';
  let otherProjectId = '';
  let apiKey = '';
  let apiKeyId = '';
  let otherApiKey = '';
  let primaryId = '';
  let backupId = '';
  let messageId = '';

  it('health endpoints report dependencies', async () => {
    assert.equal((await call('GET', '/health/live')).status, 200);
    const h = await call('GET', '/health');
    assert.equal(h.body.data.checks.mssql.ok, true);
  });

  it('rejects unauthenticated and read-only callers', async () => {
    assert.equal((await call('GET', '/api/v1/admin/projects')).status, 401);
    const r = await call('POST', '/api/v1/admin/projects', { token: viewerToken, body: { name: 'nope' } });
    assert.equal(r.status, 403);
    assert.equal((await call('GET', '/api/v1/admin/projects', { token: viewerToken })).status, 200);
  });

  it('creates projects and API keys (secret shown once)', async () => {
    const p = await call('POST', '/api/v1/admin/projects', { token: adminToken, body: { name: `IT Project ${run}`, slug: `it-${run}` } });
    assert.equal(p.status, 201, JSON.stringify(p.body));
    projectId = p.body.data.id;
    created.projects.push(projectId);
    const dup = await call('POST', '/api/v1/admin/projects', { token: adminToken, body: { name: 'dup', slug: `it-${run}` } });
    assert.equal(dup.body.error.code, 'SLUG_TAKEN');

    const o = await call('POST', '/api/v1/admin/projects', { token: adminToken, body: { name: `IT Other ${run}` } });
    otherProjectId = o.body.data.id;
    created.projects.push(otherProjectId);

    const k = await call('POST', `/api/v1/admin/projects/${projectId}/api-keys`, { token: adminToken, body: { name: 'it' } });
    assert.equal(k.status, 201);
    apiKey = k.body.data.key;
    apiKeyId = k.body.data.id;
    const list = await call('GET', `/api/v1/admin/projects/${projectId}/api-keys`, { token: adminToken });
    assert.ok(!JSON.stringify(list.body).includes(apiKey.split('.')[1]!), 'secret never listed');

    otherApiKey = (await call('POST', `/api/v1/admin/projects/${otherProjectId}/api-keys`, { token: adminToken, body: { name: 'it' } })).body.data.key;
  });

  it('refuses to send before the WhatsApp Service is configured', async () => {
    const r = await call('POST', '/api/v1/messages', { apiKey, body: { to: '919876543210', type: 'text', text: { body: 'hi' } } });
    assert.equal(r.status, 422);
    assert.equal(r.body.error.code, 'WHATSAPP_SERVICE_NOT_CONFIGURED');
  });

  it('shares instances across projects and enforces service rules', async () => {
    primaryId = (await call('POST', '/api/v1/admin/instances', { token: adminToken, body: { name: `IT Baileys ${run}`, provider: 'BAILEYS' } })).body.data.id;
    backupId = (await call('POST', '/api/v1/admin/instances', { token: adminToken, body: { name: `IT Baileys 2 ${run}`, provider: 'BAILEYS' } })).body.data.id;
    assert.ok(primaryId && backupId);
    created.instances.push(primaryId);

    const unassigned = await call('PUT', `/api/v1/admin/projects/${projectId}/whatsapp-service`, {
      token: adminToken,
      body: { priorityInstanceId: primaryId, fallbackInstanceId: null },
    });
    assert.equal(unassigned.body.error.code, 'PRIORITY_NOT_ASSIGNED');

    for (const [p, i] of [[projectId, primaryId], [projectId, backupId], [otherProjectId, primaryId]]) {
      assert.equal((await call('POST', `/api/v1/admin/projects/${p}/instances`, { token: adminToken, body: { instanceId: i } })).status, 201);
    }
    const same = await call('PUT', `/api/v1/admin/projects/${projectId}/whatsapp-service`, {
      token: adminToken,
      body: { priorityInstanceId: primaryId, fallbackInstanceId: primaryId.toLowerCase() },
    });
    assert.equal(same.status, 400);

    const ok = await call('PUT', `/api/v1/admin/projects/${projectId}/whatsapp-service`, {
      token: adminToken,
      body: { priorityInstanceId: primaryId, fallbackInstanceId: backupId },
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    await call('PUT', `/api/v1/admin/projects/${otherProjectId}/whatsapp-service`, { token: adminToken, body: { priorityInstanceId: primaryId } });

    const inUse = await call('DELETE', `/api/v1/admin/projects/${projectId}/instances/${primaryId}`, { token: adminToken });
    assert.equal(inUse.body.error.code, 'INSTANCE_IN_USE');

    const listed = await call('GET', '/api/v1/admin/instances', { token: adminToken });
    const shared = listed.body.data.find((i: any) => i.id === primaryId);
    assert.equal(shared.projects.length, 2, 'one instance serves two projects');
  });

  it('accepts messages with idempotency', async () => {
    const body = { to: '+91 98765 43210', type: 'text', text: { body: 'Your bill has been generated.' }, idempotencyKey: `inv-${run}` };
    const first = await call('POST', '/api/v1/messages', { apiKey, body });
    assert.equal(first.status, 202, JSON.stringify(first.body));
    assert.ok(['QUEUED', 'CREATED'].includes(first.body.data.status));
    messageId = first.body.data.messageId;

    const again = await call('POST', '/api/v1/messages', { apiKey, body });
    assert.equal(again.status, 200);
    assert.equal(again.body.data.messageId, messageId);
    assert.equal(again.headers.get('idempotent-replayed'), 'true');

    const bad = await call('POST', '/api/v1/messages', { apiKey, body: { to: '12', type: 'text', text: { body: 'x' } } });
    assert.equal(bad.body.error.code, 'VALIDATION_ERROR');
    const noProvider = await call('POST', '/api/v1/messages', { apiKey, body: { ...body, idempotencyKey: undefined, provider: 'BAILEYS' } });
    assert.equal(noProvider.status, 202, 'unknown fields are ignored; the client cannot pick a provider');
  });

  it('isolates projects', async () => {
    assert.equal((await call('GET', `/api/v1/messages/${messageId}`, { apiKey })).status, 200);
    assert.equal((await call('GET', `/api/v1/messages/${messageId}`, { apiKey: otherApiKey })).status, 404);
  });

  it('shows deletion impact and requires confirmation', async () => {
    const impact = await call('GET', `/api/v1/admin/instances/${backupId}/impact`, { token: adminToken });
    assert.deepEqual(impact.body.data.fallbackFor, [`IT Project ${run}`]);
    const r = await call('DELETE', `/api/v1/admin/instances/${backupId}`, { token: adminToken });
    assert.equal(r.body.error.code, 'CONFIRMATION_REQUIRED');
    const confirmed = await call('DELETE', `/api/v1/admin/instances/${backupId}?confirm=true`, { token: adminToken });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    const svc = await call('GET', `/api/v1/admin/projects/${projectId}/whatsapp-service`, { token: adminToken });
    assert.equal(svc.body.data.fallbackInstanceId, null);
  });

  it('writes audit logs', async () => {
    const r = await call('GET', `/api/v1/admin/audit-logs?resourceType=project&resourceId=${projectId}`, { token: adminToken });
    const actions = r.body.data.items.map((i: any) => i.action);
    for (const a of ['project.created', 'instance.assigned', 'service.priority_changed', 'service.fallback_changed']) {
      assert.ok(actions.includes(a), `missing ${a}`);
    }
  });

  it('revoked keys stop working', async () => {
    assert.equal((await call('POST', `/api/v1/admin/api-keys/${apiKeyId}/revoke`, { token: adminToken })).status, 200);
    assert.equal((await call('GET', `/api/v1/messages/${messageId}`, { apiKey })).status, 401);
  });

  it('dashboard returns real counts', async () => {
    const r = await call('GET', '/api/v1/admin/dashboard', { token: adminToken });
    assert.equal(r.status, 200);
    assert.ok(r.body.data.totalProjects >= 2);
    assert.ok(r.body.data.messagesToday >= 1);
  });

  it('SQL queue (RUN_MODE=single) claims a due message once and schedules the retry', async () => {
    const id = [sql.UniqueIdentifier, messageId] as const;
    await query("UPDATE dbo.messages SET status = 'QUEUED', next_attempt_at = NULL, retry_count = 0 WHERE id = @id", { id });
    const seen: string[] = [];
    const poller = pollMessages(async (mid) => {
      seen.push(mid);
      return 'RETRY';
    }, logger);
    await new Promise((r) => setTimeout(r, 2_500)); // two poll cycles
    await poller.close();
    assert.equal(seen.filter((m) => m === messageId).length, 1, 'claimed exactly once');
    const [row] = await query<{ retryCount: number; nextAttemptAt: Date }>('SELECT retry_count, next_attempt_at FROM dbo.messages WHERE id = @id', { id });
    assert.equal(row!.retryCount, 1);
    assert.ok(row!.nextAttemptAt.getTime() > Date.now() + 5_000, 'backoff scheduled ~10 s ahead');
  });
});
