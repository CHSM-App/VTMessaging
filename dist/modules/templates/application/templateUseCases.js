import { isDuplicateKey } from '../../../config/database.js';
import { toProviderError } from '../../../providers/whatsapp/contracts/errors.js';
import { createMetaClient } from '../../../providers/whatsapp/registry.js';
import { AppError, badRequest, conflict, notFound } from '../../../shared/errors/AppError.js';
import { SYSTEM, audit } from '../../audit/application/audit.js';
import { countPlaceholders } from '../../messaging/domain/message.js';
import { requireProject } from '../../projects/application/projectUseCases.js';
import { findAssignment } from '../../whatsapp-instances/infrastructure/assignmentRepository.js';
import { findInstance } from '../../whatsapp-instances/infrastructure/instanceRepository.js';
import { isEditable, mapMetaTemplateStatus, toMetaTemplatePayload } from '../domain/template.js';
import * as repo from '../infrastructure/templateRepository.js';
function checkVariables(t) {
    const expected = countPlaceholders(t.body);
    if (expected !== t.variables.length) {
        throw badRequest('TEMPLATE_VARIABLES_MISMATCH', `Body uses ${expected} variables; provide exactly ${expected} example values`);
    }
}
export async function requireTemplate(id) {
    const t = await repo.findTemplate(id);
    if (!t)
        throw notFound('Template');
    return t;
}
export async function createTemplate(actor, projectId, t) {
    await requireProject(projectId);
    checkVariables(t);
    try {
        const id = await repo.insertTemplate(projectId, t);
        await audit(actor, 'template.created', 'template', id, { projectId, name: t.name, language: t.language });
        return repo.findTemplate(id);
    }
    catch (err) {
        if (isDuplicateKey(err))
            throw conflict('TEMPLATE_EXISTS', `Template ${t.name} (${t.language}) already exists for this project`);
        throw err;
    }
}
export async function updateTemplate(actor, id, t) {
    const current = await requireTemplate(id);
    if (!isEditable(current.status))
        throw conflict('TEMPLATE_LOCKED', `A ${current.status} template cannot be edited; create a new one`);
    checkVariables(t);
    await repo.updateTemplate(id, t);
    await audit(actor, 'template.updated', 'template', id, { name: t.name });
    return repo.findTemplate(id);
}
export async function deleteTemplate(actor, id) {
    await requireTemplate(id);
    if (await repo.isTemplateUsed(id))
        throw conflict('TEMPLATE_IN_USE', 'Template has messages referencing it and cannot be deleted');
    await repo.deleteTemplate(id);
    await audit(actor, 'template.deleted', 'template', id);
}
async function metaInstanceFor(instanceId) {
    const instance = await findInstance(instanceId);
    if (!instance || instance.provider !== 'META_CLOUD')
        throw badRequest('NOT_META_INSTANCE', 'Templates are submitted through a Meta Cloud API instance');
    return instance;
}
/** Submits to Meta. The status stored is whatever Meta answers - never assumed. */
export async function submitTemplate(actor, id, instanceId) {
    const t = await requireTemplate(id);
    if (!isEditable(t.status))
        throw conflict('ALREADY_SUBMITTED', `Template is already ${t.status}`);
    const instance = await metaInstanceFor(instanceId);
    if (!(await findAssignment(t.projectId, instanceId))) {
        throw badRequest('INSTANCE_NOT_ASSIGNED', 'The Meta instance must be assigned to the template\'s project');
    }
    let res;
    try {
        res = await createMetaClient(instance.providerConfig).call('POST', `${instance.providerConfig.wabaId}/message_templates`, toMetaTemplatePayload(t));
    }
    catch (e) {
        const err = toProviderError(e);
        throw new AppError(502, 'META_REJECTED', err.message);
    }
    const status = mapMetaTemplateStatus(res.status);
    await repo.setTemplateProviderState(id, { status, rejectionReason: null, providerTemplateId: res.id, instanceId });
    await audit(actor, 'template.submitted', 'template', id, { instanceId, providerTemplateId: res.id, status });
    return repo.findTemplate(id);
}
/** Pulls the current status from Meta. */
export async function syncTemplate(actor, id) {
    const t = await requireTemplate(id);
    if (!t.instanceId || !t.providerTemplateId)
        throw badRequest('NOT_SUBMITTED', 'Template has not been submitted to Meta');
    const instance = await metaInstanceFor(t.instanceId);
    let res;
    try {
        res = await createMetaClient(instance.providerConfig).call('GET', `${instance.providerConfig.wabaId}/message_templates?name=${encodeURIComponent(t.name)}&fields=id,name,status,language,rejected_reason`);
    }
    catch (e) {
        throw new AppError(502, 'META_SYNC_FAILED', toProviderError(e).message);
    }
    const remote = res.data?.find((r) => r.id === t.providerTemplateId) ?? res.data?.find((r) => r.language === t.language);
    if (!remote) {
        await setStatus(actor, t.id, t.status, 'DISABLED', 'Template no longer exists in Meta');
    }
    else {
        const reason = remote.rejected_reason && remote.rejected_reason !== 'NONE' ? remote.rejected_reason : null;
        await setStatus(actor, t.id, t.status, mapMetaTemplateStatus(remote.status), reason);
    }
    return repo.findTemplate(id);
}
export async function syncAllTemplates(actor) {
    const results = [];
    for (const { id } of await repo.listSubmittedTemplateIds()) {
        try {
            await syncTemplate(actor, id);
            results.push({ id, ok: true });
        }
        catch (e) {
            results.push({ id, ok: false, error: e.message });
        }
    }
    return results;
}
/** From Meta's message_template_status_update webhook. */
export async function applyTemplateStatusWebhook(payload) {
    if (!payload.message_template_id)
        return;
    for (const t of await repo.findTemplatesByProviderId(String(payload.message_template_id))) {
        const reason = payload.reason && payload.reason !== 'NONE' ? payload.reason : null;
        await setStatus(SYSTEM, t.id, t.status, mapMetaTemplateStatus(payload.event), reason);
    }
}
async function setStatus(actor, id, from, to, reason) {
    await repo.setTemplateProviderState(id, { status: to, rejectionReason: reason });
    if (from !== to)
        await audit(actor, 'template.status_changed', 'template', id, { from, to, reason });
}
//# sourceMappingURL=templateUseCases.js.map