import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useEffect, useState } from 'react';

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`neu-card p-5 sm:p-6 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-base">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger'; size?: 'md' | 'sm'; busy?: boolean };
export function Button({ variant = 'default', size = 'md', busy, className = '', children, disabled, ...rest }: ButtonProps) {
  const v = variant === 'primary' ? 'neu-btn-primary' : variant === 'danger' ? 'neu-btn-danger' : '';
  return (
    <button className={`neu-btn ${v} ${size === 'sm' ? 'neu-btn-sm' : ''} ${className}`} disabled={disabled || busy} {...rest}>
      {busy ? '…' : children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-heading">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`neu-input ${p.className ?? ''}`} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={`neu-input ${p.className ?? ''}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`neu-input ${p.className ?? ''}`} />;

const TONES: Record<string, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  muted: 'text-muted',
  accent: 'text-accent',
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  ACTIVE: 'success',
  INACTIVE: 'muted',
  REVOKED: 'muted',
  HEALTHY: 'success',
  DEGRADED: 'warning',
  UNAVAILABLE: 'danger',
  CONNECTED: 'success',
  READY: 'success',
  CONNECTING: 'info',
  RECONNECTING: 'warning',
  WAITING_FOR_PAIRING: 'accent',
  CREATING: 'muted',
  CREATED: 'muted',
  CONFIGURING: 'info',
  CREDENTIALS_VALID: 'info',
  PHONE_REGISTERED: 'info',
  WEBHOOK_VERIFIED: 'info',
  DISCONNECTED: 'muted',
  ERROR: 'danger',
  CONFIG_ERROR: 'danger',
  AUTH_ERROR: 'danger',
  PHONE_REGISTRATION_FAILED: 'danger',
  WEBHOOK_ERROR: 'danger',
  QUEUED: 'info',
  PROCESSING: 'info',
  SENDING: 'info',
  SENT: 'success',
  DELIVERED: 'success',
  READ: 'success',
  FAILED: 'danger',
  UNKNOWN: 'warning',
  STARTED: 'info',
  DRAFT: 'muted',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  PAUSED: 'warning',
  DISABLED: 'muted',
  PRIORITY: 'accent',
  FALLBACK: 'info',
};

export function Badge({ children, tone }: { children: ReactNode; tone?: keyof typeof TONES }) {
  const t = tone ?? STATUS_TONE[String(children)] ?? 'muted';
  return (
    <span className={`neu-badge ${TONES[t]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {typeof children === 'string' ? children.replaceAll('_', ' ') : children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

/** Horizontal scroll lives inside the card, never on the page. */
export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="neu-table min-w-full">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={head.length} className="py-8 text-center text-muted">
                Nothing here yet.
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ title, open, onClose, children, wide }: { title: string; open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-16 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`neu-card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg">{title}</h2>
          <button className="neu-btn neu-btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <div role="alert" className="neu-inset mb-4 px-4 py-3 text-sm text-danger">
      {error}
    </div>
  );
}

export function Loading() {
  return <div className="py-10 text-center text-sm text-muted">Loading…</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="neu-card p-5">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 text-3xl font-light text-heading tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Shows a secret exactly once with a copy button. */
export function SecretReveal({ label, secret, onDone }: { label: string; secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-3 text-sm text-warning">{label} It will not be shown again — store it securely now.</p>
      <div className="neu-inset mb-4 break-all p-4 font-mono text-sm text-heading">{secret}</div>
      <div className="flex gap-3">
        <Button
          onClick={() =>
            navigator.clipboard.writeText(secret).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </Button>
        <Button variant="primary" onClick={onDone}>
          I have stored it
        </Button>
      </div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted">
      <span>
        {total} total · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
