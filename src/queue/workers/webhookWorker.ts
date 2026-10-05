import { Worker } from 'bullmq';
import { singleProcess } from '../../config/env.js';
import type { Logger } from '../../config/logger.js';
import { createRedis } from '../../config/redis.js';
import { deliverWebhook } from '../../modules/webhooks/application/projectWebhooks.js';
import { processProviderEvent } from '../../modules/webhooks/application/providerWebhooks.js';
import { QUEUES, QUEUE_PREFIX } from '../queue.config.js';
import type { WebhookJob } from '../queues.js';
import { pollWebhooks } from './sqlPollers.js';

/** Inbound provider events and outbound project webhook deliveries. */
export function startWebhookWorker(log: Logger) {
  if (singleProcess) return pollWebhooks(log);
  const worker = new Worker<WebhookJob>(
    QUEUES.WEBHOOKS,
    async (job) => {
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (job.data.kind === 'provider-event') return processProviderEvent(job.data.eventId);
      return deliverWebhook(job.data.deliveryId, finalAttempt);
    },
    { connection: createRedis() as any, prefix: QUEUE_PREFIX, concurrency: 5 },
  );
  worker.on('failed', (job, err) => log.warn({ jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Webhook job failed'));
  worker.on('error', (err) => log.error({ err }, 'Webhook worker error'));
  return { close: () => worker.close() };
}
