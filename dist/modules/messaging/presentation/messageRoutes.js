import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../../middleware/authorization.js';
import { projectMessageLimiter } from '../../../middleware/rateLimiter.js';
import { notFound } from '../../../shared/errors/AppError.js';
import { adminActor, ok } from '../../../shared/http.js';
import { httpUrl, id, idParam, pagination, phone } from '../../../shared/validation.js';
import { retryMessage, sendMessage } from '../application/sendMessage.js';
import { MESSAGE_STATUSES } from '../domain/message.js';
import * as repo from '../infrastructure/messageRepository.js';
const idempotencyKey = z.string().trim().min(1).max(200).optional();
const caption = z.string().max(1024).optional();
export const sendMessageBody = z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), to: phone, idempotencyKey, text: z.object({ body: z.string().min(1).max(4096) }) }),
    z.object({ type: z.literal('image'), to: phone, idempotencyKey, image: z.object({ url: httpUrl, caption }) }),
    z.object({
        type: z.literal('document'),
        to: phone,
        idempotencyKey,
        document: z.object({
            url: httpUrl,
            filename: z.string().max(240).optional(),
            caption,
            mimeType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/).optional(),
        }),
    }),
    z.object({
        type: z.literal('template'),
        to: phone,
        idempotencyKey,
        template: z.object({
            name: z.string().min(1).max(512),
            language: z.string().min(2).max(15).default('en'),
            variables: z.array(z.string().min(1).max(1024)).max(20).default([]),
        }),
    }),
]);
/** Client API (API key auth), mounted at /api/v1 */
export const clientMessageRoutes = Router();
clientMessageRoutes.post('/messages', projectMessageLimiter, async (req, res) => {
    const body = sendMessageBody.parse(req.body);
    const headerKey = req.header('Idempotency-Key')?.trim();
    const result = await sendMessage(req.project, { ...body, idempotencyKey: body.idempotencyKey ?? (headerKey || undefined) });
    const { duplicate, ...data } = result;
    if (duplicate)
        res.setHeader('Idempotent-Replayed', 'true');
    ok(res, data, duplicate ? 200 : 202);
});
clientMessageRoutes.get('/messages/:id', async (req, res) => {
    const message = await repo.findClientMessage(req.project.id, idParam.parse(req.params).id);
    if (!message)
        throw notFound('Message');
    ok(res, message);
});
clientMessageRoutes.get('/usage', async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }).parse(req.query);
    const from = new Date(Date.now() - days * 86_400_000);
    const byStatus = await repo.projectUsage(req.project.id, from);
    ok(res, { from, total: byStatus.reduce((n, r) => n + r.count, 0), byStatus });
});
/** Dashboard, mounted under /api/v1/admin */
export const adminMessageRoutes = Router();
const listQuery = pagination.extend({
    projectId: id.optional(),
    instanceId: id.optional(),
    status: z.enum(MESSAGE_STATUSES).optional(),
    recipient: z.string().regex(/^\d{1,15}$/).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
});
adminMessageRoutes.get('/messages', async (req, res) => ok(res, await repo.listMessages(listQuery.parse(req.query))));
adminMessageRoutes.get('/messages/:id', async (req, res) => {
    const message = await repo.getMessageDetail(idParam.parse(req.params).id);
    if (!message)
        throw notFound('Message');
    ok(res, message);
});
adminMessageRoutes.post('/messages/:id/retry', requireRole('OPERATOR'), async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { confirmUnknown } = z.object({ confirmUnknown: z.boolean().default(false) }).parse(req.body ?? {});
    ok(res, await retryMessage(adminActor(req), id, confirmUnknown), 202);
});
//# sourceMappingURL=messageRoutes.js.map