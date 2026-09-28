/**
 * Business rules for a project's WhatsApp Service:
 * priority must belong to the project; fallback is optional but must also belong to it;
 * priority and fallback cannot be the same instance.
 */
export function validateServiceConfig(input, assignedInstanceIds) {
    const assigned = new Set([...assignedInstanceIds].map((i) => i.toUpperCase()));
    const priority = input.priorityInstanceId.toUpperCase();
    const fallback = input.fallbackInstanceId?.toUpperCase() ?? null;
    const violations = [];
    if (!assigned.has(priority)) {
        violations.push({ code: 'PRIORITY_NOT_ASSIGNED', message: 'Priority instance must be assigned to the project' });
    }
    if (fallback && !assigned.has(fallback)) {
        violations.push({ code: 'FALLBACK_NOT_ASSIGNED', message: 'Fallback instance must be assigned to the project' });
    }
    if (fallback && fallback === priority) {
        violations.push({ code: 'SAME_INSTANCE', message: 'Priority and fallback cannot be the same instance' });
    }
    return violations;
}
//# sourceMappingURL=serviceRules.js.map