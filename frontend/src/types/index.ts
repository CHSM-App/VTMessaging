export type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER';
export type Provider = 'BAILEYS' | 'META_CLOUD';
export type Health = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive?: boolean;
  lastLoginAt?: string | null;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  webhookUrl?: string | null;
  webhookSecretConfigured?: boolean;
  activeApiKeys?: number;
  instanceCount?: number;
  serviceConfigured?: boolean;
  messages24h?: number;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  projectId: string;
  projectName?: string;
  name: string;
  keyPrefix: string;
  status: 'ACTIVE' | 'REVOKED';
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface Instance {
  id: string;
  name: string;
  provider: Provider;
  phoneNumber: string | null;
  status: string;
  statusDetail: string | null;
  healthStatus: Health;
  lastActivityAt: string | null;
  createdAt: string;
  config: { wabaId?: string; phoneNumberId?: string; appId?: string; accessTokenConfigured?: boolean; webhookVerifiedAt?: string | null };
  projects: { id?: string; projectId?: string; name?: string; projectName?: string; isEnabled: boolean; serviceRole: 'PRIORITY' | 'FALLBACK' | null }[];
}

export interface AssignedInstance {
  id: string;
  name: string;
  provider: Provider;
  phoneNumber: string | null;
  status: string;
  healthStatus: Health;
  isEnabled: boolean;
  lastActivityAt: string | null;
}

export interface Service {
  priorityInstanceId: string;
  priorityInstanceName: string;
  priorityProvider: Provider;
  fallbackInstanceId: string | null;
  fallbackInstanceName: string | null;
  fallbackProvider: Provider | null;
  updatedAt: string;
}

export interface Message {
  id: string;
  projectId: string;
  projectName: string;
  instanceId: string | null;
  instanceName: string | null;
  provider: Provider | null;
  recipient: string;
  messageType: string;
  status: string;
  idempotencyKey: string | null;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
}

export interface Attempt {
  id: string;
  attemptNumber: number;
  instanceName: string;
  provider: Provider;
  status: string;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface Template {
  id: string;
  projectId: string;
  projectName: string;
  instanceId: string | null;
  name: string;
  category: string;
  language: string;
  header: string | null;
  body: string;
  footer: string | null;
  variables: string[];
  buttons: { type: string; text: string; url?: string; phone_number?: string }[];
  providerTemplateId: string | null;
  status: string;
  rejectionReason: string | null;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
