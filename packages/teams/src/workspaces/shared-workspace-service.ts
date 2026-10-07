import type { SharedWorkspace } from '../types.js';

export class SharedWorkspaceService {
  private workspaces = new Map<string, SharedWorkspace>();

  async create(orgId: string, name: string, members: string[]): Promise<SharedWorkspace> {
    const workspace: SharedWorkspace = {
      id: crypto.randomUUID(),
      orgId,
      name,
      members,
      permissions: {},
      resources: [],
      createdAt: Date.now(),
    };
    this.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  async addResource(workspaceId: string, resource: string): Promise<boolean> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;
    workspace.resources.push(resource);
    return true;
  }

  async removeResource(workspaceId: string, resourceId: string): Promise<boolean> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;
    const idx = workspace.resources.indexOf(resourceId);
    if (idx === -1) return false;
    workspace.resources.splice(idx, 1);
    return true;
  }

  async setPermissions(
    workspaceId: string,
    permissions: Record<string, string[]>,
  ): Promise<boolean> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;
    workspace.permissions = permissions;
    return true;
  }

  async getMembers(workspaceId: string): Promise<string[]> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return [];
    return workspace.members;
  }

  async listForOrg(orgId: string): Promise<SharedWorkspace[]> {
    const result: SharedWorkspace[] = [];
    for (const ws of this.workspaces.values()) {
      if (ws.orgId === orgId) result.push(ws);
    }
    return result;
  }
}
