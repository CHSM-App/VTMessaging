import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, ErrorBox, Loading, PageHeader, Stat, Table } from '../../components/ui';
import { useApi, useSocketEvent } from '../../hooks/useApi';
import { qs } from '../../services/api/client';
import type { Health, Provider } from '../../types';
import { fmtRelative, providerLabel } from '../../utils/format';

interface Dashboard {
  totalProjects: number;
  activeProjects: number;
  totalInstances: number;
  activeInstances: number;
  healthyInstances: number;
  messagesToday: number;
  sentToday: number;
  failedToday: number;
  unknownToday: number;
  queuedMessages: number;
  queue: { waiting: number; active: number; delayed: number; failed: number } | null;
  providerHealth: { id: string; name: string; provider: Provider; phoneNumber: string | null; status: string; healthStatus: Health; lastActivityAt: string | null }[];
}

export function DashboardPage() {
  // "Today" = since local midnight.
  const since = useMemo(() => new Date(new Date().setHours(0, 0, 0, 0)).toISOString(), []);
  const { data, error, loading, reload } = useApi<Dashboard>(`/admin/dashboard${qs({ since })}`);

  // Refresh (debounced) when anything changes in realtime.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refresh = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void reload(), 1500);
  };
  useSocketEvent('message.status', refresh);
  useSocketEvent('instance.status', refresh);
  useSocketEvent('instance.health', refresh);

  if (loading && !data) return <Loading />;
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live overview of the messaging platform" />
      <ErrorBox error={error} />
      {data && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-5 md:grid-cols-4">
            <Stat label="Total projects" value={data.totalProjects} hint={`${data.activeProjects} active`} />
            <Stat label="Active instances" value={data.activeInstances} hint={`of ${data.totalInstances}`} />
            <Stat label="Healthy instances" value={data.healthyInstances} />
            <Stat label="Queued messages" value={data.queuedMessages} hint={data.queue ? `${data.queue.delayed} waiting to retry` : undefined} />
            <Stat label="Messages today" value={data.messagesToday} />
            <Stat label="Sent today" value={data.sentToday} hint="sent, delivered or read" />
            <Stat label="Failed today" value={data.failedToday} />
            <Stat label="Unknown today" value={data.unknownToday} hint="need review, not resent" />
          </div>
          <Card title="Provider health">
            <Table head={['Instance', 'Provider', 'Phone', 'Status', 'Health', 'Last activity']} empty={!data.providerHealth.length}>
              {data.providerHealth.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link className="font-medium text-accent" to={`/instances/${i.id}`}>
                      {i.name}
                    </Link>
                  </td>
                  <td>{providerLabel(i.provider)}</td>
                  <td className="tabular-nums">{i.phoneNumber ?? '—'}</td>
                  <td>
                    <Badge>{i.status}</Badge>
                  </td>
                  <td>
                    <Badge>{i.healthStatus}</Badge>
                  </td>
                  <td className="text-muted">{fmtRelative(i.lastActivityAt)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
