// ============================================================================
// Resource Registry - Track and manage resources across workspaces
// ============================================================================

import type { ResourceEntry, ResourceType } from '../types.js';

export class ResourceRegistry {
  private resources: Map<string, ResourceEntry> = new Map();

  registerResource(resource: ResourceEntry): void {
    this.resources.set(resource.id, resource);
  }

  getResource(id: string): ResourceEntry | undefined {
    return this.resources.get(id);
  }

  listResources(workspaceId: string, type?: ResourceType, ownerId?: string): ResourceEntry[] {
    const results: ResourceEntry[] = [];
    for (const resource of this.resources.values()) {
      if (resource.workspaceId !== workspaceId) continue;
      if (type && resource.type !== type) continue;
      if (ownerId && resource.ownerId !== ownerId) continue;
      results.push(resource);
    }
    return results;
  }

  transferOwnership(resourceId: string, newOwnerId: string): boolean {
    const resource = this.resources.get(resourceId);
    if (!resource) return false;
    resource.ownerId = newOwnerId;
    return true;
  }

  setAIAccessToggle(resourceId: string, enabled: boolean): boolean {
    const resource = this.resources.get(resourceId);
    if (!resource) return false;
    resource.aiAccessEnabled = enabled;
    return true;
  }

  isAIAccessEnabled(resourceId: string): boolean {
    const resource = this.resources.get(resourceId);
    if (!resource) return false;
    return resource.aiAccessEnabled;
  }

  deleteResource(resourceId: string): boolean {
    return this.resources.delete(resourceId);
  }
}
