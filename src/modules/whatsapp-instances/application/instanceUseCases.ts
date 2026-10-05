import { isDuplicateKey, withTransaction } from '../../../config/database.js';
import type { ProviderType } from '../../../providers/whatsapp/contracts/types.js';
import { enqueueInstanceAction } from '../../../queue/queues.js';
import { getQr as cachedQr } from '../../../realtime/events.js';
import { AppError, badRequest, conflict, notFound } from '../../../shared/errors/AppError.js';
import { secrets } from '../../../shared/utils/secrets.js';
import { type Actor, audit } from '../../audit/application/audit.js';
import { requireProject } from '../../projects/application/projectUseCases.js';
import { findService } from '../../whatsapp-service/infrastructure/serviceRepository.js';
import { type MetaStoredConfig, initialStatus, publicConfig } from '../domain/instance.js';
import * as assignments from '../infrastructure/assignmentRepository.js';
import * as repo from '../infrastructure/instanceRepository.js';

export interface MetaConfigInput {
  wabaId: string;
  phoneNumberId: string;
  accessToken?: string;
  appId?: string;
}

const present = <T extends { provider: ProviderType; providerConfig: Record<string, any> }>(i: T) => {
  const { providerConfig, ...rest } = i;
  return { ...rest, config: publicConfig(i.provider, providerConfig) };
};

export async function requireInstance(id: string) {
  const instance = await repo.findInstance(id);
  if (!instance) throw notFound('WhatsApp instance');
  return instance;
}

export async function listInstances() {
  return (await repo.listInstances()).map(present);
}

export async function getInstance(id: string) {
  const instance = await requireInstance(id);
  return { ...present(instance), projects: await repo.findInstanceImpact(id) };
}

export async function createInstance(actor: Actor, input: { name: string; provider: ProviderType; meta?: MetaConfigInput }) {
  let config: object = {};
  if (input.provider === 'META_CLOUD') {
    if (!input.meta?.accessToken) throw badRequest('META_CONFIG_REQUIRED', 'Meta instances need wabaId, phoneNumberId and accessToken');
    config = {
      wabaId: input.meta.wabaId,
      phoneNumberId: input.meta.phoneNumberId,
      appId: input.meta.appId,
      accessTokenEnc: secrets.encrypt(input.meta.accessToken),
      webhookVerifiedAt: null,
    } satisfies MetaStoredConfig;
  }
  const id = await repo.insertInstance({ name: input.name, provider: input.provider, status: initialStatus(input.provider), config });
  await audit(actor, 'instance.created', 'whatsapp_instance', id, { name: input.name, provider: input.provider });
  // Meta: validate right away (never marked READY without Meta confirming). Baileys: operator clicks Connect to pair.
  if (input.provider === 'META_CLOUD') await enqueueInstanceAction(id, 'connect');
  return present((await repo.findInstance(id))!);
}

export async function updateInstance(actor: Actor, id: string, input: { name?: string; meta?: Partial<MetaConfigInput> }) {
  const instance = await requireInstance(id);
  let config: MetaStoredConfig | undefined;
  if (input.meta) {
    if (instance.provider !== 'META_CLOUD') throw badRequest('NOT_META_INSTANCE', 'Only Meta instances have provider configuration');
    const current = instance.providerConfig as MetaStoredConfig;
    config = {
      ...current,
      wabaId: input.meta.wabaId ?? current.wabaId,
      phoneNumberId: input.meta.phoneNumberId ?? current.phoneNumberId,
      appId: input.meta.appId ?? current.appId,
      accessTokenEnc: input.meta.accessToken ? secrets.encrypt(input.meta.accessToken) : current.accessTokenEnc,
    };
  }
  await repo.updateInstance(id, { name: input.name, config });
  await audit(actor, 'instance.updated', 'whatsapp_instance', id, {
    name: input.name,
    metaFieldsChanged: input.meta ? Object.keys(input.meta).filter((k) => k !== 'accessToken') : undefined,
    accessTokenChanged: !!input.meta?.accessToken,
  });
  if (config) await enqueueInstanceAction(id, 'reload'); // re-validate with the new credentials
  return present((await repo.findInstance(id))!);
}

export async function getDeletionImpact(id: string) {
  await requireInstance(id);
  const projects = await repo.findInstanceImpact(id);
  return {
    projects,
    priorityFor: projects.filter((p) => p.serviceRole === 'PRIORITY').map((p) => p.projectName),
    fallbackFor: projects.filter((p) => p.serviceRole === 'FALLBACK').map((p) => p.projectName),
    requiresConfirmation: projects.length > 0,
  };
}

/** Never silently deletes an instance that projects depend on: the caller must confirm after seeing the impact. */
export async function deleteInstance(actor: Actor, id: string, confirmed: boolean) {
  const impact = await getDeletionImpact(id);
  if (impact.requiresConfirmation && !confirmed) {
    throw new AppError(409, 'CONFIRMATION_REQUIRED', 'Instance is assigned to projects; confirm to delete', impact);
  }
  await withTransaction((tx) => repo.deleteInstance(id, tx));
  await audit(actor, 'instance.deleted', 'whatsapp_instance', id, impact);
  for (const p of impact.projects) {
    await audit(actor, 'instance.removed', 'project', p.projectId, { instanceId: id, serviceRole: p.serviceRole });
  }
  await enqueueInstanceAction(id, 'remove');
  return impact;
}

export async function controlInstance(actor: Actor, id: string, action: 'connect' | 'disconnect' | 'logout') {
  const instance = await requireInstance(id);
  if (action === 'logout' && instance.provider !== 'BAILEYS') throw badRequest('NOT_SUPPORTED', 'Only Baileys instances can be logged out');
  await enqueueInstanceAction(id, action);
  await audit(actor, `instance.${action}_requested`, 'whatsapp_instance', id);
  return { accepted: true, action };
}

export async function getQr(id: string) {
  await requireInstance(id);
  return { qr: await cachedQr(id) };
}

// --- project <-> instance assignment ------------------------------------------------------------

export async function assignInstance(actor: Actor, projectId: string, instanceId: string) {
  await requireProject(projectId);
  await requireInstance(instanceId);
  try {
    await assignments.insertAssignment(projectId, instanceId);
  } catch (err) {
    if (isDuplicateKey(err)) throw conflict('ALREADY_ASSIGNED', 'Instance is already assigned to this project');
    throw err;
  }
  await audit(actor, 'instance.assigned', 'project', projectId, { instanceId });
}

export async function unassignInstance(actor: Actor, projectId: string, instanceId: string) {
  if (!(await assignments.findAssignment(projectId, instanceId))) throw notFound('Assignment');
  const service = await findService(projectId);
  if (service && (service.priorityInstanceId === instanceId || service.fallbackInstanceId === instanceId)) {
    const role = service.priorityInstanceId === instanceId ? 'priority' : 'fallback';
    throw conflict('INSTANCE_IN_USE', `Instance is this project's ${role} instance; change the WhatsApp Service first`);
  }
  await assignments.deleteAssignment(projectId, instanceId);
  await audit(actor, 'instance.removed', 'project', projectId, { instanceId });
}

export async function setAssignmentEnabled(actor: Actor, projectId: string, instanceId: string, enabled: boolean) {
  if (!(await assignments.findAssignment(projectId, instanceId))) throw notFound('Assignment');
  await assignments.setAssignmentEnabled(projectId, instanceId, enabled);
  await audit(actor, enabled ? 'instance.assignment_enabled' : 'instance.assignment_disabled', 'project', projectId, { instanceId });
}
