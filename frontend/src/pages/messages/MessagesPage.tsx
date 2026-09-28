import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, ErrorBox, Input, Loading, PageHeader, Pagination, Select } from '../../components/ui';
import { MessageDetailModal } from '../../features/messages/MessageDetailModal';
import { MessageTable } from '../../features/messages/MessageTable';
import { useApi, useSocketEvent } from '../../hooks/useApi';
import { qs } from '../../services/api/client';
import type { Message, Page, Project } from '../../types';

const STATUSES = ['CREATED', 'QUEUED', 'PROCESSING', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNKNOWN'];

export function MessagesPage() {
  const [params, setParams] = useSearchParams();
  const filters = {
    projectId: params.get('projectId') ?? '',
    status: params.get('status') ?? '',
    recipient: params.get('recipient') ?? '',
    page: Number(params.get('page') ?? 1),
  };
  const { data: projects } = useApi<Project[]>('/admin/projects');
  const { data, error, loading, reload } = useApi<Page<Message>>(`/admin/messages${qs({ ...filters, pageSize: 25 })}`);
  const [open, setOpen] = useState<string | null>(null);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useSocketEvent('message.status', () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void reload(), 1000);
  });

  return (
    <>
      <PageHeader title="Messages" subtitle="Every message with its provider attempts. Updates live." />
      <ErrorBox error={error} />
      <Card>
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Select value={filters.projectId} onChange={(e) => set('projectId', e.target.value)} aria-label="Project">
            <option value="">All projects</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select value={filters.status} onChange={(e) => set('status', e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Input
            placeholder="Recipient starts with…"
            inputMode="numeric"
            defaultValue={filters.recipient}
            onKeyDown={(e) => e.key === 'Enter' && set('recipient', (e.target as HTMLInputElement).value.replace(/\D/g, ''))}
            onBlur={(e) => set('recipient', e.target.value.replace(/\D/g, ''))}
          />
        </div>
        {loading && !data ? <Loading /> : <MessageTable items={data?.items ?? []} onOpen={setOpen} />}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set('page', String(p))} />}
      </Card>
      <MessageDetailModal id={open} onClose={() => setOpen(null)} onChanged={reload} />
    </>
  );
}
