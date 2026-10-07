// ============================================================================
// RBAC Engine - Role-Based Access Control for Workspaces
// ============================================================================
// NOTE: This is an in-memory implementation for the foundation phase. Role memberships are stored
// in Maps with no persistence, eviction, or size limits. Database-backed storage will be added
// when persistence integration is implemented.

import type { ResourcePermission, RoleMembership, WorkspaceRole, ResourceEntry } from '../types.js';

/** Permission matrix mapping roles to allowed resource permissions */
const PERMISSION_MATRIX: Record<WorkspaceRole, ResourcePermission[]> = {
  owner: ['create', 'read', 'update', 'delete', 'share', 'admin'],
  admin: ['create', 'read', 'update', 'delete', 'share'],
  member: ['create', 'read', 'update'],
  guest: ['read'],
};

export class RBACEngine {
  private roleMemberships: Map<string, RoleMembership[]> = new Map();

  assignRole(userId: string, workspaceId: string, role: WorkspaceRole): void {
    const memberships = this.roleMemberships.get(workspaceId) ?? [];
    const existing = memberships.findIndex((m) => m.userId === userId);
    const membership: RoleMembership = {
      userId,
      workspaceId,
      role,
      grantedAt: Date.now(),
    };

    if (existing >= 0) {
      memberships[existing] = membership;
    } else {
      memberships.push(membership);
    }

    this.roleMemberships.set(workspaceId, memberships);
  }

  removeRole(userId: string, workspaceId: string): void {
    const memberships = this.roleMemberships.get(workspaceId);
    if (!memberships) return;
    const filtered = memberships.filter((m) => m.userId !== userId);
    this.roleMemberships.set(workspaceId, filtered);
  }

  getRole(userId: string, workspaceId: string): WorkspaceRole | undefined {
    const memberships = this.roleMemberships.get(workspaceId);
    if (!memberships) return undefined;
    const membership = memberships.find((m) => m.userId === userId);
    return membership?.role;
  }

  getUserWorkspaces(userId: string): string[] {
    const workspaceIds: string[] = [];
    for (const [workspaceId, memberships] of this.roleMemberships) {
      if (memberships.some((m) => m.userId === userId)) {
        workspaceIds.push(workspaceId);
      }
    }
    return workspaceIds;
  }

  getWorkspaceMembers(workspaceId: string): RoleMembership[] {
    return this.roleMemberships.get(workspaceId) ?? [];
  }

  hasPermission(userId: string, workspaceId: string, permission: ResourcePermission): boolean {
    const role = this.getRole(userId, workspaceId);
    if (!role) return false;
    const allowed = PERMISSION_MATRIX[role];
    return allowed.includes(permission);
  }

  canAccessResource(userId: string, resource: ResourceEntry): boolean {
    return this.hasPermission(userId, resource.workspaceId, 'read');
  }
}
