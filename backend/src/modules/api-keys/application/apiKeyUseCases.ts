import { withTransaction } from '../../../config/database.js';
import { logger } from '../../../config/logger.js';
import { AppError, badRequest, notFound, unauthorized } from '../../../shared/errors/AppError.js';
import { safeEqual } from '../../../shared/utils/crypto.js';
import { type Actor, audit } from '../../audit/application/audit.js';
import { requireProject } from '../../projects/application/projectUseCases.js';
import { type ProjectPrincipal, generateApiKey, parseApiKey } from '../domain/apiKey.js';
import * as repo from '../infrastructure/apiKeyRepository.js';

/** The full key is returned only here, at creation. */
export async function createApiKey(actor: Actor, projectId: string, input: { name: string; expiresAt?: Date | null }) {
  await requireProject(projectId);
  if (input.expiresAt && input.expiresAt <= new Date()) throw badRequest('INVALID_EXPIRY', 'expiresAt must be in the future');
  const k = generateApiKey();
  const id = await repo.insertApiKey({ projectId, name: input.name, prefix: k.prefix, hash: k.hash, expiresAt: input.expiresAt ?? null });
  await audit(actor, 'api_key.created', 'api_key', id, { projectId, name: input.name, prefix: k.prefix });
  return { id, name: input.name, keyPrefix: k.prefix, key: k.key, expiresAt: input.expiresAt ?? null };
}

export async function revokeApiKey(actor: Actor, id: string) {
  const key = await repo.findApiKey(id);
  if (!key) throw notFound('API key');
  await repo.revokeApiKey(id);
  await audit(actor, 'api_key.revoked', 'api_key', id, { projectId: key.projectId });
}

/** Issues a replacement key (same name/expiry) and revokes the old one atomically. */
export async function rotateApiKey(actor: Actor, id: string) {
  const old = await repo.findApiKey(id);
  if (!old) throw notFound('API key');
  if (old.status !== 'ACTIVE') throw badRequest('KEY_NOT_ACTIVE', 'Only active keys can be rotated');
  const k = generateApiKey();
  const expiresAt = old.expiresAt && old.expiresAt > new Date() ? old.expiresAt : null;
  const newId = await withTransaction(async (tx) => {
    const created = await repo.insertApiKey({ projectId: old.projectId, name: old.name, prefix: k.prefix, hash: k.hash, expiresAt }, tx);
    await repo.revokeApiKey(id, tx);
    return created;
  });
  await audit(actor, 'api_key.rotated', 'api_key', newId, { projectId: old.projectId, replaced: id });
  return { id: newId, name: old.name, keyPrefix: k.prefix, key: k.key, expiresAt };
}

/** Resolves an API key to its project. The project id is never taken from the client. */
export async function authenticateApiKey(key: string): Promise<ProjectPrincipal> {
  const parsed = parseApiKey(key);
  const row = parsed ? await repo.findKeyForAuth(parsed.prefix) : null;
  if (!parsed || !row || !safeEqual(row.keyHash, parsed.hash)) throw unauthorized('Invalid API key');
  if (row.status !== 'ACTIVE') throw unauthorized('API key has been revoked');
  if (row.expiresAt && row.expiresAt <= new Date()) throw unauthorized('API key has expired');
  if (row.projectStatus !== 'ACTIVE') throw new AppError(403, 'PROJECT_INACTIVE', 'Project is inactive');

  repo.touchApiKey(row.id).catch((err) => logger.warn({ err }, 'Could not update api key last_used_at'));
  return { id: row.projectId, name: row.projectName, slug: row.projectSlug, apiKeyId: row.id };
}
