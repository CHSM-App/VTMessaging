// API process (PM2: vengurla-messaging-api).
// RUN_MODE=split: WhatsApp connections live in the separate worker process.
// RUN_MODE=single: this process also runs the worker (WhatsApp + SQL Server queue), no Redis.
import { createServer } from 'node:http';
import { closeDb, db } from '../config/database.js';
import { env, singleProcess } from '../config/env.js';
import { logger } from '../config/logger.js';
import { closeRedis } from '../config/redis.js';
import { closeQueues } from '../queue/queues.js';
import { startWebhookWorker } from '../queue/workers/webhookWorker.js';
import { startWhatsAppWorkers } from '../queue/workers/whatsappWorker.js';
import { createSocketServer } from '../realtime/socket.js';
import { createApp } from './app.js';
const log = logger.child({ process: 'api' });
await db(); // fail fast if MSSQL is unreachable
const server = createServer(createApp());
server.requestTimeout = 30_000;
const realtime = createSocketServer(server);
server.listen(env.PORT, () => log.info({ port: env.PORT, runMode: env.RUN_MODE }, 'API listening'));
const worker = singleProcess ? [await startWhatsAppWorkers(log), startWebhookWorker(log)] : [];
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown)
        return;
    shuttingDown = true;
    log.info({ signal }, 'API shutting down');
    const force = setTimeout(() => {
        log.error('Forced exit (shutdown timeout)');
        process.exit(1);
    }, singleProcess ? 35_000 : 15_000); // single mode also waits for in-flight WhatsApp sends
    force.unref();
    const closed = new Promise((resolve) => server.close(resolve)); // 1. stop accepting, 2. finish in-flight requests
    await realtime.close(); // 3. Socket.IO
    await closed;
    for (const w of worker)
        await w.close(); // finish in-flight sends, keep Baileys sessions
    await closeQueues();
    await closeRedis(); // 5. Redis
    await closeDb(); // 4. MSSQL
    log.info('API stopped cleanly');
    process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
// PM2 on Windows cannot send signals; it sends this message instead (shutdown_with_message).
process.on('message', (msg) => msg === 'shutdown' && void shutdown('pm2 shutdown message'));
process.on('unhandledRejection', (err) => log.error({ err }, 'Unhandled rejection'));
//# sourceMappingURL=server.js.map