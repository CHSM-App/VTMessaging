export function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  return new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtRelative(v: string | null | undefined) {
  if (!v) return 'never';
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const providerLabel = (p: string) => (p === 'META_CLOUD' ? 'Meta Cloud API' : p === 'BAILEYS' ? 'Baileys' : p);

export const errorMessage = (e: unknown) => (e as Error)?.message ?? String(e);
