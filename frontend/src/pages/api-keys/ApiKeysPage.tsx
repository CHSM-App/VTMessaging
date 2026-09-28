import { useState } from 'react';
import { useAuth } from '../../app/providers';
import { Button, Card, ErrorBox, Loading, PageHeader } from '../../components/ui';
import { ApiKeyTable } from '../../features/api-keys/ApiKeyTable';
import { CreateApiKeyModal } from '../../features/api-keys/CreateApiKeyModal';
import { useApi } from '../../hooks/useApi';
import type { ApiKey, Project } from '../../types';

export function ApiKeysPage() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<ApiKey[]>('/admin/api-keys');
  const { data: projects } = useApi<Project[]>('/admin/projects');
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="API Keys"
        subtitle="Applications authenticate with a project API key. Only a hash is stored; the full key is shown once."
        actions={can('OPERATOR') && <Button variant="primary" onClick={() => setCreating(true)}>Generate key</Button>}
      />
      <ErrorBox error={error} />
      <Card>{loading && !data ? <Loading /> : <ApiKeyTable keys={data ?? []} onChange={reload} showProject />}</Card>
      <CreateApiKeyModal
        open={creating}
        projects={projects ?? []}
        onClose={() => {
          setCreating(false);
          void reload();
        }}
      />
    </>
  );
}
