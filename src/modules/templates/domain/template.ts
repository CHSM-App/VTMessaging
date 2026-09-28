export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

/** Meta template names: lowercase letters, digits, underscores. */
export const TEMPLATE_NAME = /^[a-z0-9_]{1,512}$/;

export type TemplateButton =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string };

export interface TemplateDefinition {
  name: string;
  category: TemplateCategory;
  language: string;
  header: string | null;
  body: string;
  footer: string | null;
  /** Example values for {{1}}, {{2}}, ... (Meta requires examples when variables are used). */
  variables: string[];
  buttons: TemplateButton[];
}

/** Content can only change before Meta approves it. */
export const isEditable = (status: TemplateStatus) => status === 'DRAFT' || status === 'REJECTED';

/** Meta has more states than we track; only Meta's own APPROVED maps to APPROVED. */
export function mapMetaTemplateStatus(metaStatus: string | undefined): TemplateStatus {
  switch (metaStatus?.toUpperCase()) {
    case 'APPROVED':
      return 'APPROVED';
    case 'REJECTED':
      return 'REJECTED';
    case 'PAUSED':
      return 'PAUSED';
    case 'DISABLED':
    case 'DELETED':
    case 'PENDING_DELETION':
    case 'ARCHIVED':
    case 'LIMIT_EXCEEDED':
      return 'DISABLED';
    default:
      return 'PENDING'; // PENDING, IN_APPEAL, unknown
  }
}

/** Graph API payload for POST /{waba-id}/message_templates */
export function toMetaTemplatePayload(t: TemplateDefinition) {
  const components: Record<string, unknown>[] = [];
  if (t.header) components.push({ type: 'HEADER', format: 'TEXT', text: t.header });
  components.push({ type: 'BODY', text: t.body, ...(t.variables.length ? { example: { body_text: [t.variables] } } : {}) });
  if (t.footer) components.push({ type: 'FOOTER', text: t.footer });
  if (t.buttons.length) components.push({ type: 'BUTTONS', buttons: t.buttons });
  return { name: t.name, language: t.language, category: t.category, components };
}
