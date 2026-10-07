import { describe, it, expect, beforeEach } from 'vitest';
import { RBACEngine } from '../core/rbac.js';
import type { ResourceEntry } from '../types.js';

describe('RBACEngine', () => {
  let rbac: RBACEngine;

  beforeEach(() => {
    rbac = new RBACEngine();
  });

  describe('assignRole', () => {
    it('assigns a role to a user in a workspace', () => {
      rbac.assignRole('user-1', 'ws-1', 'admin');
      expect(rbac.getRole('user-1', 'ws-1')).toBe('admin');
    });

    it('overwrites existing role for the same user', () => {
      rbac.assignRole('user-1', 'ws-1', 'member');
      rbac.assignRole('user-1', 'ws-1', 'admin');
      expect(rbac.getRole('user-1', 'ws-1')).toBe('admin');
    });
  });

  describe('removeRole', () => {
    it('removes a user role from a workspace', () => {
      rbac.assignRole('user-1', 'ws-1', 'member');
      rbac.removeRole('user-1', 'ws-1');
      expect(rbac.getRole('user-1', 'ws-1')).toBeUndefined();
    });

    it('does nothing if user has no role', () => {
      rbac.removeRole('user-1', 'ws-1');
      expect(rbac.getRole('user-1', 'ws-1')).toBeUndefined();
    });
  });

  describe('getRole', () => {
    it('returns undefined for unknown user', () => {
      expect(rbac.getRole('unknown', 'ws-1')).toBeUndefined();
    });

    it('returns undefined for unknown workspace', () => {
      rbac.assignRole('user-1', 'ws-1', 'member');
      expect(rbac.getRole('user-1', 'ws-2')).toBeUndefined();
    });
  });

  describe('getUserWorkspaces', () => {
    it('returns all workspaces for a user', () => {
      rbac.assignRole('user-1', 'ws-1', 'member');
      rbac.assignRole('user-1', 'ws-2', 'admin');
      rbac.assignRole('user-2', 'ws-3', 'owner');

      const workspaces = rbac.getUserWorkspaces('user-1');
      expect(workspaces).toHaveLength(2);
      expect(workspaces).toContain('ws-1');
      expect(workspaces).toContain('ws-2');
    });

    it('returns empty for user with no workspaces', () => {
      expect(rbac.getUserWorkspaces('user-1')).toHaveLength(0);
    });
  });

  describe('getWorkspaceMembers', () => {
    it('returns all members of a workspace', () => {
      rbac.assignRole('user-1', 'ws-1', 'owner');
      rbac.assignRole('user-2', 'ws-1', 'admin');
      rbac.assignRole('user-3', 'ws-1', 'member');

      const members = rbac.getWorkspaceMembers('ws-1');
      expect(members).toHaveLength(3);
    });

    it('returns empty for unknown workspace', () => {
      expect(rbac.getWorkspaceMembers('unknown')).toHaveLength(0);
    });
  });

  describe('hasPermission', () => {
    it('owner has all permissions', () => {
      rbac.assignRole('user-1', 'ws-1', 'owner');
      expect(rbac.hasPermission('user-1', 'ws-1', 'create')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'read')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'update')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'delete')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'share')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'admin')).toBe(true);
    });

    it('admin has all except admin permission', () => {
      rbac.assignRole('user-1', 'ws-1', 'admin');
      expect(rbac.hasPermission('user-1', 'ws-1', 'create')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'read')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'update')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'delete')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'share')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'admin')).toBe(false);
    });

    it('member has create, read, update', () => {
      rbac.assignRole('user-1', 'ws-1', 'member');
      expect(rbac.hasPermission('user-1', 'ws-1', 'create')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'read')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'update')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'delete')).toBe(false);
      expect(rbac.hasPermission('user-1', 'ws-1', 'share')).toBe(false);
      expect(rbac.hasPermission('user-1', 'ws-1', 'admin')).toBe(false);
    });

    it('guest has read only', () => {
      rbac.assignRole('user-1', 'ws-1', 'guest');
      expect(rbac.hasPermission('user-1', 'ws-1', 'read')).toBe(true);
      expect(rbac.hasPermission('user-1', 'ws-1', 'create')).toBe(false);
      expect(rbac.hasPermission('user-1', 'ws-1', 'update')).toBe(false);
      expect(rbac.hasPermission('user-1', 'ws-1', 'delete')).toBe(false);
    });

    it('returns false for user without role (workspace isolation)', () => {
      rbac.assignRole('user-1', 'ws-1', 'owner');
      expect(rbac.hasPermission('user-1', 'ws-2', 'read')).toBe(false);
      expect(rbac.hasPermission('user-2', 'ws-1', 'read')).toBe(false);
    });
  });

  describe('canAccessResource', () => {
    it('allows access if user has read permission in workspace', () => {
      rbac.assignRole('user-1', 'ws-1', 'member');
      const resource: ResourceEntry = {
        id: 'res-1',
        type: 'doc',
        ownerId: 'user-2',
        workspaceId: 'ws-1',
        title: 'Test Doc',
        metadata: {},
        aiAccessEnabled: true,
        createdAt: Date.now(),
      };
      expect(rbac.canAccessResource('user-1', resource)).toBe(true);
    });

    it('denies access if user has no role in workspace', () => {
      const resource: ResourceEntry = {
        id: 'res-1',
        type: 'doc',
        ownerId: 'user-1',
        workspaceId: 'ws-1',
        title: 'Test Doc',
        metadata: {},
        aiAccessEnabled: true,
        createdAt: Date.now(),
      };
      expect(rbac.canAccessResource('user-2', resource)).toBe(false);
    });
  });
});
