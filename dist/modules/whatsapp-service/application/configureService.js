import { badRequest } from '../../../shared/errors/AppError.js';
import { audit } from '../../audit/application/audit.js';
import { requireProject } from '../../projects/application/projectUseCases.js';
import { listProjectInstances } from '../../whatsapp-instances/infrastructure/assignmentRepository.js';
import { validateServiceConfig } from '../domain/serviceRules.js';
import { findService, upsertService } from '../infrastructure/serviceRepository.js';
export async function configureWhatsAppService(actor, projectId, input) {
    await requireProject(projectId);
    const assigned = (await listProjectInstances(projectId)).map((i) => String(i.id));
    const violations = validateServiceConfig(input, assigned);
    if (violations.length)
        throw badRequest(violations[0].code, violations.map((v) => v.message).join('; '), violations);
    const before = await findService(projectId);
    await upsertService(projectId, input.priorityInstanceId, input.fallbackInstanceId);
    if (before?.priorityInstanceId !== input.priorityInstanceId) {
        await audit(actor, 'service.priority_changed', 'project', projectId, {
            from: before?.priorityInstanceId ?? null,
            to: input.priorityInstanceId,
        });
    }
    if ((before?.fallbackInstanceId ?? null) !== input.fallbackInstanceId) {
        await audit(actor, 'service.fallback_changed', 'project', projectId, {
            from: before?.fallbackInstanceId ?? null,
            to: input.fallbackInstanceId,
        });
    }
    return findService(projectId);
}
//# sourceMappingURL=configureService.js.map