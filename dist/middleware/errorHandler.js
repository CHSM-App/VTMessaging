import { ZodError, z } from 'zod';
import { isProduction } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../shared/errors/AppError.js';
export function notFoundHandler(req, res) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
}
export function errorHandler(err, req, res, _next) {
    if (err instanceof ZodError) {
        res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: z.prettifyError(err), details: err.issues },
        });
        return;
    }
    if (err instanceof AppError) {
        res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
        return;
    }
    // body-parser errors (malformed JSON, body too large)
    const status = err.status;
    if (status && status >= 400 && status < 500) {
        res.status(status).json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } });
        return;
    }
    (req.log ?? logger).error({ err }, 'Unhandled error');
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'Something went wrong',
            ...(isProduction ? {} : { stack: err?.stack }),
        },
    });
}
//# sourceMappingURL=errorHandler.js.map