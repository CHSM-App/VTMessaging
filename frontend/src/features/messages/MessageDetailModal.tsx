import { useState } from 'react';
import { useAuth } from '../../app/providers';
import { Badge, Button, ErrorBox, Loading, Modal, Table } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { api } from '../../services/api/client';
import type { Attempt, Message } from '../../types';
import { errorMessage, fmtDate, providerLabel } from '../../utils/format';

type Detail = Message & { content: Record<string, unknown>; attempts: Attempt[]; queuedAt: string | null };

export function MessageDetailModal({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged?: () => void }) {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<Detail>(id ? `/admin/messages/${id}` : null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function retry() {
    if (!data) return;
    const unknown = data.status === 'UNKNOWN';
    const msg = unknown
      ? 'The delivery state is UNKNOWN: the recipient may already have this message. Resending can create a duplicate. Resend anyway?'
      : 'Retry sending this message?';
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      await api.post(`/admin/messages/${data.id}/retry`, { confirmUnknown: unknown });
      await reload();
      onChanged?.();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Message" open={!!id} onClose={onClose} wide>
      <ErrorBox error={error ?? actionError} />
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <Badge>{data.status}</Badge>
              <span className="text-muted">{data.messageType}</span>
              <span className="tabular-nums">to {data.recipient}</span>
              <span className="text-muted">· {data.projectName}</span>
              {can('OPERATOR') && (data.status === 'FAILED' || data.status === 'UNKNOWN') && (
                <Button size="sm" className="ml-auto" onClick={retry} busy={busy}>
                  Retry
                </Button>
              )}
            </div>
            {data.failureCode && (
              <div className="neu-inset p-3">
                <span className="font-medium text-danger">{data.failureCode}</span>
                <span className="text-muted"> — {data.failureReason}</span>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {(
                [
                  ['Created', data.createdAt],
                  ['Queued', data.queuedAt],
                  ['Sent', data.sentAt],
                  ['Delivered', data.deliveredAt],
                  ['Read', data.readAt],
                  ['Failed', data.failedAt],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd>{fmtDate(v)}</dd>
                </div>
              ))}
              <div>
                <dt className="text-xs text-muted">Idempotency key</dt>
                <dd className="break-all font-mono text-xs">{data.idempotencyKey ?? '—'}</dd>
              </div>
            </dl>
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-muted">Content</div>
              <pre className="neu-inset max-h-48 overflow-auto p-3 text-xs">{JSON.stringify(data.content, null, 2)}</pre>
            </div>
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-muted">Provider attempts</div>
              <Table head={['#', 'Instance', 'Provider', 'Status', 'Error', 'Started']} empty={!data.attempts.length}>
                {data.attempts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.attemptNumber}</td>
                    <td>{a.instanceName}</td>
                    <td>{providerLabel(a.provider)}</td>
                    <td>
                      <Badge>{a.status}</Badge>
                    </td>
                    <td className="max-w-xs text-xs">
                      {a.errorCode && <span className="font-medium">{a.errorCode}: </span>}
                      <span className="text-muted">{a.errorMessage}</span>
                    </td>
                    <td className="text-muted">{fmtDate(a.startedAt)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>
        )
      )}
    </Modal>
  );
}
