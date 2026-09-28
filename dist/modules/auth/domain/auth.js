export const ROLES = ['ADMIN', 'OPERATOR', 'VIEWER'];
/**
 * ADMIN    - full access (users, instance credentials, deletions)
 * OPERATOR - manage messaging resources, not sensitive system settings
 * VIEWER   - read-only
 */
const RANK = { VIEWER: 1, OPERATOR: 2, ADMIN: 3 };
export const hasRole = (role, required) => RANK[role] >= RANK[required];
//# sourceMappingURL=auth.js.map