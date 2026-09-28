import { type FormEvent, useState } from 'react';
import { Button, ErrorBox, Field, Input, Modal, SecretReveal, Select } from '../../components/ui';
import { api } from '../../services/api/client';
import type { Project } from '../../types';
import { errorMessage } from '../../utils/format';

export function CreateApiKeyModal({
  open,
  onClose,
  projectId,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  projects?: Project[];
}) {
  const [form, setForm] = useState({ projectId: projectId ?? '', name: '', expiresAt: '' });
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setSecret(null);
    setError(null);
    setForm({ projectId: projectId ?? '', name: '', expiresAt: '' });
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post<{ key: string }>(`/admin/projects/${projectId ?? form.projectId}/api-keys`, {
        name: form.name,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      });
      setSecret(r.key);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Generate API key" open={open} onClose={close}>
      {secret ? (
        <SecretReveal label="Give this key to the application." secret={secret} onDone={close} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox error={error} />
          {!projectId && (
            <Field label="Project">
              <Select required value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                <option value="">Select a project</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Name" hint="Where the key is used, e.g. “Vittam production”.">
            <Input required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Expires (optional)">
            <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </Field>
          <Button variant="primary" type="submit" busy={busy}>
            Generate
          </Button>
        </form>
      )}
    </Modal>
  );
}
