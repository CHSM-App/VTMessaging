import { Queue } from 'bullmq';
import { singleProcess } from '../config/env.js';
import { logger } from '../config/logger.js';
import { createRedis } from '../config/redis.js';
import { withTimeout } from '../shared/utils/timeout.js';
import { CONTROL_JOB_OPTIONS, QUEUES, QUEUE_PREFIX, SEND_JOB_OPTIONS, WEBHOOK_JOB_OPTIONS } from './queue.config.js';

export interface SendMessageJob {
  messageId: string;
}
export type WebhookJob = { kind: 'provider-event'; eventId: string } | { kind: 'deliver'; deliveryId: string };
export type InstanceAction = 'connect' | 'disconnect' | 'logout' | 'reload' | 'remove';
export interface InstanceControlJob {
  instanceId: string;
  action: InstanceAction;
}

// Created lazily so importing this module doesn't open Redis connections (tests, scripts).
const queues = new Map<string, Queue>();
const connections: ReturnType<typeof createRedis>[] = []; // BullMQ doesn't close connections it was given
function queue<T>(name: string, defaultJobOptions: object): Queue<T> {
  let q = queues.get(name);
  if (!q) {
    const connection = createRedis();
    connections.push(connection);
    q = new Queue(name, { connection: connection as any, prefix: QUEUE_PREFIX, defaultJobOptions });
    queues.set(name, q);
  }
  return q as Queue<T>;
}

// ioredis queues commands while Redis is down; never let an API request hang on that.
const bounded = <T>(p: Promise<T>) => withTimeout(p, 5_000);

export const sendQueue = () => queue<SendMessageJob>(QUEUES.SEND, SEND_JOB_OPTIONS);
export const webhookQueue = () => queue<WebhookJob>(QUEUES.WEBHOOKS, WEBHOOK_JOB_OPTIONS);
export const instanceControlQueue = () => queue<InstanceControlJob>(QUEUES.INSTANCE_CONTROL, CONTROL_JOB_OPTIONS);

// RUN_MODE=single: the rows in SQL Server are the queue (queue/workers/sqlPollers.ts), so
// enqueueing is a no-op and instance actions go straight to the in-process worker.
let localInstanceControl: ((instanceId: string, action: InstanceAction) => Promise<unknown>) | undefined;
export const setLocalInstanceControl = (fn: typeof localInstanceControl) => {
  localInstanceControl = fn;
};

/**
 * Invariant: one job id per message (send_<id>). Adding is then idempotent, and BullMQ's job
 * lock guarantees a message is never processed by two workers at once. A manual retry first
 * removes the finished job (kept in the completed/failed set) so the id can be reused.
 */
export async function enqueueSend(messageId: string, opts: { manualRetry?: boolean } = {}) {
  if (singleProcess) return;
  const jobId = `send_${messageId}`;
  if (opts.manualRetry) await bounded(sendQueue().getJob(jobId).then((job) => job?.remove()));
  return bounded(sendQueue().add('send', { messageId }, { jobId }));
}

export const enqueueProviderEvent = async (eventId: string) =>
  singleProcess ? undefined : bounded(webhookQueue().add('provider-event', { kind: 'provider-event', eventId }, { jobId: `event_${eventId}` }));

export const enqueueWebhookDelivery = async (deliveryId: string, opts: { redeliver?: boolean } = {}) =>
  singleProcess ? undefined : bounded(webhookQueue().add(
    'deliver',
    { kind: 'deliver', deliveryId },
    { jobId: opts.redeliver ? `redeliver_${deliveryId}_${Date.now()}` : `deliver_${deliveryId}` },
  ));

export async function enqueueInstanceAction(instanceId: string, action: InstanceAction) {
  if (!singleProcess) return bounded(instanceControlQueue().add(action, { instanceId, action }));
  // Fire and forget, like a queued job: connecting/validating can take a while.
  localInstanceControl?.(instanceId, action).catch((err) => logger.error({ err, instanceId, action }, 'Instance action failed'));
}

export async function closeQueues() {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  await Promise.allSettled(connections.map((c) => c.quit()));
  queues.clear();
  connections.length = 0;
}
