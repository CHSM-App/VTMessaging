import { pino } from 'pino';
import { env, isProduction } from './env.js';
export const logger = pino({
    level: env.LOG_LEVEL,
    base: { service: 'vengurla-messaging' },
    // Never log credentials, even by accident.
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers["x-api-key"]',
            'req.headers.cookie',
            '*.password',
            '*.accessToken',
            '*.token',
            '*.secret',
            '*.apiKey',
            '*.webhookSecret',
        ],
        censor: '[REDACTED]',
    },
    transport: isProduction ? undefined : { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } },
});
//# sourceMappingURL=logger.js.map