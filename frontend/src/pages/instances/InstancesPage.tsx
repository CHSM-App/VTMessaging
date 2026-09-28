import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table } from '../../components/ui';
import { useApi, useSocketEvent } from '../../hooks/useApi';
import { api } from '../../services/api/client';
import type { Instance, Provider } from '../../types';
import { errorMessage, fmtRelative, providerLabel } from '../../utils/format';

export function InstancesPage() {
  const { can } = useAuth();
  const { data, error, loading, reload, setData } = useApi<Instance[]>('/admin/instances');
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Live status without refetching the list.
  useSocketEvent<{ instanceId: string; status: string; detail: string | null; healthStatus: string }>('instance.status', (e) =>
    setData((list) => list?.map((i) => (i.id === e.instanceId ? { ...i, status: e.status, statusDetail: e.detail, healthStatus: e.healthStatus as Instance['healthStatus'] } : i)) ?? list),
  );
  useSocketEvent<{ instanceId: string; healthStatus: string }>('instance.health', (e) =>
    setData((list) => list?.map((i) => (i.id === e.instanceId ? { ...i, healthStatus: e.healthStatus as Instance['healthStatus'] } : i)) ?? list),
  );

  async function control(i: Instance, action: 'connect' | 'disconnect') {
    setActionError(null);
    try {
      await api.post(`/admin/instances/${i.id}/${action}`);
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="WhatsApp Instances"
        subtitle="One WhatsApp number + one provider connection. An instance can serve several projects."
        actions={can('ADMIN') && <Button variant="primary" onClick={() => setAdding(true)}>Add instance</Button>}
      />
      <ErrorBox error={error ?? actionError} />
      <Card>
        {loading && !data ? (
          <Loading />
        ) : (
          <Table head={['Instance', 'Phone', 'Provider', 'Status', 'Health', 'Assigned projects', 'Last activity', '']} empty={!data?.length}>
            {data?.map((i) => (
              <tr key={i.id}>
                <td>
                  <Link to={`/instances/${i.id}`} className="font-medium text-accent">
                    {i.name}
                  </Link>
                </td>
                <td className="tabular-nums">{i.phoneNumber ?? '—'}</td>
                <td>{providerLabel(i.provider)}</td>
                <td>
                  <Badge>{i.status}</Badge>
                  {i.statusDetail && <div className="mt-1 max-w-[14rem] truncate text-xs text-muted" title={i.statusDetail}>{i.statusDetail}</div>}
                </td>
                <td>
                  <Badge>{i.healthStatus}</Badge>
                </td>
                <td className="text-xs">
                  {i.projects.length
                    ? i.projects.map((p) => (
                        <div key={p.id}>
                          {p.name}
                          {p.serviceRole && <span className="ml-1 text-muted">({p.serviceRole.toLowerCase()})</span>}
                        </div>
                      ))
                    : <span className="text-muted">none</span>}
                </td>
                <td className="text-muted">{fmtRelative(i.lastActivityAt)}</td>
                <td className="text-right">
                  {can('OPERATOR') &&
                    (['CONNECTED', 'CONNECTING', 'RECONNECTING', 'WAITING_FOR_PAIRING'].includes(i.status) ? (
                      i.provider === 'BAILEYS' && <Button size="sm" onClick={() => control(i, 'disconnect')}>Disconnect</Button>
                    ) : (
                      <Button size="sm" onClick={() => control(i, 'connect')}>
                        {i.provider === 'META_CLOUD' ? 'Validate' : 'Connect'}
                      </Button>
                    ))}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <AddInstanceModal open={adding} onClose={() => { setAdding(false); void reload(); }} />
    </>
  );
}

function AddInstanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<Provider>('BAILEYS');
  const [meta, setMeta] = useState({ wabaId: '', phoneNumberId: '', accessToken: '', appId: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        provider === 'BAILEYS'
          ? { name, provider }
          : { name, provider, meta: { wabaId: meta.wabaId, phoneNumberId: meta.phoneNumberId, accessToken: meta.accessToken, appId: meta.appId || undefined } };
      const created = await api.post<Instance>('/admin/instances', body);
      navigate(`/instances/${created.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add WhatsApp instance" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Field label="Instance name">
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Vittam Primary" />
        </Field>
        <Field label="Provider">
          <Select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
            <option value="BAILEYS">Baileys (preferred — no per-message charges)</option>
            <option value="META_CLOUD">Meta Cloud API</option>
          </Select>
        </Field>
        {provider === 'BAILEYS' ? (
          <p className="neu-inset p-3 text-sm text-muted">After creating, click Connect and scan the QR code with WhatsApp on the phone (Linked devices).</p>
        ) : (
          <>
            <Field label="WhatsApp Business Account ID (WABA ID)">
              <Input required inputMode="numeric" value={meta.wabaId} onChange={(e) => setMeta({ ...meta, wabaId: e.target.value })} />
            </Field>
            <Field label="Phone number ID">
              <Input required inputMode="numeric" value={meta.phoneNumberId} onChange={(e) => setMeta({ ...meta, phoneNumberId: e.target.value })} />
            </Field>
            <Field label="Access token" hint="Stored encrypted; never shown again.">
              <Input required type="password" autoComplete="off" value={meta.accessToken} onChange={(e) => setMeta({ ...meta, accessToken: e.target.value })} />
            </Field>
            <Field label="App ID (optional)">
              <Input inputMode="numeric" value={meta.appId} onChange={(e) => setMeta({ ...meta, appId: e.target.value })} />
            </Field>
            <p className="text-xs text-muted">The instance becomes READY only after Meta confirms the credentials, phone registration and webhook.</p>
          </>
        )}
        <Button variant="primary" type="submit" busy={busy}>
          Create instance
        </Button>
      </form>
    </Modal>
  );
}
