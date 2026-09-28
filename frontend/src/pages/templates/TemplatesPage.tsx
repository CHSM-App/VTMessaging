import { type FormEvent, useState } from 'react';
import { useAuth } from '../../app/providers';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Textarea } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { api, qs } from '../../services/api/client';
import type { Instance, Project, Template } from '../../types';
import { errorMessage, fmtRelative } from '../../utils/format';

export function TemplatesPage() {
  const { can } = useAuth();
  const [projectId, setProjectId] = useState('');
  const { data: projects } = useApi<Project[]>('/admin/projects');
  const { data, error, loading, reload } = useApi<Template[]>(`/admin/templates${qs({ projectId })}`);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [submitting, setSubmitting] = useState<Template | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setActionError(null);
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="Meta message templates. Meta decides approval; Baileys sends the rendered text and needs no approval."
        actions={
          can('OPERATOR') && (
            <>
              <Button busy={busy} onClick={() => run(() => api.post('/admin/templates/sync'))}>
                Sync all with Meta
              </Button>
              <Button variant="primary" onClick={() => setEditing('new')}>
                New template
              </Button>
            </>
          )
        }
      />
      <ErrorBox error={error ?? actionError} />
      <Card>
        <div className="mb-5 max-w-xs">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
            <option value="">All projects</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <Table head={['Template', 'Project', 'Category', 'Status', 'Updated', '']} empty={!data?.length}>
            {data?.map((t) => (
              <tr key={t.id}>
                <td>
                  <div className="font-mono text-sm text-heading">{t.name}</div>
                  <div className="text-xs text-muted">{t.language}</div>
                  <div className="mt-1 max-w-md truncate text-xs" title={t.body}>
                    {t.body}
                  </div>
                </td>
                <td>{t.projectName}</td>
                <td className="text-xs">{t.category}</td>
                <td>
                  <Badge>{t.status}</Badge>
                  {t.rejectionReason && <div className="mt-1 text-xs text-danger">{t.rejectionReason}</div>}
                </td>
                <td className="text-muted">{fmtRelative(t.updatedAt)}</td>
                <td className="text-right">
                  {can('OPERATOR') && (
                    <div className="flex justify-end gap-2">
                      {(t.status === 'DRAFT' || t.status === 'REJECTED') && (
                        <>
                          <Button size="sm" onClick={() => setEditing(t)}>
                            Edit
                          </Button>
                          <Button size="sm" onClick={() => setSubmitting(t)}>
                            Submit
                          </Button>
                        </>
                      )}
                      {t.providerTemplateId && (
                        <Button size="sm" onClick={() => run(() => api.post(`/admin/templates/${t.id}/sync`))}>
                          Sync
                        </Button>
                      )}
                      <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${t.name}?`) && run(() => api.del(`/admin/templates/${t.id}`))}>
                        Delete
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {editing && (
        <TemplateForm
          template={editing === 'new' ? null : editing}
          projects={projects ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
      {submitting && (
        <SubmitModal
          template={submitting}
          onClose={() => setSubmitting(null)}
          onDone={() => {
            setSubmitting(null);
            void reload();
          }}
        />
      )}
    </>
  );
}

type ButtonRow = { type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; value: string };

function TemplateForm({ template, projects, onClose, onSaved }: { template: Template | null; projects: Project[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    projectId: template?.projectId ?? '',
    name: template?.name ?? '',
    category: template?.category ?? 'UTILITY',
    language: template?.language ?? 'en',
    header: template?.header ?? '',
    body: template?.body ?? '',
    footer: template?.footer ?? '',
    variables: template?.variables.join('\n') ?? '',
  });
  const [buttons, setButtons] = useState<ButtonRow[]>(
    template?.buttons.map((b) => ({ type: b.type as ButtonRow['type'], text: b.text, value: b.url ?? b.phone_number ?? '' })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const placeholders = new Set(form.body.match(/\{\{\s*\d+\s*\}\}/g) ?? []).size;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      ...(template ? {} : { projectId: form.projectId }),
      name: form.name,
      category: form.category,
      language: form.language,
      header: form.header || null,
      body: form.body,
      footer: form.footer || null,
      variables: form.variables.split('\n').map((v) => v.trim()).filter(Boolean),
      buttons: buttons.map((b) =>
        b.type === 'URL' ? { type: b.type, text: b.text, url: b.value } : b.type === 'PHONE_NUMBER' ? { type: b.type, text: b.text, phone_number: b.value } : { type: b.type, text: b.text },
      ),
    };
    try {
      if (template) await api.put(`/admin/templates/${template.id}`, body);
      else await api.post('/admin/templates', body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const f = (k: keyof typeof form) => ({ value: form[k], onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <Modal title={template ? `Edit ${template.name}` : 'New template'} open onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          {!template && (
            <Field label="Project">
              <Select required {...f('projectId')}>
                <option value="">Select</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Name" hint="lowercase_with_underscores">
            <Input required pattern="[a-z0-9_]+" {...f('name')} />
          </Field>
          <Field label="Category">
            <Select {...f('category')}>
              <option>UTILITY</option>
              <option>MARKETING</option>
              <option>AUTHENTICATION</option>
            </Select>
          </Field>
          <Field label="Language" hint="e.g. en, en_US, mr, hi">
            <Input required {...f('language')} />
          </Field>
        </div>
        <Field label="Header (optional)">
          <Input maxLength={60} {...f('header')} />
        </Field>
        <Field label="Body" hint="Use {{1}}, {{2}} … for variables.">
          <Textarea required rows={4} maxLength={1024} {...f('body')} />
        </Field>
        <Field label="Footer (optional)">
          <Input maxLength={60} {...f('footer')} />
        </Field>
        <Field label={`Example values (${placeholders} needed, one per line)`} hint="Meta requires examples for review.">
          <Textarea rows={Math.max(2, placeholders)} {...f('variables')} />
        </Field>
        <div>
          <div className="mb-2 text-sm font-medium text-heading">Buttons</div>
          {buttons.map((b, i) => (
            <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[10rem_1fr_1fr_auto]">
              <Select value={b.type} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, type: e.target.value as ButtonRow['type'] } : x)))}>
                <option value="QUICK_REPLY">Quick reply</option>
                <option value="URL">URL</option>
                <option value="PHONE_NUMBER">Phone</option>
              </Select>
              <Input placeholder="Text" maxLength={25} value={b.text} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              <Input
                placeholder={b.type === 'URL' ? 'https://…' : b.type === 'PHONE_NUMBER' ? '+91…' : '—'}
                disabled={b.type === 'QUICK_REPLY'}
                value={b.value}
                onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              />
              <Button type="button" size="sm" onClick={() => setButtons(buttons.filter((_, j) => j !== i))} aria-label="Remove button">
                ✕
              </Button>
            </div>
          ))}
          {buttons.length < 10 && (
            <Button type="button" size="sm" onClick={() => setButtons([...buttons, { type: 'QUICK_REPLY', text: '', value: '' }])}>
              Add button
            </Button>
          )}
        </div>
        <Button variant="primary" type="submit">
          Save draft
        </Button>
      </form>
    </Modal>
  );
}

function SubmitModal({ template, onClose, onDone }: { template: Template; onClose: () => void; onDone: () => void }) {
  const { data: instances } = useApi<Instance[]>('/admin/instances');
  const metas = instances?.filter((i) => i.provider === 'META_CLOUD' && i.projects.some((p) => p.id === template.projectId)) ?? [];
  const [instanceId, setInstanceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.post(`/admin/templates/${template.id}/submit`, { instanceId });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Submit ${template.name} to Meta`} open onClose={onClose}>
      <ErrorBox error={error} />
      {instances && !metas.length ? (
        <p className="text-sm text-warning">Assign a Meta Cloud API instance to {template.projectName} first.</p>
      ) : (
        <div className="space-y-4">
          <Field label="Meta instance (WABA)">
            <Select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
              <option value="">Select</option>
              {metas.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.status})
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" disabled={!instanceId} busy={busy} onClick={submit}>
            Submit for review
          </Button>
        </div>
      )}
    </Modal>
  );
}
