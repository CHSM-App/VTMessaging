export const PROJECT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}
