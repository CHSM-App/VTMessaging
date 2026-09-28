import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/providers';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, SecretReveal, Select, Stat, Table, Textarea } from '../../components/ui';
import { ApiKeyTable } from '../../features/api-keys/ApiKeyTable';
import { CreateApiKeyModal } from '../../features/api-keys/CreateApiKeyModal';
import { MessageDetailModal } from '../../features/messages/MessageDetailModal';
import { MessageTable } from '../../features/messages/MessageTable';
import { useApi, useSocketEvent } from '../../hooks/useApi';
import { api } from '../../services/api/client';
import type { ApiKey, AssignedInstance, Instance, Message, Page, Project, Service } from '../../types';
import { errorMessage, fmtDate, providerLabel } from '../../utils/format';

type Detail = Project & { apiKeys: ApiKey[]; instances: AssignedInstance[]; service: Service | null };

export function ProjectDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data: p, error, loading, reload } = useApi<Detail>(`/admin/projects/${id}`);
  const [editing, setEditing] = useState(false);
  const [newKey, setNewKey] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  if (loading && !p) return <Loading />;
  if (!p) return <ErrorBox error={error} />;

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={
          <>
            <span className="font-mono">{p.slug}</span> · created {fmtDate(p.createdAt)}
          </>
        }
        actions={
          <>
            <Badge>{p.status}</Badge>
            {can('OPERATOR') && (
              <>
                <Button onClick={() => setEditing(true)}>Edit</Button>
                <Button onClick={() => run(() => api.patch(`/admin/projects/${p.id}`, { status: p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }))}>
                  {p.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                </Button>
              </>
            )}
            {can('ADMIN') && (
              <Button
                variant="danger"
                onClick={() =>
                  confirm(`Delete ${p.name}? Its API keys are revoked immediately.`) &&
                  run(async () => {
                    await api.del(`/admin/projects/${p.id}`);
                    navigate('/projects');
                  })
                }
              >
                Delete
              </Button>
            )}
          </>
        }
      />
      <ErrorBox error={error ?? actionError} />
      {p.description && <p className="-mt-3 mb-6 text-sm">{p.description}</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        <ServiceCard project={p} onSaved={reload} />
        <AssignedInstancesCard project={p} onChange={reload} />
      </div>

      <div className="mt-6">
        <Card title="API keys" actions={can('OPERATOR') && <Button onClick={() => setNewKey(true)}>Generate key</Button>}>
          <ApiKeyTable keys={p.apiKeys} onChange={reload} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <WebhookCard project={p} onChange={reload} />
        <UsageCard projectId={p.id} />
      </div>

      <div className="mt-6">
        <ProjectMessages projectId={p.id} />
      </div>

      <CreateApiKeyModal
        open={newKey}
        projectId={p.id}
        onClose={() => {
          setNewKey(false);
          void reload();
        }}
      />
      <EditProjectModal project={p} open={editing} onClose={() => setEditing(false)} onSaved={reload} />
    </>
  );
}

function ServiceCard({ project, onSaved }: { project: Detail; onSaved: () => void }) {
  const { can } = useAuth();
  const [priority, setPriority] = useState(project.service?.priorityInstanceId ?? '');
  const [fallback, setFallback] = useState(project.service?.fallbackInstanceId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPriority(project.service?.priorityInstanceId ?? '');
    setFallback(project.service?.fallbackInstanceId ?? '');
  }, [project.service]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(`/admin/projects/${project.id}/whatsapp-service`, { priorityInstanceId: priority, fallbackInstanceId: fallback || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const options = project.instances.filter((i) => i.isEnabled);
  return (
    <Card title="WhatsApp Service">
      <p className="mb-4 text-sm text-muted">
        Messages go through the priority instance. The fallback is used only when the priority instance definitely did not send the message.
      </p>
      <ErrorBox error={error} />
      {!project.instances.length ? (
        <p className="text-sm text-warning">Assign at least one instance to this project first.</p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <Field label="Priority instance">
            <Select required value={priority} disabled={!can('OPERATOR')} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Select</option>
              {options.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {providerLabel(i.provider)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fallback instance">
            <Select value={fallback} disabled={!can('OPERATOR')} onChange={(e) => setFallback(e.target.value)}>
              <option value="">None</option>
              {options
                .filter((i) => i.id !== priority)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {providerLabel(i.provider)}
                  </option>
                ))}
            </Select>
          </Field>
          {can('OPERATOR') && (
            <Button variant="primary" type="submit" busy={busy}>
              {saved ? 'Saved ✓' : 'Save'}
            </Button>
          )}
        </form>
      )}
    </Card>
  );
}

function AssignedInstancesCard({ project, onChange }: { project: Detail; onChange: () => void }) {
  const { can } = useAuth();
  const { data: all } = useApi<Instance[]>('/admin/instances');
  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const assigned = new Set(project.instances.map((i) => i.id));
  const role = (id: string) =>
    project.service?.priorityInstanceId === id ? 'PRIORITY' : project.service?.fallbackInstanceId === id ? 'FALLBACK' : null;

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
    <Card title="Assigned instances">
      <ErrorBox error={error} />
      <Table head={['Instance', 'Status', 'Health', 'Role', '']} empty={!project.instances.length}>
        {project.instances.map((i) => (
          <tr key={i.id}>
            <td>
              <Link to={`/instances/${i.id}`} className="font-medium text-accent">
                {i.name}
              </Link>
              <div className="text-xs text-muted">
                {providerLabel(i.provider)} {i.phoneNumber && `· ${i.phoneNumber}`}
              </div>
            </td>
            <td>
              <Badge>{i.status}</Badge>
            </td>
            <td>
              <Badge>{i.healthStatus}</Badge>
            </td>
            <td>{role(i.id) ? <Badge>{role(i.id)!}</Badge> : !i.isEnabled && <Badge tone="muted">Disabled</Badge>}</td>
            <td className="text-right">
              {can('OPERATOR') && (
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={() => run(() => api.patch(`/admin/projects/${project.id}/instances/${i.id}`, { isEnabled: !i.isEnabled }))}>
                    {i.isEnabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => confirm(`Remove ${i.name} from ${project.name}?`) && run(() => api.del(`/admin/projects/${project.id}/instances/${i.id}`))}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {can('OPERATOR') && (
        <div className="mt-4 flex gap-3">
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Assign an instance…</option>
            {all
              ?.filter((i) => !assigned.has(i.id))
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {providerLabel(i.provider)}
                </option>
              ))}
          </Select>
          <Button disabled={!pick} onClick={() => run(() => api.post(`/admin/projects/${project.id}/instances`, { instanceId: pick }).then(() => setPick('')))}>
            Assign
          </Button>
        </div>
      )}
    </Card>
  );
}

function WebhookCard({ project, onChange }: { project: Detail; onChange: () => void }) {
  const { can } = useAuth();
  const [url, setUrl] = useState(project.webhookUrl ?? '');
  const [secret, setSecret] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ secret?: string | null } | unknown>) {
    setError(null);
    setNote(null);
    try {
      const r = (await fn()) as { secret?: string | null };
      if (r?.secret) setSecret(r.secret);
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card title="Project webhook">
      <p className="mb-4 text-sm text-muted">
        Normalized events (message.sent, message.delivered, message.read, message.failed, message.unknown) are POSTed here, signed with
        HMAC-SHA256.
      </p>
      <ErrorBox error={error} />
      {note && <p className="mb-3 text-sm text-success">{note}</p>}
      <div className="space-y-3">
        <Field label="URL" hint={project.webhookSecretConfigured ? 'Signing secret configured.' : undefined}>
          <Input type="url" placeholder="https://app.example.com/hooks/whatsapp" value={url} disabled={!can('OPERATOR')} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        {can('OPERATOR') && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => run(() => api.put(`/admin/projects/${project.id}/webhook`, { url: url || null }))}>
              Save
            </Button>
            {project.webhookUrl && (
              <>
                <Button onClick={() => run(() => api.post(`/admin/projects/${project.id}/webhook/test`).then(() => setNote('Test event queued — see Webhooks › Deliveries.')))}>
                  Send test
                </Button>
                <Button onClick={() => confirm('Rotate the signing secret? The receiver must be updated.') && run(() => api.post(`/admin/projects/${project.id}/webhook/rotate-secret`))}>
                  Rotate secret
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      <Modal title="Webhook signing secret" open={!!secret} onClose={() => setSecret(null)}>
        {secret && <SecretReveal label="Use this to verify X-Vengurla-Signature." secret={secret} onDone={() => setSecret(null)} />}
      </Modal>
    </Card>
  );
}

function UsageCard({ projectId }: { projectId: string }) {
  const since = useMemo(() => new Date(Date.now() - 30 * 86_400_000).toISOString(), []);
  const all = useApi<Page<Message>>(`/admin/messages?projectId=${projectId}&from=${since}&pageSize=1`);
  const failed = useApi<Page<Message>>(`/admin/messages?projectId=${projectId}&from=${since}&status=FAILED&pageSize=1`);
  const unknown = useApi<Page<Message>>(`/admin/messages?projectId=${projectId}&from=${since}&status=UNKNOWN&pageSize=1`);
  return (
    <Card title="Usage (last 30 days)">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Messages" value={all.data?.total ?? '—'} />
        <Stat label="Failed" value={failed.data?.total ?? '—'} />
        <Stat label="Unknown" value={unknown.data?.total ?? '—'} />
      </div>
    </Card>
  );
}

function ProjectMessages({ projectId }: { projectId: string }) {
  const { data, reload } = useApi<Page<Message>>(`/admin/messages?projectId=${projectId}&pageSize=10`);
  const [open, setOpen] = useState<string | null>(null);
  useSocketEvent<{ projectId: string }>('message.status', (e) => e.projectId === projectId && void reload());
  return (
    <Card title="Recent messages" actions={<Link className="neu-btn neu-btn-sm" to={`/messages?projectId=${projectId}`}>View all</Link>}>
      <MessageTable items={data?.items ?? []} onOpen={setOpen} showProject={false} />
      <MessageDetailModal id={open} onClose={() => setOpen(null)} onChanged={reload} />
    </Card>
  );
}

function EditProjectModal({ project, open, onClose, onSaved }: { project: Project; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: project.name, description: project.description ?? '' });
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.patch(`/admin/projects/${project.id}`, { name: form.name, description: form.description || null });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <Modal title="Edit project" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Field label="Name">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Description">
          <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Button variant="primary" type="submit">
          Save
        </Button>
      </form>
    </Modal>
  );
}
