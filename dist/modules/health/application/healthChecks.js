import { query } from '../../../config/database.js';
import { singleProcess } from '../../../config/env.js';
import { redis } from '../../../config/redis.js';
import { withTimeout } from '../../../shared/utils/timeout.js';
async function check(fn) {
    const start = performance.now();
    try {
        await withTimeout(fn(), 2_000);
        return { ok: true, latencyMs: Math.round(performance.now() - start) };
    }
    catch (e) {
        // Only a short reason; never connection strings or credentials.
        return { ok: false, latencyMs: Math.round(performance.now() - start), error: e.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
    }
}
export async function runHealthChecks() {
    const [mssql, redisCheck] = await Promise.all([
        check(() => query('SELECT 1 AS ok')),
        singleProcess ? Promise.resolve({ ok: true, latencyMs: 0, error: 'not used (RUN_MODE=single)' }) : check(() => redis().ping()),
    ]);
    const ok = mssql.ok && redisCheck.ok;
    return {
        status: ok ? 'ok' : 'degraded',
        ready: ok,
        uptimeSeconds: Math.round(process.uptime()),
        checks: { application: { ok: true }, mssql, redis: redisCheck },
    };
}
//# sourceMappingURL=healthChecks.js.map