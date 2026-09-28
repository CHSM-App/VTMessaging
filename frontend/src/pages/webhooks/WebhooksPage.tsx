import { useState } from 'react';
import { useAuth } from '../../app/providers';
import { Badge, Button, Card, ErrorBox, Loading, Modal, PageHeader, Pagination, Table } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { API_URL, api } from '../../services/api/client';
import type { Page } from '../../types';
import { errorMessage, fmtDate } from '../../utils/format';

interface Delivery {
  id: string;
  projectName: string;
  eventType: string;
  payload: unknown;
  targetUrl: string;
  status: string;
  attempts: number;
  lastAttemptAt: string | null;
  failureReason: string | null;
  createdAt: string;
}
interface ProviderEvent {
  id: string;
  provider: string;
  eventType: string;
  externalEventId: string | null;
  payload: unknown;
  processed: boolean;
  error: string | null;
  createdAt: string;
}

export function WebhooksPage() {
  const [tab, setTab] = useState<'deliveries' | 'events'>('deliveries');
  return (
    <>
      <PageHeader title="Webhooks" subtitle="Outbound events to projects and inbound events from providers" />
      <div className="mb-6 flex gap-3">
        <button className={`neu-nav ${tab === 'deliveries' ? 'active' : ''}`} onClick={() => setTab('deliveries')}>
          Project deliveries
        </button>
        <button className={`neu-nav ${tab === 'events' ? 'active' : ''}`} onClick={() => setTab('events')}>
          Provider events
        </button>
      </div>
      {tab === 'deliveries' ? <Deliveries /> : <ProviderEvents />}
    </>
  );
}

function Deliveries() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Page<Delivery>>(`/admin/webhooks/deliveries?page=${page}`);
  const [payload, setPayload] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  return (
    <Card>
      <p className="mb-4 text-sm text-muted">Configure each project's webhook URL on its project page. Failed deliveries are retried with backoff.</p>
      <ErrorBox error={error ?? actionError} />
      {loading && !data ? (
        <Loading />
      ) : (
        <Table head={['Created', 'Project', 'Event', 'Status', 'Attempts', 'Failure', '']} empty={!data?.items.length}>
          {data?.items.map((d) => (
            <tr key={d.id}>
              <td className="whitespace-nowrap text-muted">{fmtDate(d.createdAt)}</td>
              <td>{d.projectName}</td>
              <td>
                <button className="font-mono text-xs text-accent" onClick={() => setPayload(d.payload)}>
                  {d.eventType}
                </button>
              </td>
              <td>
                <Badge tone={d.status === 'DELIVERED' ? 'success' : d.status === 'FAILED' ? 'danger' : 'warning'}>{d.status}</Badge>
              </td>
              <td className="tabular-nums">{d.attempts}</td>
              <td className="max-w-[14rem] truncate text-xs text-muted" title={d.failureReason ?? ''}>
                {d.failureReason}
              </td>
              <td className="text-right">
                {can('OPERATOR') && d.status !== 'DELIVERED' && (
                  <Button
                    size="sm"
                    onClick={() =>
                      api.post(`/admin/webhooks/deliveries/${d.id}/redeliver`).then(
                        () => reload(),
                        (e) => setActionError(errorMessage(e)),
                      )
                    }
                  >
                    Redeliver
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      <PayloadModal payload={payload} onClose={() => setPayload(null)} />
    </Card>
  );
}

function ProviderEvents() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi<Page<ProviderEvent>>(`/admin/webhooks/events?page=${page}`);
  const [payload, setPayload] = useState<unknown>(null);
  return (
    <Card>
      <p className="mb-4 text-sm text-muted">
        Meta callback URL: <span className="font-mono text-heading">{API_URL}/api/v1/webhooks/meta</span> (verify token = META_WEBHOOK_VERIFY_TOKEN on the server).
      </p>
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <Table head={['Received', 'Provider', 'Type', 'External id', 'Processed']} empty={!data?.items.length}>
          {data?.items.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap text-muted">{fmtDate(e.createdAt)}</td>
              <td>{e.provider}</td>
              <td>
                <button className="font-mono text-xs text-accent" onClick={() => setPayload(e.payload)}>
                  {e.eventType}
                </button>
              </td>
              <td className="max-w-[16rem] truncate font-mono text-xs">{e.externalEventId ?? '—'}</td>
              <td>{e.processed ? <Badge tone="success">yes</Badge> : <Badge tone={e.error ? 'danger' : 'warning'}>{e.error ?? 'pending'}</Badge>}</td>
            </tr>
          ))}
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      <PayloadModal payload={payload} onClose={() => setPayload(null)} />
    </Card>
  );
}

function PayloadModal({ payload, onClose }: { payload: unknown; onClose: () => void }) {
  return (
    <Modal title="Payload" open={payload !== null} onClose={onClose} wide>
      <pre className="neu-inset max-h-[60vh] overflow-auto p-4 text-xs">{JSON.stringify(payload, null, 2)}</pre>
    </Modal>
  );
}
