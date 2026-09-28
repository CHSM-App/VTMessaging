import { Worker } from 'bullmq';
import { rm } from 'node:fs/promises';
import { env, singleProcess } from '../../config/env.js';
import type { Logger } from '../../config/logger.js';
import { createRedis } from '../../config/redis.js';
import { SYSTEM, audit } from '../../modules/audit/application/audit.js';
import { applyReceipt, notifyMessageStatus } from '../../modules/messaging/application/messageEvents.js';
import { type ProcessMessageDeps, processMessage } from '../../modules/messaging/application/processMessage.js';
import * as messages from '../../modules/messaging/infrastructure/messageRepository.js';
import { findTemplateForSend } from '../../modules/templates/infrastructure/templateRepository.js';
import { findUnprocessedEvents } from '../../modules/webhooks/infrastructure/webhookRepository.js';
import * as instances from '../../modules/whatsapp-instances/infrastructure/instanceRepository.js';
import { findRoute } from '../../modules/whatsapp-service/infrastructure/serviceRepository.js';
import { BaileysProvider } from '../../providers/whatsapp/baileys/BaileysProvider.js';
import type { HealthStatus } from '../../providers/whatsapp/contracts/types.js';
import { type ProviderEvents, ProviderRegistry } from '../../providers/whatsapp/registry.js';
import { publishRealtime, setQr } from '../../realtime/events.js';
import { QUEUES, QUEUE_PREFIX } from '../queue.config.js';
import {
  type InstanceAction,
  type InstanceControlJob,
  type SendMessageJob,
  enqueueProviderEvent,
  enqueueSend,
  setLocalInstanceControl,
} from '../queues.js';
import { pollMessages } from './sqlPollers.js';

export async function startWhatsAppWorkers(log: Logger) {
  // Per-instance promise chains keep DB status writes in the order providers emitted them.
  const chains = new Map<string, Promise<unknown>>();
  const serial = (id: string, fn: () => Promise<unknown>) => {
    const next = (chains.get(id) ?? Promise.resolve()).then(fn).catch((err) => log.error({ err, instanceId: id }, 'Instance event handling failed'));
    chains.set(id, next);
  };

  const events: ProviderEvents = {
    onStatus: (instanceId, status, detail, health) =>
      serial(instanceId, async () => {
        await instances.updateInstanceState(instanceId, { status, detail, health });
        publishRealtime('instance.status', { instanceId, status, detail, healthStatus: health });
        if (status === 'CONNECTED' || status === 'READY') await audit(SYSTEM, 'instance.connected', 'whatsapp_instance', instanceId);
        if (status === 'DISCONNECTED') await audit(SYSTEM, 'instance.disconnected', 'whatsapp_instance', instanceId, { detail });
      }),
    onQr: (instanceId, qr) =>
      serial(instanceId, async () => {
        await setQr(instanceId, qr);
        publishRealtime('instance.qr', { instanceId, qr });
      }),
    onConnected: (instanceId, phoneNumber) => serial(instanceId, () => instances.updateInstanceState(instanceId, { phoneNumber })),
    onReceipt: (receipt) => {
      applyReceipt(receipt).catch((err) => log.error({ err, providerMessageId: receipt.providerMessageId }, 'Applying receipt failed'));
    },
  };

  const registry = new ProviderRegistry(instances.findInstance, events, log);

  const deps: ProcessMessageDeps = {
    loadMessage: messages.loadMessage,
    loadRoute: findRoute,
    loadTemplate: findTemplateForSend,
    getProvider: (instance) => registry.get(instance.id),
    startAttempt: (messageId, instance) => messages.startAttempt(messageId, instance.id, instance.provider),
    finishAttempt: messages.finishAttempt,
    async transition(id, status, fields) {
      await messages.transition(id, status, fields);
      if (status === 'SENT' && fields?.instanceId) await instances.touchInstanceActivity(fields.instanceId);
      if (status !== 'PROCESSING' && status !== 'SENDING') await notifyMessageStatus(id, status);
    },
  };

  const send = async (messageId: string, finalAttempt: boolean) => {
    const outcome = await processMessage(messageId, deps, { finalAttempt });
    log.info({ messageId, outcome }, 'Message processed');
    return outcome;
  };

  const control = async (instanceId: string, action: InstanceAction) => {
    log.info({ instanceId, action }, 'Instance control');
    switch (action) {
      case 'connect':
        return (await registry.get(instanceId)).connect();
      case 'disconnect':
        return (await registry.get(instanceId)).disconnect();
      case 'logout':
        await registry.get(instanceId);
        return registry.remove(instanceId, { logout: true });
      case 'reload': {
        const provider = await registry.reload(instanceId);
        if (provider.type === 'META_CLOUD') await provider.connect();
        return;
      }
      case 'remove':
        await registry.remove(instanceId, { logout: true });
        await rm(BaileysProvider.instanceDirFor(env.BAILEYS_AUTH_DIR, instanceId), { recursive: true, force: true });
        return;
    }
  };

  const stopQueues = singleProcess ? startSqlMode(send, control, log) : startBullMq(send, control, log);

  await restoreSessions(registry, log);
  const timers = [
    setInterval(() => void monitorHealth(registry, log), 60_000),
    setInterval(() => void revalidateMeta(registry, log), 15 * 60_000),
    ...(singleProcess ? [] : [setInterval(() => void recoverStale(log), 60_000)]), // SQL pollers need no sweep
  ];

  return {
    async close() {
      timers.forEach(clearInterval);
      await stopQueues(); // waits for in-flight sends
      await registry.closeAll();
    },
  };
}

type Send = (messageId: string, finalAttempt: boolean) => Promise<string>;
type Control = (instanceId: string, action: InstanceAction) => Promise<unknown>;

function startSqlMode(send: Send, control: Control, log: Logger) {
  setLocalInstanceControl(control);
  const poller = pollMessages(send, log);
  return async () => {
    setLocalInstanceControl(undefined);
    await poller.close();
  };
}

function startBullMq(send: Send, control: Control, log: Logger) {
  const connection = () => createRedis() as any;
  const sendWorker = new Worker<SendMessageJob>(
    QUEUES.SEND,
    async (job) => {
      const outcome = await send(job.data.messageId, job.attemptsMade + 1 >= (job.opts.attempts ?? 1));
      if (outcome === 'RETRY') throw new Error('Temporary provider failure; retrying with backoff');
      return outcome;
    },
    { connection: connection(), prefix: QUEUE_PREFIX, concurrency: env.WORKER_CONCURRENCY },
  );
  const controlWorker = new Worker<InstanceControlJob>(QUEUES.INSTANCE_CONTROL, ({ data }) => control(data.instanceId, data.action), {
    connection: connection(),
    prefix: QUEUE_PREFIX,
    concurrency: 1,
  });
  for (const w of [sendWorker, controlWorker]) {
    w.on('failed', (job, err) => log.warn({ queue: w.name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Job failed'));
    w.on('error', (err) => log.error({ err, queue: w.name }, 'Worker error'));
  }
  return async () => {
    await Promise.allSettled([sendWorker.close(), controlWorker.close()]);
  };
}

/** Reconnect Baileys instances that have a saved session; validate Meta instances. */
async function restoreSessions(registry: ProviderRegistry, log: Logger) {
  for (const i of await instances.listInstances()) {
    try {
      if (i.provider === 'META_CLOUD') {
        await (await registry.get(i.id)).connect();
      } else if (await BaileysProvider.hasSession(BaileysProvider.authDirFor(env.BAILEYS_AUTH_DIR, i.id))) {
        await (await registry.get(i.id)).connect();
      } else if (i.status !== 'CREATING' && i.status !== 'DISCONNECTED') {
        await instances.updateInstanceState(i.id, { status: 'DISCONNECTED', detail: 'No saved session; connect to pair', health: 'UNAVAILABLE' });
      }
    } catch (err) {
      log.error({ err, instanceId: i.id }, 'Could not restore instance');
    }
  }
}

const lastHealth = new Map<string, HealthStatus>();
async function monitorHealth(registry: ProviderRegistry, log: Logger) {
  for (const p of registry.all()) {
    try {
      const { status } = await p.getHealth();
      if (lastHealth.get(p.instanceId) === status) continue;
      lastHealth.set(p.instanceId, status);
      await instances.updateInstanceState(p.instanceId, { health: status });
      publishRealtime('instance.health', { instanceId: p.instanceId, healthStatus: status });
    } catch (err) {
      log.warn({ err, instanceId: p.instanceId }, 'Health check failed');
    }
  }
}

/** Re-checks Meta credentials/registration (catches expired tokens). */
async function revalidateMeta(registry: ProviderRegistry, log: Logger) {
  for (const p of registry.all().filter((p) => p.type === 'META_CLOUD')) {
    await p.connect().catch((err) => log.warn({ err, instanceId: p.instanceId }, 'Meta revalidation failed'));
  }
}

/** MSSQL is the source of truth: re-queue work that never reached (or was lost from) Redis. */
async function recoverStale(log: Logger) {
  try {
    for (const { id } of await messages.findStaleMessages()) {
      await enqueueSend(id); // same job id -> no-op if the job still exists
      await messages.markQueued(id);
    }
    for (const { id } of await findUnprocessedEvents()) await enqueueProviderEvent(id);
  } catch (err) {
    log.warn({ err }, 'Recovery sweep failed');
  }
}
