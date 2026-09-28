// Domain rules and security primitives.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateApiKey, parseApiKey } from '../../src/modules/api-keys/domain/apiKey.js';
import { hasRole } from '../../src/modules/auth/domain/auth.js';
import { canApplyReceipt, countPlaceholders, renderTemplate } from '../../src/modules/messaging/domain/message.js';
import { slugify } from '../../src/modules/projects/domain/project.js';
import { mapMetaTemplateStatus, toMetaTemplatePayload } from '../../src/modules/templates/domain/template.js';
import { signWebhook, verifyWebhookSignature } from '../../src/modules/webhooks/domain/signature.js';
import { validateServiceConfig } from '../../src/modules/whatsapp-service/domain/serviceRules.js';
import { ProviderError, toProviderError } from '../../src/providers/whatsapp/contracts/errors.js';
import { mapMetaError, redact } from '../../src/providers/whatsapp/meta/MetaClient.js';
import { extractMetaEvents, toReceipt, verifyMetaSignature } from '../../src/providers/whatsapp/meta/MetaWebhookHandler.js';
import { createCipher, hmacSha256 } from '../../src/shared/utils/crypto.js';
import { hashPassword, verifyPassword } from '../../src/shared/utils/password.js';

describe('WhatsApp Service rules', () => {
  const assigned = ['AAA', 'BBB'];
  it('accepts priority + optional fallback that belong to the project', () => {
    assert.deepEqual(validateServiceConfig({ priorityInstanceId: 'AAA', fallbackInstanceId: 'BBB' }, assigned), []);
    assert.deepEqual(validateServiceConfig({ priorityInstanceId: 'aaa', fallbackInstanceId: null }, assigned), []);
  });
  it('rejects unassigned instances and priority == fallback', () => {
    const codes = (p: string, f: string | null) => validateServiceConfig({ priorityInstanceId: p, fallbackInstanceId: f }, assigned).map((v) => v.code);
    assert.deepEqual(codes('CCC', null), ['PRIORITY_NOT_ASSIGNED']);
    assert.deepEqual(codes('AAA', 'CCC'), ['FALLBACK_NOT_ASSIGNED']);
    assert.deepEqual(codes('AAA', 'aaa'), ['SAME_INSTANCE']);
  });
});

describe('message receipts', () => {
  it('only moves forward', () => {
    assert.equal(canApplyReceipt('SENT', 'DELIVERED'), true);
    assert.equal(canApplyReceipt('READ', 'DELIVERED'), false);
    assert.equal(canApplyReceipt('DELIVERED', 'SENT'), false);
  });
  it('resolves UNKNOWN when the provider proves acceptance', () => {
    assert.equal(canApplyReceipt('UNKNOWN', 'SENT'), true);
    assert.equal(canApplyReceipt('UNKNOWN', 'READ'), true);
  });
  it('accepts provider FAILED only before delivery', () => {
    assert.equal(canApplyReceipt('SENT', 'FAILED'), true);
    assert.equal(canApplyReceipt('DELIVERED', 'FAILED'), false);
    assert.equal(canApplyReceipt('FAILED', 'DELIVERED'), false);
  });
});

describe('templates', () => {
  it('renders and counts {{n}} placeholders', () => {
    assert.equal(renderTemplate('Hi {{1}}, bill {{ 2 }}', ['Ravi', 'INV-1']), 'Hi Ravi, bill INV-1');
    assert.equal(countPlaceholders('Hi {{1}} {{2}} {{2}}'), 2);
    assert.equal(countPlaceholders('No variables'), 0);
  });
  it('only Meta APPROVED becomes APPROVED', () => {
    assert.equal(mapMetaTemplateStatus('APPROVED'), 'APPROVED');
    assert.equal(mapMetaTemplateStatus('IN_APPEAL'), 'PENDING');
    assert.equal(mapMetaTemplateStatus(undefined), 'PENDING');
    assert.equal(mapMetaTemplateStatus('DELETED'), 'DISABLED');
  });
  it('builds the Meta payload with examples', () => {
    const p = toMetaTemplatePayload({
      name: 'bill',
      category: 'UTILITY',
      language: 'en',
      header: null,
      body: 'Hi {{1}}',
      footer: 'VT',
      variables: ['Ravi'],
      buttons: [],
    });
    assert.deepEqual(p.components, [
      { type: 'BODY', text: 'Hi {{1}}', example: { body_text: [['Ravi']] } },
      { type: 'FOOTER', text: 'VT' },
    ]);
  });
});

describe('provider error normalization', () => {
  it('classifies Meta errors', () => {
    assert.equal(mapMetaError(401, { code: 190 }, true).code, 'AUTH_FAILED');
    assert.equal(mapMetaError(400, { code: 131026 }, true).fallbackAllowed, false);
    assert.equal(mapMetaError(429, { code: 130429 }, true).retryable, true);
    assert.equal(mapMetaError(500, { code: 1 }, true).sendState, 'UNKNOWN', '5xx on send is ambiguous');
    assert.equal(mapMetaError(500, { code: 1 }, false).sendState, 'NOT_SENT');
  });
  it('never leaks access tokens that Meta echoes in errors', () => {
    const token = 'EAAGabcdefghijklmnop123';
    assert.equal(redact(`Malformed access token ${token}`, token), 'Malformed access token [REDACTED]');
    assert.equal(redact('token EAAGzzzzzzzzzzzzzzzz leaked'), 'token [REDACTED] leaked');
  });
  it('unknown errors are UNKNOWN, never silently NOT_SENT', () => {
    assert.equal(toProviderError(new Error('x')).sendState, 'UNKNOWN');
    assert.equal(toProviderError(new ProviderError('NETWORK_ERROR', 'x')).sendState, 'NOT_SENT');
  });
});

describe('Meta webhooks', () => {
  const body = {
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: '123' },
              statuses: [{ id: 'wamid.1', status: 'delivered', timestamp: '1700000000' }],
            },
          },
        ],
      },
    ],
  };
  it('verifies X-Hub-Signature-256', () => {
    const raw = Buffer.from(JSON.stringify(body));
    assert.equal(verifyMetaSignature(raw, `sha256=${hmacSha256('appsecret', raw)}`, 'appsecret'), true);
    assert.equal(verifyMetaSignature(raw, `sha256=${hmacSha256('wrong', raw)}`, 'appsecret'), false);
    assert.equal(verifyMetaSignature(raw, undefined, 'appsecret'), false);
  });
  it('extracts deduplicable status events and receipts', () => {
    const [ev] = extractMetaEvents(body);
    assert.equal(ev!.externalEventId, 'status:wamid.1:delivered');
    const r = toReceipt(ev!.payload)!;
    assert.equal(r.status, 'DELIVERED');
    assert.equal(r.timestamp.toISOString(), '2023-11-14T22:13:20.000Z');
  });
});

describe('security primitives', () => {
  it('API keys: prefix lookup + hash, never the raw key', () => {
    const k = generateApiKey();
    assert.match(k.key, /^vmp_[0-9a-f]{12}\./);
    assert.deepEqual(parseApiKey(k.key), { prefix: k.prefix, hash: k.hash });
    assert.equal(parseApiKey('vmp_nothex.abc'), null);
    assert.notEqual(k.hash, k.key);
  });
  it('encrypts secrets at rest (AES-GCM, tamper-evident)', () => {
    const c = createCipher('x'.repeat(40));
    const enc = c.encrypt('EAAG-token');
    assert.notEqual(enc, 'EAAG-token');
    assert.equal(c.decrypt(enc), 'EAAG-token');
    assert.throws(() => c.decrypt(enc.slice(0, -2) + 'AA'));
    assert.throws(() => createCipher('y'.repeat(40)).decrypt(enc));
  });
  it('hashes passwords with scrypt', async () => {
    const h = await hashPassword('correct horse');
    assert.equal(await verifyPassword('correct horse', h), true);
    assert.equal(await verifyPassword('wrong', h), false);
  });
  it('signs project webhooks and rejects replays', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signWebhook('whsec_x', ts, '{"a":1}');
    assert.equal(verifyWebhookSignature('whsec_x', ts, '{"a":1}', sig), true);
    assert.equal(verifyWebhookSignature('whsec_x', ts, '{"a":2}', sig), false);
    assert.equal(verifyWebhookSignature('whsec_x', '1000', '{"a":1}', signWebhook('whsec_x', '1000', '{"a":1}')), false);
  });
  it('role hierarchy', () => {
    assert.equal(hasRole('ADMIN', 'OPERATOR'), true);
    assert.equal(hasRole('OPERATOR', 'ADMIN'), false);
    assert.equal(hasRole('VIEWER', 'VIEWER'), true);
  });
  it('slugify', () => {
    assert.equal(slugify('Hotel App!'), 'hotel-app');
    assert.equal(slugify('  CRM  '), 'crm');
  });
});
