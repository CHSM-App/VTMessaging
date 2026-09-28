import { Navigate, Route, Routes } from 'react-router-dom';
import { Loading } from '../components/ui';
import { AdminLayout } from '../layouts/AdminLayout';
import { ApiKeysPage } from '../pages/api-keys/ApiKeysPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { InstanceDetailPage } from '../pages/instances/InstanceDetailPage';
import { InstancesPage } from '../pages/instances/InstancesPage';
import { LogsPage } from '../pages/logs/LogsPage';
import { MessagesPage } from '../pages/messages/MessagesPage';
import { ProjectDetailPage } from '../pages/projects/ProjectDetailPage';
import { ProjectsPage } from '../pages/projects/ProjectsPage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { TemplatesPage } from '../pages/templates/TemplatesPage';
import { WebhooksPage } from '../pages/webhooks/WebhooksPage';
import { useAuth } from './providers';

export function AppRoutes() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="instances" element={<InstancesPage />} />
        <Route path="instances/:id" element={<InstanceDetailPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
