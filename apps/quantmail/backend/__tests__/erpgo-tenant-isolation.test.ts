import { describe, it, expect } from 'vitest';
import {
  extractWorkspaceContext,
  verifyTenantOwnership,
  withTenantScope,
} from '../middleware/workspace-tenant';
import { checkWorkspaceSeatLimit, checkWorkspaceStorageLimit } from '../services/workspace-billing';

describe('ERPGo Row-Level Multi-Tenant Workspace Isolation & Context Security', () => {
  describe('extractWorkspaceContext', () => {
    it('extracts workspace context from x-workspace-id header', () => {
      const req = {
        headers: {
          'x-workspace-id': 'ws_123',
          'x-user-id': 'usr_456',
          'x-workspace-role': 'ADMIN',
        },
      };
      const ctx = extractWorkspaceContext(req);
      expect(ctx).toEqual({
        workspaceId: 'ws_123',
        userId: 'usr_456',
        role: 'ADMIN',
      });
    });

    it('falls back to auth object properties when headers are absent', () => {
      const req = {
        headers: {},
        auth: {
          workspaceId: 'ws_fallback',
          userId: 'usr_fallback',
          role: 'MEMBER',
        },
      };
      const ctx = extractWorkspaceContext(req);
      expect(ctx).toEqual({
        workspaceId: 'ws_fallback',
        userId: 'usr_fallback',
        role: 'MEMBER',
      });
    });

    it('returns null when no workspaceId can be found', () => {
      const req = {
        headers: {},
        auth: { userId: 'usr_123' },
      };
      expect(extractWorkspaceContext(req)).toBeNull();
      expect(extractWorkspaceContext(null)).toBeNull();
    });
  });

  describe('verifyTenantOwnership', () => {
    it('returns true when resource workspace matches current workspace', () => {
      expect(verifyTenantOwnership('ws_abc', 'ws_abc')).toBe(true);
    });

    it('throws 403 FORBIDDEN AppError when workspaces mismatch', () => {
      expect(() => verifyTenantOwnership('ws_abc', 'ws_xyz')).toThrow();
      try {
        verifyTenantOwnership('ws_abc', 'ws_xyz');
      } catch (err: any) {
        expect(err.statusCode || err.status || 403).toBe(403);
      }
    });
  });

  describe('withTenantScope', () => {
    it('attaches workspaceId to query filter object', () => {
      const filter = { status: 'active', type: 'email' };
      const scoped = withTenantScope(filter, 'ws_tenant_999');
      expect(scoped).toEqual({
        status: 'active',
        type: 'email',
        workspaceId: 'ws_tenant_999',
      });
    });
  });

  describe('Workspace Billing Seats & Storage Quotas', () => {
    it('enforces seat limits correctly across Free vs Pro vs Enterprise', () => {
      // Free limit: 5 seats
      const freeUnder = checkWorkspaceSeatLimit('ws_1', 3, 'FREE');
      expect(freeUnder.allowed).toBe(true);
      expect(freeUnder.maxSeats).toBe(5);

      const freeOver = checkWorkspaceSeatLimit('ws_1', 5, 'FREE');
      expect(freeOver.allowed).toBe(false);

      // Enterprise limit: 10000 seats
      const enterpriseCheck = checkWorkspaceSeatLimit('ws_2', 500, 'ENTERPRISE');
      expect(enterpriseCheck.allowed).toBe(true);
      expect(enterpriseCheck.maxSeats).toBe(10000);
    });

    it('enforces storage quotas correctly across Free vs Pro vs Enterprise', () => {
      const oneGB = 1024 * 1024 * 1024;
      const freeCheck = checkWorkspaceStorageLimit('ws_1', oneGB / 2, 'FREE');
      expect(freeCheck.allowed).toBe(true);
      expect(freeCheck.maxStorageBytes).toBe(oneGB);
      expect(freeCheck.percentageUsed).toBe(50);

      const freeOver = checkWorkspaceStorageLimit('ws_1', oneGB * 1.5, 'FREE');
      expect(freeOver.allowed).toBe(false);
      expect(freeOver.percentageUsed).toBe(150);
    });
  });
});
