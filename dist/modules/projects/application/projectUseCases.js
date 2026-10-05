import { isDuplicateKey, withTransaction } from '../../../config/database.js';
import { badRequest, conflict, notFound } from '../../../shared/errors/AppError.js';
import { randomToken } from '../../../shared/utils/crypto.js';
import { secrets } from '../../../shared/utils/secrets.js';
import { listProjectApiKeys } from '../../api-keys/infrastructure/apiKeyRepository.js';
import { audit } from '../../audit/application/audit.js';
import { listProjectInstances } from '../../whatsapp-instances/infrastructure/assignmentRepository.js';
import { findService } from '../../whatsapp-service/infrastructure/serviceRepository.js';
import { slugify } from '../domain/project.js';
import * as repo from '../infrastructure/projectRepository.js';
export async function requireProject(id) {
    const project = await repo.findProject(id);
    if (!project)
        throw notFound('Project');
    return project;
}
/** Never returns secrets: the webhook secret is only exposed when generated. */
function present(p) {
    const { webhookSecretEnc, ...rest } = p;
    return { ...rest, webhookSecretConfigured: !!webhookSecretEnc };
}
export async function getProjectDetail(id) {
    const project = await requireProject(id);
    const [apiKeys, instances, service] = await Promise.all([listProjectApiKeys(id), listProjectInstances(id), findService(id)]);
    return { ...present(project), apiKeys, instances, service };
}
export async function createProject(actor, input) {
    const slug = input.slug ?? slugify(input.name);
    if (!slug)
        throw badRequest('INVALID_SLUG', 'Could not derive a slug from the name; provide one');
    try {
        const id = await repo.insertProject({ ...input, slug });
        await audit(actor, 'project.created', 'project', id, { name: input.name, slug });
        return present((await repo.findProject(id)));
    }
    catch (err) {
        if (isDuplicateKey(err))
            throw conflict('SLUG_TAKEN', `A project with slug "${slug}" already exists`);
        throw err;
    }
}
export async function updateProject(actor, id, changes) {
    const before = await requireProject(id);
    await repo.updateProject(id, changes);
    const action = changes.status && changes.status !== before.status
        ? changes.status === 'ACTIVE'
            ? 'project.activated'
            : 'project.deactivated'
        : 'project.updated';
    await audit(actor, action, 'project', id, changes);
    return present((await repo.findProject(id)));
}
export async function deleteProject(actor, id) {
    await requireProject(id);
    await withTransaction((tx) => repo.softDeleteProject(id, tx));
    await audit(actor, 'project.deleted', 'project', id);
}
/** Sets or clears the project webhook. A signing secret is generated the first time and returned once. */
export async function configureWebhook(actor, id, url) {
    const project = await requireProject(id);
    if (!url) {
        await repo.setProjectWebhook(id, null, null);
        await audit(actor, 'project.webhook_removed', 'project', id);
        return { url: null, secret: null };
    }
    const newSecret = project.webhookSecretEnc ? null : `whsec_${randomToken(32)}`;
    await repo.setProjectWebhook(id, url, newSecret ? secrets.encrypt(newSecret) : project.webhookSecretEnc);
    await audit(actor, 'project.webhook_configured', 'project', id, { url });
    return { url, secret: newSecret };
}
export async function rotateWebhookSecret(actor, id) {
    const project = await requireProject(id);
    if (!project.webhookUrl)
        throw badRequest('WEBHOOK_NOT_CONFIGURED', 'Configure a webhook URL first');
    const secret = `whsec_${randomToken(32)}`;
    await repo.setProjectWebhook(id, project.webhookUrl, secrets.encrypt(secret));
    await audit(actor, 'project.webhook_secret_rotated', 'project', id);
    return { url: project.webhookUrl, secret };
}
//# sourceMappingURL=projectUseCases.js.map