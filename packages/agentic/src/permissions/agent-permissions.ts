export interface Permission {
  resource: string;
  actions: string[];
}

export interface AgentPermissions {
  agentId: string;
  userId: string;
  permissions: Permission[];
  grantedAt: Date;
}

export class PermissionManager {
  private permissions: Map<string, AgentPermissions[]> = new Map();

  grantPermission(agentId: string, userId: string, resource: string, actions: string[]) {
    const key = `${agentId}:${userId}`;
    const existing = this.permissions.get(key) || [];

    existing.push({
      agentId,
      userId,
      permissions: [{ resource, actions }],
      grantedAt: new Date(),
    });

    this.permissions.set(key, existing);
  }

  hasPermission(agentId: string, userId: string, resource: string, action: string): boolean {
    const key = `${agentId}:${userId}`;
    const perms = this.permissions.get(key) || [];

    return perms.some((p) =>
      p.permissions.some((perm) => perm.resource === resource && perm.actions.includes(action)),
    );
  }

  revokePermission(agentId: string, userId: string, resource: string) {
    const key = `${agentId}:${userId}`;
    const perms = this.permissions.get(key) || [];

    const filtered = perms.filter((p) => !p.permissions.some((perm) => perm.resource === resource));

    this.permissions.set(key, filtered);
  }

  getUserPermissions(userId: string): AgentPermissions[] {
    const result: AgentPermissions[] = [];

    this.permissions.forEach((perms, key) => {
      if (key.endsWith(`:${userId}`)) {
        result.push(...perms);
      }
    });

    return result;
  }
}

export const permissionManager = new PermissionManager();
