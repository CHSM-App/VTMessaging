import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/providers';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table } from '../../components/ui';
import { useApi, useSocketEvent } from '../../hooks/useApi';
import { API_URL, api } from '../../services/api/client';
import type { Instance, Project } from '../../types';
import { errorMessage, fmtDate, fmtRelative, providerLabel } from '../../utils/format';

type Detail = Omit<Instance, 'projects'> & {
  projects: { projectId: string; projectName: string; isEnabled: boolean; serviceRole: 'PRIORITY' | 'FALLBACK' | null }[];
};
interface Impact {
  projects: Detail['projects'];
  priorityFor: string[];
  fallbackFor: string[];
  requiresConfirmation: boolean;
}

export function InstanceDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data: inst, error, loading, reload, setData } = useApi<Detail>(`/admin/instances/${id}`);
  const [qr, setQr] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [editing, setEditing] = useState(false);

  // Latest QR on load (if pairing is in progress), then live updates.
  useEffect(() => {
    if (id) api.get<{ qr: string | null }>(`/admin/instances/${id}/qr`).then((r) => setQr(r.qr), () => {});
  }, [id]);
  useSocketEvent<{ instanceId: string; qr: string | null }>('instance.qr', (e) => e.instanceId === id && setQr(e.qr));
  useSocketEvent<{ instanceId: string; status: string; detail: string | null; healthStatus: string }>('instance.status', (e) => {
    if (e.instanceId !== id) return;
    setData((d) => d && { ...d, status: e.status, statusDetail: e.detail, healthStatus: e.healthStatus as Detail['healthStatus'] });
    if (e.status === 'CONNECTED' || e.status === 'READY') void reload(); // picks up the phone number
  });

  async function run(fn: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  if (loading && !inst) return <Loading />;
  if (!inst) return <ErrorBox error={error} />;
  const baileys = inst.provider === 'BAILEYS';
  const active = ['CONNECTED', 'CONNECTING', 'RECONNECTING', 'WAITING_FOR_PAIRING'].includes(inst.status);

  return (
    <>
      <PageHeader
        title={inst.name}
        subtitle={`${providerLabel(inst.provider)} · created ${fmtDate(inst.createdAt)}`}
        actions={
          <>
            {can('OPERATOR') && (!active || !baileys) && (
              <Button variant="primary" onClick={() => run(() => api.post(`/admin/instances/${inst.id}/connect`))}>
                {baileys ? 'Connect' : 'Validate with Meta'}
              </Button>
            )}
            {can('OPERATOR') && active && baileys && <Button onClick={() => run(() => api.post(`/admin/instances/${inst.id}/disconnect`))}>Disconnect</Button>}
            {can('ADMIN') && baileys && (
              <Button onClick={() => confirm('Log out this WhatsApp session? You will need to scan a new QR code.') && run(() => api.post(`/admin/instances/${inst.id}/logout`))}>
                Log out
              </Button>
            )}
            {can('ADMIN') && !baileys && <Button onClick={() => setEditing(true)}>Edit credentials</Button>}
            {can('ADMIN') && (
              <Button variant="danger" onClick={() => run(async () => setImpact(await api.get<Impact>(`/admin/instances/${inst.id}/impact`)))}>
                Delete
              </Button>
            )}
          </>
        }
      />
      <ErrorBox error={error ?? actionError} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Connection">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted">Status</dt>
              <dd className="mt-1">
                <Badge>{inst.status}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Health</dt>
              <dd className="mt-1">
                <Badge>{inst.healthStatus}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Phone number</dt>
              <dd className="mt-1 tabular-nums text-heading">{inst.phoneNumber ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Last activity</dt>
              <dd className="mt-1">{fmtRelative(inst.lastActivityAt)}</dd>
            </div>
          </dl>
          {inst.statusDetail && <p className="neu-inset mt-4 p-3 text-sm">{inst.statusDetail}</p>}
          {!baileys && (
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted">WABA ID</dt>
                <dd className="font-mono text-xs">{inst.config.wabaId}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Phone number ID</dt>
                <dd className="font-mono text-xs">{inst.config.phoneNumberId}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Access token</dt>
                <dd>{inst.config.accessTokenConfigured ? 'configured (encrypted)' : 'missing'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Webhook verified</dt>
                <dd>{inst.config.webhookVerifiedAt ? fmtDate(inst.config.webhookVerifiedAt) : 'not yet'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted">Meta callback URL</dt>
                <dd className="break-all font-mono text-xs">{API_URL}/api/v1/webhooks/meta</dd>
              </div>
            </dl>
          )}
        </Card>

        {baileys && (
          <Card title="Pairing">
            {inst.status === 'CONNECTED' ? (
              <p className="text-sm text-success">Paired and connected{inst.phoneNumber ? ` as ${inst.phoneNumber}` : ''}.</p>
            ) : qr ? (
              <div className="flex flex-col items-center gap-4">
                <div className="neu-inset p-4">
                  <img src={qr} alt="WhatsApp pairing QR code" width={260} height={260} className="rounded-lg bg-white" />
                </div>
                <p className="text-center text-sm text-muted">
                  On the phone: WhatsApp › Settings › Linked devices › Link a device. The code refreshes automatically.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">
                {inst.status === 'WAITING_FOR_PAIRING' || inst.status === 'CONNECTING' ? 'Waiting for a QR code…' : 'Click Connect to start pairing.'}
              </p>
            )}
          </Card>
        )}
      </div>

      <div className="mt-6">
        <AssignmentCard instance={inst} onChange={reload} />
      </div>

      <Modal title="Delete instance" open={!!impact} onClose={() => setImpact(null)}>
        {impact && (
          <div className="space-y-4 text-sm">
            {impact.projects.length ? (
              <>
                <p>
                  <strong className="text-danger">{inst.name}</strong> is used by {impact.projects.length} project(s). Deleting removes it from all of them:
                </p>
                <ul className="neu-inset space-y-1 p-3">
                  {impact.projects.map((p) => (
                    <li key={p.projectId}>
                      {p.projectName} {p.serviceRole && <Badge>{p.serviceRole}</Badge>}
                    </li>
                  ))}
                </ul>
                {impact.priorityFor.length > 0 && (
                  <p className="text-danger">
                    Priority instance for: {impact.priorityFor.join(', ')}. These projects will stop sending until a new priority instance is set.
                  </p>
                )}
                {impact.fallbackFor.length > 0 && <p className="text-warning">Fallback for: {impact.fallbackFor.join(', ')}. They will have no fallback.</p>}
              </>
            ) : (
              <p>This instance is not assigned to any project.</p>
            )}
            {baileys && <p className="text-muted">The WhatsApp session will be logged out and its files deleted.</p>}
            <div className="flex gap-3">
              <Button onClick={() => setImpact(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() =>
                  run(async () => {
                    await api.del(`/admin/instances/${inst.id}?confirm=true`);
                    navigate('/instances');
                  })
                }
              >
                Delete permanently
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {!baileys && <EditMetaModal instance={inst} open={editing} onClose={() => setEditing(false)} onSaved={reload} />}
    </>
  );
}

function AssignmentCard({ instance, onChange }: { instance: Detail; onChange: () => void }) {
  const { can } = useAuth();
  const { data: projects } = useApi<Project[]>('/admin/projects');
  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const assigned = new Set(instance.projects.map((p) => p.projectId));

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card title="Assigned projects">
      <ErrorBox error={error} />
      <Table head={['Project', 'Role', 'Enabled', '']} empty={!instance.projects.length}>
        {instance.projects.map((p) => (
          <tr key={p.projectId}>
            <td>
              <Link to={`/projects/${p.projectId}`} className="text-accent">
                {p.projectName}
              </Link>
            </td>
            <td>{p.serviceRole ? <Badge>{p.serviceRole}</Badge> : <span className="text-muted">—</span>}</td>
            <td>{p.isEnabled ? 'Yes' : 'No'}</td>
            <td className="text-right">
              {can('OPERATOR') && (
                <Button size="sm" variant="danger" onClick={() => run(() => api.del(`/admin/projects/${p.projectId}/instances/${instance.id}`))}>
                  Remove
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {can('OPERATOR') && (
        <div className="mt-4 flex gap-3">
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Assign to project…</option>
            {projects
              ?.filter((p) => !assigned.has(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
          <Button disabled={!pick} onClick={() => run(() => api.post(`/admin/projects/${pick}/instances`, { instanceId: instance.id }).then(() => setPick('')))}>
            Assign
          </Button>
        </div>
      )}
    </Card>
  );
}

function EditMetaModal({ instance, open, onClose, onSaved }: { instance: Detail; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: instance.name, wabaId: instance.config.wabaId ?? '', phoneNumberId: instance.config.phoneNumberId ?? '', accessToken: '' });
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.patch(`/admin/instances/${instance.id}`, {
        name: form.name,
        meta: { wabaId: form.wabaId, phoneNumberId: form.phoneNumberId, ...(form.accessToken ? { accessToken: form.accessToken } : {}) },
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <Modal title="Edit Meta instance" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Field label="Name">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="WABA ID">
          <Input required value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value })} />
        </Field>
        <Field label="Phone number ID">
          <Input required value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} />
        </Field>
        <Field label="New access token" hint="Leave empty to keep the current token.">
          <Input type="password" autoComplete="off" value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} />
        </Field>
        <Button variant="primary" type="submit">
          Save and re-validate
        </Button>
      </form>
    </Modal>
  );
}
