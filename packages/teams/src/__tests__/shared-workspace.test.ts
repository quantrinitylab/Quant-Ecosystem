import { describe, it, expect, beforeEach } from 'vitest';
import { SharedWorkspaceService } from '../workspaces/shared-workspace-service.js';

describe('SharedWorkspaceService', () => {
  let service: SharedWorkspaceService;

  beforeEach(() => {
    service = new SharedWorkspaceService();
  });

  it('creates a shared workspace', async () => {
    const ws = await service.create('org-1', 'Design Team', ['user-1', 'user-2']);
    expect(ws.name).toBe('Design Team');
    expect(ws.orgId).toBe('org-1');
    expect(ws.members).toHaveLength(2);
    expect(ws.resources).toHaveLength(0);
  });

  it('adds a resource to workspace', async () => {
    const ws = await service.create('org-1', 'Engineering', ['user-1']);
    const added = await service.addResource(ws.id, 'doc-123');
    expect(added).toBe(true);
  });

  it('removes a resource from workspace', async () => {
    const ws = await service.create('org-1', 'Engineering', ['user-1']);
    await service.addResource(ws.id, 'doc-123');
    const removed = await service.removeResource(ws.id, 'doc-123');
    expect(removed).toBe(true);
  });

  it('returns false when removing non-existent resource', async () => {
    const ws = await service.create('org-1', 'Engineering', ['user-1']);
    const removed = await service.removeResource(ws.id, 'no-such-resource');
    expect(removed).toBe(false);
  });

  it('sets permissions', async () => {
    const ws = await service.create('org-1', 'Marketing', ['user-1', 'user-2']);
    const result = await service.setPermissions(ws.id, {
      'user-1': ['read', 'write'],
      'user-2': ['read'],
    });
    expect(result).toBe(true);
  });

  it('gets members', async () => {
    const ws = await service.create('org-1', 'Sales', ['user-1', 'user-2', 'user-3']);
    const members = await service.getMembers(ws.id);
    expect(members).toHaveLength(3);
  });

  it('lists workspaces for org', async () => {
    await service.create('org-1', 'WS 1', ['user-1']);
    await service.create('org-1', 'WS 2', ['user-2']);
    await service.create('org-2', 'Other', ['user-3']);
    const list = await service.listForOrg('org-1');
    expect(list).toHaveLength(2);
  });

  it('returns empty for non-existent workspace operations', async () => {
    const members = await service.getMembers('non-existent');
    expect(members).toHaveLength(0);
    const added = await service.addResource('non-existent', 'doc');
    expect(added).toBe(false);
  });
});
