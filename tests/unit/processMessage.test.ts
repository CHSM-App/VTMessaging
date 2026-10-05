// Failover, retry and idempotency rules of the send pipeline, with mocked providers.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type MessageRecord, type ProcessMessageDeps, type RouteInstance, processMessage } from '../../src/modules/messaging/application/processMessage.js';
import type { MessageStatus } from '../../src/modules/messaging/domain/message.js';
import { ProviderError } from '../../src/providers/whatsapp/contracts/errors.js';
import type { WhatsAppProvider } from '../../src/providers/whatsapp/contracts/WhatsAppProvider.js';

const BAILEYS: RouteInstance = { id: 'BAILEYS-1', provider: 'BAILEYS' };
const META: RouteInstance = { id: 'META-1', provider: 'META_CLOUD' };

type Behaviour = 'ok' | ProviderError | Error;

function fakeProvider(instance: RouteInstance, behaviour: () => Behaviour, calls: string[]): WhatsAppProvider {
  const send = async (req: { to: string; body?: string; renderedText?: string }) => {
    calls.push(`${instance.id}:${req.body ?? req.renderedText ?? ''}`);
    const b = behaviour();
    if (b !== 'ok') throw b;
    return { providerMessageId: `wamid-${instance.id}` };
  };
  return {
    type: instance.provider,
    instanceId: instance.id,
    connect: async () => {},
    disconnect: async () => {},
    getHealth: async () => ({ status: 'HEALTHY', details: {} }),
    getStatus: async () => 'CONNECTED',
    sendText: send,
    sendImage: send,
    sendDocument: send,
    sendTemplate: send,
  };
}

function harness(opts: {
  status?: MessageStatus;
  route?: RouteInstance[];
  baileys?: () => Behaviour;
  meta?: () => Behaviour;
  message?: Partial<MessageRecord>;
  template?: { name: string; language: string; body: string; status: string } | null;
}) {
  const message: MessageRecord = {
    id: 'MSG-1',
    projectId: 'PROJ-1',
    recipient: '919876543210',
    messageType: 'TEXT',
    content: { body: 'hello' },
    templateId: null,
    status: opts.status ?? 'QUEUED',
    ...opts.message,
  };
  const calls: string[] = [];
  const transitions: { status: MessageStatus; failureCode?: string | null; providerMessageId?: string }[] = [];
  const attempts: { instanceId: string; status?: string; errorCode?: string; providerMessageId?: string }[] = [];
  const providers = {
    [BAILEYS.id]: fakeProvider(BAILEYS, opts.baileys ?? (() => 'ok'), calls),
    [META.id]: fakeProvider(META, opts.meta ?? (() => 'ok'), calls),
  };

  const deps: ProcessMessageDeps = {
    loadMessage: async () => ({ ...message }),
    loadRoute: async () => opts.route ?? [BAILEYS, META],
    loadTemplate: async () => opts.template ?? null,
    getProvider: async (i) => providers[i.id]!,
    transition: async (_id, status, f) => {
      message.status = status;
      transitions.push({ status, failureCode: f?.failureCode, providerMessageId: f?.providerMessageId });
    },
    startAttempt: async (_m, i) => {
      attempts.push({ instanceId: i.id });
      return { id: `ATT-${attempts.length}` };
    },
    finishAttempt: async (attemptId, r) => {
      Object.assign(attempts[Number(attemptId.split('-')[1]) - 1]!, r);
    },
  };
  return { deps, message, calls, transitions, attempts };
}

const notConnected = () => new ProviderError('PROVIDER_NOT_CONNECTED', 'socket closed');

describe('processMessage', () => {
  it('sends through the priority instance when it works', async () => {
    const h = harness({});
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: false }), 'SENT');
    assert.deepEqual(h.calls, ['BAILEYS-1:hello']);
    assert.equal(h.message.status, 'SENT');
    assert.deepEqual(h.attempts.map((a) => a.status), ['SENT']);
  });

  it('falls back to Meta when Baileys definitely did not send (NOT_SENT)', async () => {
    const h = harness({ baileys: notConnected });
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: false }), 'SENT');
    assert.deepEqual(h.calls, ['BAILEYS-1:hello', 'META-1:hello']);
    assert.deepEqual(
      h.attempts.map((a) => [a.instanceId, a.status]),
      [
        ['BAILEYS-1', 'FAILED'],
        ['META-1', 'SENT'],
      ],
    );
  });

  it('never falls back after an ambiguous timeout (UNKNOWN)', async () => {
    const h = harness({ baileys: () => new ProviderError('SEND_TIMEOUT', 'timed out', '3EB0ABC') });
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: false }), 'UNKNOWN');
    assert.deepEqual(h.calls, ['BAILEYS-1:hello'], 'Meta must not be called');
    assert.equal(h.message.status, 'UNKNOWN');
    assert.equal(h.attempts[0]!.status, 'UNKNOWN');
    assert.equal(h.attempts[0]!.providerMessageId, '3EB0ABC', 'keeps the id so a late receipt can resolve it');
  });

  it('treats unexpected provider exceptions as UNKNOWN (safe default)', async () => {
    const h = harness({ baileys: () => new Error('boom') });
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: false }), 'UNKNOWN');
    assert.deepEqual(h.calls, ['BAILEYS-1:hello']);
  });

  it('does not fall back or retry for a bad recipient', async () => {
    const h = harness({ baileys: () => new ProviderError('INVALID_RECIPIENT', 'not on WhatsApp') });
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: false }), 'FAILED');
    assert.deepEqual(h.calls, ['BAILEYS-1:hello']);
    assert.equal(h.transitions.at(-1)!.failureCode, 'INVALID_RECIPIENT');
  });

  it('asks for a retry when every provider failed temporarily', async () => {
    const h = harness({ baileys: notConnected, meta: () => new ProviderError('RATE_LIMITED', '429') });
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: false }), 'RETRY');
    assert.equal(h.message.status, 'QUEUED');
  });

  it('fails permanently on the final attempt', async () => {
    const h = harness({ baileys: notConnected, meta: notConnected });
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: true }), 'FAILED');
    assert.equal(h.message.status, 'FAILED');
  });

  it('retries (priority reconnecting) even if the fallback has a permanent config problem', async () => {
    const h = harness({ baileys: notConnected, meta: () => new ProviderError('AUTH_FAILED', 'token expired') });
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: false }), 'RETRY');
  });

  it('goes back to the priority instance on the next attempt (recovery to priority)', async () => {
    let baileysUp = false;
    const h = harness({ baileys: () => (baileysUp ? 'ok' : notConnected()), meta: notConnected });
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: false }), 'RETRY');
    baileysUp = true;
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: false }), 'SENT');
    assert.deepEqual(h.calls, ['BAILEYS-1:hello', 'META-1:hello', 'BAILEYS-1:hello']);
  });

  it('is idempotent: settled messages are never sent again', async () => {
    for (const status of ['SENT', 'DELIVERED', 'READ', 'FAILED', 'UNKNOWN'] as const) {
      const h = harness({ status });
      assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: false }), 'SKIPPED');
      assert.deepEqual(h.calls, []);
    }
  });

  it('marks a message UNKNOWN if a previous worker died mid-send', async () => {
    const h = harness({ status: 'SENDING' });
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: false }), 'UNKNOWN');
    assert.deepEqual(h.calls, [], 'must not resend');
    assert.equal(h.transitions.at(-1)!.failureCode, 'INTERRUPTED_DURING_SEND');
  });

  it('fails when the project has no usable instance', async () => {
    const h = harness({ route: [] });
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: false }), 'FAILED');
    assert.equal(h.transitions.at(-1)!.failureCode, 'NO_INSTANCE_AVAILABLE');
  });

  it('works with only a priority instance (fallback optional)', async () => {
    const h = harness({ route: [BAILEYS], baileys: notConnected });
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: true }), 'FAILED');
    assert.deepEqual(h.calls, ['BAILEYS-1:hello']);
  });

  it('renders templates for providers that do not use Meta templates', async () => {
    const h = harness({
      message: { messageType: 'TEMPLATE', templateId: 'T1', content: { name: 'bill', language: 'en', variables: ['Ravi', 'INV-9'] } },
      template: { name: 'bill', language: 'en', body: 'Hi {{1}}, bill {{2}} is ready', status: 'PENDING' },
    });
    assert.equal(await processMessage('MSG-1', h.deps, { finalAttempt: false }), 'SENT');
    assert.deepEqual(h.calls, ['BAILEYS-1:Hi Ravi, bill INV-9 is ready']);
  });
});
