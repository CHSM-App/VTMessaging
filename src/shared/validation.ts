import { z } from 'zod';

/** SQL Server GUIDs (NEWSEQUENTIALID is not RFC-versioned, so z.uuid() would reject them). Normalized to upper case. */
export const id = z.guid().transform((s) => s.toUpperCase());
export const idParam = z.object({ id });

/** WhatsApp recipient: international format, digits only (no +). */
export const phone = z
  .string()
  .transform((s) => s.replace(/[\s+\-()]/g, ''))
  .pipe(z.string().regex(/^\d{8,15}$/, 'Phone must be 8-15 digits in international format, e.g. 919876543210'));

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export const httpUrl = z.url({ protocol: /^https?$/ });
