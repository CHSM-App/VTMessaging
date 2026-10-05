import { Router } from 'express';
import { z } from 'zod';
import { queryOne, query, sql } from '../../config/database.js';
import { singleProcess } from '../../config/env.js';
import { withTimeout } from '../../shared/utils/timeout.js';
import { sendQueue } from '../../queue/queues.js';
import { ok } from '../../shared/http.js';
/** Dashboard overview. Every number comes from MSSQL/BullMQ; nothing is estimated. */
export const dashboardRoutes = Router();
dashboardRoutes.get('/dashboard', async (req, res) => {
    // "Today" starts at the viewer's local midnight (sent by the dashboard); defaults to UTC midnight.
    const { since } = z.object({ since: z.coerce.date().optional() }).parse(req.query);
    const todayStart = since ?? new Date(new Date().setUTCHours(0, 0, 0, 0));
    const [totals, instances, queue] = await Promise.all([
        queryOne(`SELECT
         (SELECT COUNT(*) FROM dbo.projects WHERE deleted_at IS NULL) AS total_projects,
         (SELECT COUNT(*) FROM dbo.projects WHERE deleted_at IS NULL AND status = 'ACTIVE') AS active_projects,
         (SELECT COUNT(*) FROM dbo.whatsapp_instances WHERE deleted_at IS NULL) AS total_instances,
         (SELECT COUNT(*) FROM dbo.whatsapp_instances WHERE deleted_at IS NULL AND status IN ('CONNECTED', 'READY')) AS active_instances,
         (SELECT COUNT(*) FROM dbo.whatsapp_instances WHERE deleted_at IS NULL AND health_status = 'HEALTHY') AS healthy_instances,
         (SELECT COUNT(*) FROM dbo.messages WHERE created_at >= @since) AS messages_today,
         (SELECT COUNT(*) FROM dbo.messages WHERE created_at >= @since AND status IN ('SENT', 'DELIVERED', 'READ')) AS sent_today,
         (SELECT COUNT(*) FROM dbo.messages WHERE created_at >= @since AND status = 'FAILED') AS failed_today,
         (SELECT COUNT(*) FROM dbo.messages WHERE created_at >= @since AND status = 'UNKNOWN') AS unknown_today,
         (SELECT COUNT(*) FROM dbo.messages WHERE status IN ('CREATED', 'QUEUED', 'PROCESSING', 'SENDING')) AS queued_messages`, { since: [sql.DateTime2(3), todayStart] }),
        query(`SELECT id, name, provider, phone_number, status, health_status, last_activity_at
       FROM dbo.whatsapp_instances WHERE deleted_at IS NULL ORDER BY name`),
        singleProcess ? null : withTimeout(sendQueue().getJobCounts('waiting', 'active', 'delayed', 'failed'), 1_500).catch(() => null),
    ]);
    ok(res, { since: todayStart, ...totals, providerHealth: instances, queue });
});
//# sourceMappingURL=dashboardRoutes.js.map