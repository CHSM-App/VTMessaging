import { env } from '../config/env.js';

export const QUEUE_PREFIX = 'vmp';

export const QUEUES = {
  SEND: 'whatsapp-send',
  WEBHOOKS: 'webhooks',
  INSTANCE_CONTROL: 'instance-control',
} as const;

export const SEND_JOB_OPTIONS = {
  attempts: env.SEND_MAX_ATTEMPTS,
  backoff: { type: 'exponential' as const, delay: 10_000 }, // 10s, 20s, 40s, ...
  removeOnComplete: { count: 5_000 },
  removeOnFail: { count: 10_000 },
};

export const WEBHOOK_JOB_OPTIONS = {
  attempts: env.WEBHOOK_MAX_ATTEMPTS,
  backoff: { type: 'exponential' as const, delay: 15_000 },
  removeOnComplete: { count: 5_000 },
  removeOnFail: { count: 10_000 },
};

export const CONTROL_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 1_000 },
};
