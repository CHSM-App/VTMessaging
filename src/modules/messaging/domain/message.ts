export const MESSAGE_STATUSES = [
  'CREATED',
  'QUEUED',
  'PROCESSING',
  'SENDING',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'UNKNOWN',
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const MESSAGE_TYPES = ['TEXT', 'IMAGE', 'DOCUMENT', 'TEMPLATE'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export type MessageContent =
  | { body: string } // TEXT
  | { url: string; caption?: string } // IMAGE
  | { url: string; filename?: string; caption?: string; mimeType?: string } // DOCUMENT
  | { name: string; language: string; variables: string[] }; // TEMPLATE

/** Once a message reaches one of these, the worker never sends it again on its own. */
export const SETTLED_STATUSES: ReadonlySet<MessageStatus> = new Set(['SENT', 'DELIVERED', 'READ', 'FAILED', 'UNKNOWN']);

/** Still waiting for the worker (used for the dashboard "queued" metric and the recovery sweep). */
export const PENDING_STATUSES: readonly MessageStatus[] = ['CREATED', 'QUEUED', 'PROCESSING', 'SENDING'];

const RANK: Record<MessageStatus, number> = {
  CREATED: 0,
  QUEUED: 1,
  PROCESSING: 2,
  SENDING: 3,
  UNKNOWN: 3,
  SENT: 4,
  DELIVERED: 5,
  READ: 6,
  FAILED: 7,
};

/**
 * Should a provider receipt (sent/delivered/read/failed) be applied to a message?
 * - statuses only move forward (a late "sent" never overwrites "read")
 * - a receipt resolves UNKNOWN: the provider proves the message was accepted
 * - FAILED from a provider only applies before delivery
 */
export function canApplyReceipt(current: MessageStatus, next: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'): boolean {
  if (current === 'FAILED') return false;
  if (next === 'FAILED') return RANK[current] <= RANK.SENT;
  return RANK[next] > RANK[current];
}

export const STATUS_EVENT: Partial<Record<MessageStatus, string>> = {
  SENT: 'message.sent',
  DELIVERED: 'message.delivered',
  READ: 'message.read',
  FAILED: 'message.failed',
  UNKNOWN: 'message.unknown',
};

/** Replaces Meta-style {{1}}, {{2}} placeholders. */
export function renderTemplate(body: string, variables: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n: string) => variables[Number(n) - 1] ?? m);
}

export function countPlaceholders(body: string): number {
  const nums = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}
