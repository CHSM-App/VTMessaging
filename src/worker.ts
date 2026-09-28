// Worker process: owns WhatsApp provider connections and processes all queues.
// Run separately from the API (PM2: vengurla-messaging-worker).
import { closeDb, db } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { closeRedis } from './config/redis.js';
import { closeQueues } from './queue/queues.js';
import { startWebhookWorker } from './queue/workers/webhookWorker.js';
import { startWhatsAppWorkers } from './queue/workers/whatsappWorker.js';

const log = logger.child({ process: 'worker' });

if (env.RUN_MODE === 'single') {
  // Two processes would open the same WhatsApp session twice.
  log.error('RUN_MODE=single runs the worker inside the API process; do not start worker.js');
  process.exit(1);
}

await db(); // fail fast if MSSQL is unreachable
const whatsapp = await startWhatsAppWorkers(log);
const webhooks = startWebhookWorker(log);
log.info('Worker started');

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'Worker shutting down');
  const force = setTimeout(() => {
    log.error('Forced exit after 30s');
    process.exit(1);
  }, 30_000);
  force.unref();

  await webhooks.close(); // 1-2. stop taking jobs, finish in-flight ones
  await whatsapp.close(); // ... and disconnect providers without logging out (sessions survive)
  await closeQueues();
  await closeRedis();
  await closeDb();
  log.info('Worker stopped cleanly');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
// PM2 on Windows cannot send signals; it sends this message instead (shutdown_with_message).
process.on('message', (msg) => msg === 'shutdown' && void shutdown('pm2 shutdown message'));
process.on('unhandledRejection', (err) => log.error({ err }, 'Unhandled rejection'));
