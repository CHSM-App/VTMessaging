import { isDuplicateKey } from '../../../config/database.js';
import { logger } from '../../../config/logger.js';
import { enqueueSend } from '../../../queue/queues.js';
import { AppError, badRequest, notFound } from '../../../shared/errors/AppError.js';
import type { ProjectPrincipal } from '../../api-keys/domain/apiKey.js';
import { type Actor, audit } from '../../audit/application/audit.js';
import { findTemplateByName } from '../../templates/infrastructure/templateRepository.js';
import { findService } from '../../whatsapp-service/infrastructure/serviceRepository.js';
import { type MessageContent, type MessageStatus, type MessageType, countPlaceholders } from '../domain/message.js';
import * as repo from '../infrastructure/messageRepository.js';

export type SendMessageInput = { to: string; idempotencyKey?: string } & (
  | { type: 'text'; text: { body: string } }
  | { type: 'image'; image: { url: string; caption?: string } }
  | { type: 'document'; document: { url: string; filename?: string; caption?: string; mimeType?: string } }
  | { type: 'template'; template: { name: string; language: string; variables: string[] } }
);

export interface SendMessageResult {
  messageId: string;
  status: MessageStatus;
  duplicate: boolean;
}

/**
 * API side of sending: validate -> idempotency -> persist (MSSQL is the source of truth) -> queue.
 * The worker does the actual provider work. The client never chooses a provider.
 */
export async function sendMessage(project: ProjectPrincipal, input: SendMessageInput): Promise<SendMessageResult> {
  const key = input.idempotencyKey ?? null;
  if (key) {
    const existing = await repo.findByIdempotencyKey(project.id, key);
    if (existing) return { messageId: existing.id, status: existing.status, duplicate: true };
  }

  if (!(await findService(project.id))) {
    throw new AppError(422, 'WHATSAPP_SERVICE_NOT_CONFIGURED', 'WhatsApp messaging is not configured for this project yet');
  }

  let messageType: MessageType;
  let content: MessageContent;
  let templateId: string | null = null;
  switch (input.type) {
    case 'text':
      [messageType, content] = ['TEXT', input.text];
      break;
    case 'image':
      [messageType, content] = ['IMAGE', input.image];
      break;
    case 'document':
      [messageType, content] = ['DOCUMENT', input.document];
      break;
    case 'template': {
      const t = await findTemplateByName(project.id, input.template.name, input.template.language);
      if (!t) throw new AppError(422, 'TEMPLATE_NOT_FOUND', `Template "${input.template.name}" (${input.template.language}) not found`);
      const expected = countPlaceholders(t.body);
      if (expected !== input.template.variables.length) {
        throw badRequest('TEMPLATE_VARIABLES_MISMATCH', `Template expects ${expected} variables, got ${input.template.variables.length}`);
      }
      [messageType, content, templateId] = ['TEMPLATE', input.template, t.id];
      break;
    }
  }

  let id: string;
  try {
    id = await repo.insertMessage({ projectId: project.id, recipient: input.to, messageType, content, templateId, idempotencyKey: key });
  } catch (err) {
    // Two concurrent requests with the same key: the unique index lets exactly one insert win.
    if (key && isDuplicateKey(err)) {
      const existing = (await repo.findByIdempotencyKey(project.id, key))!;
      return { messageId: existing.id, status: existing.status, duplicate: true };
    }
    throw err;
  }

  try {
    await enqueueSend(id);
  } catch (err) {
    // Accepted and stored; the worker's recovery sweep queues CREATED messages once Redis is back.
    logger.error({ err, messageId: id, projectId: project.id }, 'Queueing failed; message left in CREATED for recovery');
    return { messageId: id, status: 'CREATED', duplicate: false };
  }
  await repo.markQueued(id);
  return { messageId: id, status: 'QUEUED', duplicate: false };
}

/**
 * Operator retry. UNKNOWN messages may already have been delivered, so they need explicit
 * confirmation that a duplicate is acceptable.
 */
export async function retryMessage(actor: Actor, id: string, confirmUnknown: boolean) {
  const m = await repo.findMessageSummary(id);
  if (!m) throw notFound('Message');
  if (m.status === 'UNKNOWN' && !confirmUnknown) {
    throw new AppError(409, 'CONFIRMATION_REQUIRED', 'Delivery state is UNKNOWN; the recipient may already have this message. Confirm to resend.');
  }
  if (!(await repo.resetForRetry(id, confirmUnknown))) {
    throw new AppError(409, 'NOT_RETRYABLE', `Only FAILED or UNKNOWN messages can be retried (status is ${m.status})`);
  }
  await enqueueSend(id, { manualRetry: true });
  await audit(actor, 'message.retried', 'message', id, { previousStatus: m.status });
  return { messageId: id, status: 'QUEUED' as const };
}
