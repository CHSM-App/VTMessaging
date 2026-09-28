export const ROLES = ['ADMIN', 'OPERATOR', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

/**
 * ADMIN    - full access (users, instance credentials, deletions)
 * OPERATOR - manage messaging resources, not sensitive system settings
 * VIEWER   - read-only
 */
const RANK: Record<Role, number> = { VIEWER: 1, OPERATOR: 2, ADMIN: 3 };

export const hasRole = (role: Role, required: Role) => RANK[role] >= RANK[required];

export interface AdminPrincipal {
  id: string;
  email: string;
  name: string;
  role: Role;
}
