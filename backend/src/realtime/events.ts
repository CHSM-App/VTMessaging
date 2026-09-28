import { EventEmitter } from 'node:events';
import { singleProcess } from '../config/env.js';
import { logger } from '../config/logger.js';
import { redis } from '../config/redis.js';

/**
 * split mode:  worker -> Redis pub/sub -> API -> Socket.IO (WhatsApp lives in the worker process)
 * single mode: everything is one process, so a plain in-process EventEmitter does the job.
 */
export const REALTIME_CHANNEL = 'vmp:realtime';
export const localBus = new EventEmitter();

export interface RealtimeEvents {
  'instance.status': { instanceId: string; status: string; detail: string | null; healthStatus: string };
  'instance.qr': { instanceId: string; qr: string | null };
  'instance.health': { instanceId: string; healthStatus: string };
  'message.status': { messageId: string; projectId: string; status: string };
}

export function publishRealtime<E extends keyof RealtimeEvents>(event: E, data: RealtimeEvents[E]) {
  if (singleProcess) {
    localBus.emit('realtime', { event, data });
    return;
  }
  redis()
    .publish(REALTIME_CHANNEL, JSON.stringify({ event, data }))
    .catch((err) => logger.warn({ err, event }, 'Realtime publish failed'));
}

// Latest QR per instance, so a dashboard opened mid-pairing can show it without waiting.
const QR_TTL_SECONDS = 120;
const qrKey = (instanceId: string) => `vmp:qr:${instanceId.toUpperCase()}`;
const localQr = new Map<string, { qr: string; expires: number }>();

export async function setQr(instanceId: string, qr: string | null) {
  const key = qrKey(instanceId);
  if (singleProcess) {
    if (qr) localQr.set(key, { qr, expires: Date.now() + QR_TTL_SECONDS * 1000 });
    else localQr.delete(key);
    return;
  }
  if (qr) await redis().set(key, qr, 'EX', QR_TTL_SECONDS);
  else await redis().del(key);
}

export async function getQr(instanceId: string): Promise<string | null> {
  const key = qrKey(instanceId);
  if (!singleProcess) return redis().get(key);
  const hit = localQr.get(key);
  return hit && hit.expires > Date.now() ? hit.qr : null;
}
