import { Server } from 'socket.io';
import { env, singleProcess } from '../config/env.js';
import { logger } from '../config/logger.js';
import { createRedis } from '../config/redis.js';
import { authenticateToken } from '../modules/auth/application/authUseCases.js';
import { REALTIME_CHANNEL, localBus } from './events.js';
const ADMINS_ROOM = 'admins';
/** Socket.IO for the dashboard. Only authenticated admins connect; all events go to the admins room. */
export function createSocketServer(httpServer) {
    const io = new Server(httpServer, {
        cors: { origin: env.FRONTEND_URL.split(','), credentials: false },
        serveClient: false,
    });
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (typeof token !== 'string')
                throw new Error('missing token');
            socket.data.admin = await authenticateToken(token);
            next();
        }
        catch {
            next(new Error('UNAUTHORIZED'));
        }
    });
    io.on('connection', (socket) => {
        socket.join(ADMINS_ROOM);
    });
    const emit = ({ event, data }) => io.to(ADMINS_ROOM).emit(event, data);
    const sub = singleProcess ? null : createRedis();
    if (sub) {
        sub.subscribe(REALTIME_CHANNEL).catch((err) => logger.error({ err }, 'Realtime subscribe failed'));
        sub.on('message', (_channel, raw) => {
            try {
                emit(JSON.parse(raw));
            }
            catch (err) {
                logger.warn({ err }, 'Bad realtime payload');
            }
        });
    }
    else {
        localBus.on('realtime', emit);
    }
    return {
        io,
        async close() {
            await new Promise((resolve) => io.close(() => resolve()));
            localBus.off('realtime', emit);
            await sub?.quit().catch(() => { });
        },
    };
}
//# sourceMappingURL=socket.js.map