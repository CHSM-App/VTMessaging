import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Table, Textarea } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { api } from '../../services/api/client';
import type { Project } from '../../types';
import { errorMessage } from '../../utils/format';

export function ProjectsPage() {
  const { can } = useAuth();
  const { data, error, loading } = useApi<Project[]>('/admin/projects');
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Vengurla Tech applications that send WhatsApp messages through the platform"
        actions={can('OPERATOR') && <Button variant="primary" onClick={() => setCreating(true)}>New project</Button>}
      />
      <ErrorBox error={error} />
      <Card>
        {loading && !data ? (
          <Loading />
        ) : (
          <Table head={['Project', 'Slug', 'Status', 'API keys', 'Instances', 'Service', 'Messages (24h)']} empty={!data?.length}>
            {data?.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link className="font-medium text-accent" to={`/projects/${p.id}`}>
                    {p.name}
                  </Link>
                  {p.description && <div className="text-xs text-muted">{p.description}</div>}
                </td>
                <td className="font-mono text-xs">{p.slug}</td>
                <td>
                  <Badge>{p.status}</Badge>
                </td>
                <td className="tabular-nums">{p.activeApiKeys}</td>
                <td className="tabular-nums">{p.instanceCount}</td>
                <td>{p.serviceConfigured ? <Badge tone="success">Configured</Badge> : <Badge tone="warning">Not configured</Badge>}</td>
                <td className="tabular-nums">{p.messages24h}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <CreateProjectModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', slug: '', description: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api.post<Project>('/admin/projects', {
        name: form.name,
        slug: form.slug || undefined,
        description: form.description || null,
      });
      navigate(`/projects/${p.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New project" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Field label="Name">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vittam" />
        </Field>
        <Field label="Slug" hint="Optional. Lowercase letters, numbers and dashes. Generated from the name if empty.">
          <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="vittam" />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Button variant="primary" type="submit" busy={busy}>
          Create project
        </Button>
      </form>
    </Modal>
  );
}
