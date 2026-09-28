import { Redis, type RedisOptions } from 'ioredis';
import { env } from './env.js';

const base: RedisOptions = { host: env.REDIS_HOST, port: env.REDIS_PORT, password: env.REDIS_PASSWORD };

/** Connection for BullMQ queues/workers and pub/sub. Each consumer needs its own. */
export function createRedis(): Redis {
  return new Redis({ ...base, maxRetriesPerRequest: null }); // null is required by BullMQ workers
}

let shared: Redis | undefined;
/** Shared connection for simple commands (health ping, publish, QR cache); fails fast when Redis is down. */
export const redis = () => (shared ??= new Redis({ ...base, maxRetriesPerRequest: 1 }));

export async function closeRedis() {
  await shared?.quit().catch(() => {});
  shared = undefined;
}
