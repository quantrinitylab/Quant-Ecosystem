import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BranchProtectionService } from '../services/branch-protection.service';

function createMockPrisma() {
  return {
    branchProtection: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    review: {
      count: vi.fn(),
    },
    ciRun: {
      findFirst: vi.fn(),
    },
  };
}

describe('BranchProtectionService', () => {
  let service: BranchProtectionService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new BranchProtectionService(prisma as never);
  });

  describe('createRule', () => {
    it('creates a branch protection rule', async () => {
      const mockRule = {
        id: 'rule-1',
        repoId: 'repo-1',
        branchPattern: 'main',
        requiredApprovals: 2,
        requireStatusChecks: true,
        createdAt: new Date(),
      };
      prisma.branchProtection.create.mockResolvedValue(mockRule);

      const result = await service.createRule({
        repoId: 'repo-1',
        branchPattern: 'main',
        requiredApprovals: 2,
        requireStatusChecks: true,
      });

      expect(result.branchPattern).toBe('main');
      expect(result.requiredApprovals).toBe(2);
      expect(prisma.branchProtection.create).toHaveBeenCalledWith({
        data: {
          repoId: 'repo-1',
          branchPattern: 'main',
          requiredApprovals: 2,
          requireStatusChecks: true,
        },
      });
    });

    it('uses default values for optional fields', async () => {
      prisma.branchProtection.create.mockResolvedValue({
        id: 'rule-2',
        branchPattern: 'release/*',
        requiredApprovals: 1,
        requireStatusChecks: false,
      });

      await service.createRule({
        repoId: 'repo-1',
        branchPattern: 'release/*',
      });

      expect(prisma.branchProtection.create).toHaveBeenCalledWith({
        data: {
          repoId: 'repo-1',
          branchPattern: 'release/*',
          requiredApprovals: 1,
          requireStatusChecks: false,
        },
      });
    });
  });

  describe('updateRule', () => {
    it('updates an existing rule', async () => {
      prisma.branchProtection.findUnique.mockResolvedValue({
        id: 'rule-1',
        branchPattern: 'main',
        requiredApprovals: 1,
      });
      prisma.branchProtection.update.mockResolvedValue({
        id: 'rule-1',
        branchPattern: 'main',
        requiredApprovals: 3,
      });

      const result = await service.updateRule('rule-1', { requiredApprovals: 3 });

      expect(result.requiredApprovals).toBe(3);
      expect(prisma.branchProtection.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { requiredApprovals: 3 },
      });
    });

    it('throws 404 when rule not found', async () => {
      prisma.branchProtection.findUnique.mockResolvedValue(null);

      await expect(service.updateRule('missing', { requiredApprovals: 2 })).rejects.toThrow(
        'Branch protection rule not found',
      );
    });
  });

  describe('deleteRule', () => {
    it('deletes an existing rule', async () => {
      prisma.branchProtection.findUnique.mockResolvedValue({ id: 'rule-1' });
      prisma.branchProtection.delete.mockResolvedValue({ id: 'rule-1' });

      const result = await service.deleteRule('rule-1');

      expect(result.id).toBe('rule-1');
      expect(prisma.branchProtection.delete).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
      });
    });

    it('throws 404 when rule not found', async () => {
      prisma.branchProtection.findUnique.mockResolvedValue(null);

      await expect(service.deleteRule('missing')).rejects.toThrow(
        'Branch protection rule not found',
      );
    });
  });

  describe('listRules', () => {
    it('returns all rules for a repo', async () => {
      const mockRules = [
        { id: 'rule-1', branchPattern: 'main' },
        { id: 'rule-2', branchPattern: 'release/*' },
      ];
      prisma.branchProtection.findMany.mockResolvedValue(mockRules);

      const result = await service.listRules('repo-1');

      expect(result).toHaveLength(2);
      expect(prisma.branchProtection.findMany).toHaveBeenCalledWith({
        where: { repoId: 'repo-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('enforceOnPush', () => {
    it('allows push when no protection rules exist', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([]);

      const result = await service.enforceOnPush('repo-1', 'main');

      expect(result.allowed).toBe(true);
    });

    it('blocks direct push to protected branch without PR', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'rule-1', branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: false },
      ]);

      const result = await service.enforceOnPush('repo-1', 'main');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Direct push');
    });

    it('blocks push when insufficient approvals', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'rule-1', branchPattern: 'main', requiredApprovals: 2, requireStatusChecks: false },
      ]);
      prisma.review.count.mockResolvedValue(1);

      const result = await service.enforceOnPush('repo-1', 'main', 'pr-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Requires 2 approval(s), but only has 1');
    });

    it('allows push when sufficient approvals', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'rule-1', branchPattern: 'main', requiredApprovals: 2, requireStatusChecks: false },
      ]);
      prisma.review.count.mockResolvedValue(2);

      const result = await service.enforceOnPush('repo-1', 'main', 'pr-1');

      expect(result.allowed).toBe(true);
    });

    it('allows push to non-protected branch', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'rule-1', branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: false },
      ]);

      const result = await service.enforceOnPush('repo-1', 'feature/test');

      expect(result.allowed).toBe(true);
    });

    it('matches wildcard patterns', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          branchPattern: 'release/*',
          requiredApprovals: 1,
          requireStatusChecks: false,
        },
      ]);

      const result = await service.enforceOnPush('repo-1', 'release/v1.0');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Direct push');
    });

    it('blocks push when status checks have not passed', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          branchPattern: 'main',
          requiredApprovals: 0,
          requireStatusChecks: true,
        },
      ]);
      prisma.ciRun.findFirst.mockResolvedValue({ id: 'run-1', status: 'FAILED' });

      const result = await service.enforceOnPush('repo-1', 'main', 'pr-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('status checks');
    });

    it('blocks push when no CI runs exist and status checks required', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          branchPattern: 'main',
          requiredApprovals: 0,
          requireStatusChecks: true,
        },
      ]);
      prisma.ciRun.findFirst.mockResolvedValue(null);

      const result = await service.enforceOnPush('repo-1', 'main', 'pr-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('status checks');
    });

    it('allows push when status checks pass', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          branchPattern: 'main',
          requiredApprovals: 0,
          requireStatusChecks: true,
        },
      ]);
      prisma.ciRun.findFirst.mockResolvedValue({ id: 'run-1', status: 'SUCCESS' });

      const result = await service.enforceOnPush('repo-1', 'main', 'pr-1');

      expect(result.allowed).toBe(true);
    });
  });
});
