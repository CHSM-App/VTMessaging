import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';
/** Structured request logs with a request id (echoed back as X-Request-Id). */
export const requestLogger = pinoHttp({
    logger,
    genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{1,100}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
    },
    customProps: (req) => ({
        projectId: req.project?.id,
        adminId: req.admin?.id,
    }),
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
    serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
    },
});
//# sourceMappingURL=requestLogger.js.map