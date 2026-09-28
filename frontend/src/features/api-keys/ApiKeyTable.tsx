import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/providers';
import { Badge, Button, ErrorBox, Modal, SecretReveal, Table } from '../../components/ui';
import { api } from '../../services/api/client';
import type { ApiKey } from '../../types';
import { errorMessage, fmtDate, fmtRelative } from '../../utils/format';

/** Key list with revoke/rotate. Rotation shows the new secret once. */
export function ApiKeyTable({ keys, onChange, showProject }: { keys: ApiKey[]; onChange: () => void; showProject?: boolean }) {
  const { can } = useAuth();
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(k: ApiKey, action: 'revoke' | 'rotate') {
    const verb = action === 'revoke' ? 'Revoke' : 'Rotate';
    if (!confirm(`${verb} "${k.name}" (${k.keyPrefix})? Applications using it will stop working${action === 'rotate' ? ' until they use the new key' : ''}.`)) return;
    try {
      const r = await api.post<{ key?: string }>(`/admin/api-keys/${k.id}/${action}`);
      if (r.key) setSecret(r.key);
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <ErrorBox error={error} />
      <Table head={[...(showProject ? ['Project'] : []), 'Name', 'Prefix', 'Status', 'Created', 'Last used', 'Expires', '']} empty={!keys.length}>
        {keys.map((k) => (
          <tr key={k.id}>
            {showProject && (
              <td>
                <Link className="text-accent" to={`/projects/${k.projectId}`}>
                  {k.projectName}
                </Link>
              </td>
            )}
            <td className="font-medium text-heading">{k.name}</td>
            <td className="font-mono text-xs">{k.keyPrefix}…</td>
            <td>
              <Badge>{k.status}</Badge>
            </td>
            <td className="text-muted">{fmtDate(k.createdAt)}</td>
            <td className="text-muted">{fmtRelative(k.lastUsedAt)}</td>
            <td className="text-muted">{k.expiresAt ? fmtDate(k.expiresAt) : 'never'}</td>
            <td className="text-right">
              {can('OPERATOR') && k.status === 'ACTIVE' && (
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={() => act(k, 'rotate')}>
                    Rotate
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => act(k, 'revoke')}>
                    Revoke
                  </Button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <Modal title="New API key" open={!!secret} onClose={() => setSecret(null)}>
        {secret && <SecretReveal label="This is the full API key." secret={secret} onDone={() => setSecret(null)} />}
      </Modal>
    </>
  );
}
