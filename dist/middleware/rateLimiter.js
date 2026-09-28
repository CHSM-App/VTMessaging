import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
const handler = (_req, res) => res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } });
// ponytail: in-memory counters are per API process; switch to a Redis store (rate-limit-redis) if the API is clustered.
const common = { standardHeaders: 'draft-8', legacyHeaders: false, handler };
/** Brute-force protection for dashboard login (per IP). */
export const loginLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 20 });
/** All client API requests, per project. */
export const projectRequestLimiter = rateLimit({
    ...common,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_REQUESTS_PER_WINDOW,
    keyGenerator: (req) => `req:${req.project.id}`,
});
/** Message submissions, per project (message throughput limit). */
export const projectMessageLimiter = rateLimit({
    ...common,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MESSAGES_PER_WINDOW,
    keyGenerator: (req) => `msg:${req.project.id}`,
});
/** Dashboard API (per IP). */
export const adminLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 600 });
//# sourceMappingURL=rateLimiter.js.map