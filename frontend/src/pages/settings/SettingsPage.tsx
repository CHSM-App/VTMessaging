import { type FormEvent, useState } from 'react';
import { useAuth } from '../../app/providers';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Table } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { API_URL, api } from '../../services/api/client';
import type { Role, User } from '../../types';
import { errorMessage, fmtRelative } from '../../utils/format';

export function SettingsPage() {
  const { can } = useAuth();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 xl:grid-cols-2">
        <ChangePassword />
        <Card title="Platform">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">API base URL</dt>
              <dd className="font-mono">{API_URL}/api/v1</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">API documentation</dt>
              <dd>
                <a className="text-accent" href={`${API_URL}/api/docs`} target="_blank" rel="noreferrer">
                  Swagger / OpenAPI
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Health</dt>
              <dd>
                <a className="text-accent" href={`${API_URL}/health`} target="_blank" rel="noreferrer">
                  /health
                </a>
              </dd>
            </div>
          </dl>
        </Card>
      </div>
      {can('ADMIN') && (
        <div className="mt-6">
          <Users />
        </div>
      )}
    </>
  );
}

function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/auth/change-password', form);
      setMsg('Password changed.');
      setForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <Card title="Change password">
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        {msg && <p className="text-sm text-success">{msg}</p>}
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        </Field>
        <Field label="New password" hint="At least 10 characters.">
          <Input type="password" autoComplete="new-password" minLength={10} required value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
        </Field>
        <Button variant="primary" type="submit">
          Change password
        </Button>
      </form>
    </Card>
  );
}

function Users() {
  const { user: me } = useAuth();
  const { data, error, reload } = useApi<User[]>('/admin/users');
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const update = (u: User, changes: Partial<User>) =>
    api.patch(`/admin/users/${u.id}`, changes).then(
      () => reload(),
      (e) => setActionError(errorMessage(e)),
    );

  return (
    <Card title="Dashboard users" actions={<Button onClick={() => setAdding(true)}>Add user</Button>}>
      <p className="mb-4 text-sm text-muted">ADMIN: full access · OPERATOR: manage messaging resources · VIEWER: read-only</p>
      <ErrorBox error={error ?? actionError} />
      <Table head={['User', 'Role', 'Status', 'Last login', '']} empty={!data?.length}>
        {data?.map((u) => (
          <tr key={u.id}>
            <td>
              <div className="font-medium text-heading">{u.name}</div>
              <div className="text-xs text-muted">{u.email}</div>
            </td>
            <td>
              <Select value={u.role} disabled={u.id === me?.id} onChange={(e) => update(u, { role: e.target.value as Role })} className="!min-h-8 !py-1">
                <option>ADMIN</option>
                <option>OPERATOR</option>
                <option>VIEWER</option>
              </Select>
            </td>
            <td>{u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Disabled</Badge>}</td>
            <td className="text-muted">{fmtRelative(u.lastLoginAt)}</td>
            <td className="text-right">
              {u.id !== me?.id && (
                <Button size="sm" onClick={() => update(u, { isActive: !u.isActive })}>
                  {u.isActive ? 'Disable' : 'Enable'}
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {adding && <AddUser onClose={() => setAdding(false)} onSaved={reload} />}
    </Card>
  );
}

function AddUser({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ email: '', name: '', role: 'OPERATOR' as Role, password: '' });
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/admin/users', form);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <Modal title="Add dashboard user" open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Field label="Name">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Role">
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option>ADMIN</option>
            <option>OPERATOR</option>
            <option>VIEWER</option>
          </Select>
        </Field>
        <Field label="Initial password" hint="At least 10 characters. Ask the user to change it.">
          <Input type="password" autoComplete="new-password" minLength={10} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Button variant="primary" type="submit">
          Create user
        </Button>
      </form>
    </Modal>
  );
}
