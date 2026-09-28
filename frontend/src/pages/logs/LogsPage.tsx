import { useState } from 'react';
import { Card, ErrorBox, Input, Loading, PageHeader, Pagination, Select, Table } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { qs } from '../../services/api/client';
import type { Page } from '../../types';
import { fmtDate } from '../../utils/format';

interface AuditLog {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const RESOURCES = ['project', 'api_key', 'whatsapp_instance', 'template', 'message', 'admin_user', 'provider'];

export function LogsPage() {
  const [filters, setFilters] = useState({ resourceType: '', action: '', page: 1 });
  const { data, error, loading } = useApi<Page<AuditLog>>(`/admin/audit-logs${qs({ ...filters, pageSize: 50 })}`);

  return (
    <>
      <PageHeader title="Audit logs" subtitle="Who changed what, and when" />
      <ErrorBox error={error} />
      <Card>
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <Select value={filters.resourceType} onChange={(e) => setFilters({ ...filters, resourceType: e.target.value, page: 1 })} aria-label="Resource">
            <option value="">All resources</option>
            {RESOURCES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
          <Input
            placeholder="Exact action, e.g. api_key.revoked"
            defaultValue={filters.action}
            onBlur={(e) => setFilters({ ...filters, action: e.target.value.trim(), page: 1 })}
            onKeyDown={(e) => e.key === 'Enter' && setFilters({ ...filters, action: (e.target as HTMLInputElement).value.trim(), page: 1 })}
          />
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <Table head={['When', 'Actor', 'Action', 'Resource', 'Details']} empty={!data?.items.length}>
            {data?.items.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-muted">{fmtDate(l.createdAt)}</td>
                <td className="text-xs">
                  <div className="font-medium">{l.actorType}</div>
                  <div className="text-muted">{l.actorId}</div>
                </td>
                <td className="font-mono text-xs text-heading">{l.action}</td>
                <td className="text-xs">
                  <div>{l.resourceType}</div>
                  <div className="font-mono text-muted">{l.resourceId}</div>
                </td>
                <td className="max-w-md">
                  {l.metadata && <pre className="whitespace-pre-wrap break-all text-xs text-muted">{JSON.stringify(l.metadata)}</pre>}
                </td>
              </tr>
            ))}
          </Table>
        )}
        {data && <Pagination page={filters.page} pageSize={50} total={data.total} onPage={(page) => setFilters({ ...filters, page })} />}
      </Card>
    </>
  );
}
