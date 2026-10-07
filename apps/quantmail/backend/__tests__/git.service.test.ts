import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GitService,
  ownerOnlyAccess,
  type GitServerPort,
  type RepoAccessPort,
} from '../modules/code/services/git.service';
import { BranchProtectionService } from '../modules/code/services/branch-protection.service';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function createMockPrisma() {
  return {
    repository: {
      findUnique: vi.fn(),
    },
    branchProtection: {
      findMany: vi.fn(),
    },
    review: {
      count: vi.fn(),
    },
    ciRun: {
      findFirst: vi.fn(),
    },
    branch: {
      upsert: vi.fn(),
    },
  };
}

/** A GitServerPort spy that echoes back the requested SHA. */
function createGitServerSpy(): GitServerPort & { advanceRef: ReturnType<typeof vi.fn> } {
  return {
    advanceRef: vi.fn(async ({ newSha }: { newSha: string }) => ({ newSha })),
  };
}

const REPO = {
  id: 'repo-1',
  ownerId: 'owner-1',
  storagePathUrl: 'file:///srv/git/repo-1.git',
};

describe('GitService.pushRefs', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let gitServer: ReturnType<typeof createGitServerSpy>;

  beforeEach(() => {
    prisma = createMockPrisma();
    gitServer = createGitServerSpy();
    prisma.branch.upsert.mockResolvedValue({});
  });

  function makeService(access?: RepoAccessPort) {
    return new GitService(prisma as never, {
      gitServer,
      access,
      branchProtection: new BranchProtectionService(prisma as never),
    });
  }

  // -------------------------------------------------------------------------
  // 1. Push authorization (Requirement 6.3) — write-scope gate
  // -------------------------------------------------------------------------
  describe('write-scope gate (Req 6.3)', () => {
    it('rejects a caller without write scope with 403 WRITE_SCOPE_REQUIRED and transports no ref', async () => {
      prisma.repository.findUnique.mockResolvedValue(REPO);
      const service = makeService(); // default ownerOnlyAccess

      await expect(
        service.pushRefs('not-the-owner', 'repo-1', [
          { ref: 'refs/heads/feature', newSha: 'aaa111' },
        ]),
      ).rejects.toMatchObject({ statusCode: 403, code: 'WRITE_SCOPE_REQUIRED' });

      // No ref must be transported when authorization fails.
      expect(gitServer.advanceRef).not.toHaveBeenCalled();
      expect(prisma.branch.upsert).not.toHaveBeenCalled();
    });

    it('allows the owner to push to an unprotected branch — ref advances', async () => {
      prisma.repository.findUnique.mockResolvedValue(REPO);
      prisma.branchProtection.findMany.mockResolvedValue([]); // no protection rules

      const service = makeService();

      const result = await service.pushRefs('owner-1', 'repo-1', [
        { ref: 'refs/heads/feature', newSha: 'aaa111' },
      ]);

      expect(result.ok).toBe(true);
      expect(result.updates).toHaveLength(1);
      expect(result.updates[0]).toMatchObject({
        ref: 'refs/heads/feature',
        branch: 'feature',
        status: 'advanced',
        newSha: 'aaa111',
      });
      expect(gitServer.advanceRef).toHaveBeenCalledTimes(1);
      expect(gitServer.advanceRef).toHaveBeenCalledWith(
        expect.objectContaining({ repoId: 'repo-1', branch: 'feature', newSha: 'aaa111' }),
      );
      expect(prisma.branch.upsert).toHaveBeenCalledTimes(1);
    });

    it('throws 404 REPO_NOT_FOUND when the repository does not exist', async () => {
      prisma.repository.findUnique.mockResolvedValue(null);
      const service = makeService();

      await expect(
        service.pushRefs('owner-1', 'missing', [{ ref: 'refs/heads/main', newSha: 'x' }]),
      ).rejects.toMatchObject({ statusCode: 404, code: 'REPO_NOT_FOUND' });
      expect(gitServer.advanceRef).not.toHaveBeenCalled();
    });

    it('returns ok with no transport for an empty ref list', async () => {
      prisma.repository.findUnique.mockResolvedValue(REPO);
      const service = makeService();

      const result = await service.pushRefs('owner-1', 'repo-1', []);

      expect(result).toEqual({ ok: true, updates: [] });
      expect(gitServer.advanceRef).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Protected-ref gating (Requirement 6.3)
  // -------------------------------------------------------------------------
  describe('protected-ref gating (Req 6.3)', () => {
    it('rejects a direct push to a protected branch (no PR) without transporting the ref', async () => {
      prisma.repository.findUnique.mockResolvedValue(REPO);
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'rule-1', branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: false },
      ]);

      const service = makeService();

      const result = await service.pushRefs('owner-1', 'repo-1', [
        { ref: 'refs/heads/main', newSha: 'aaa111' }, // no prId => direct push
      ]);

      expect(result.ok).toBe(false);
      expect(result.updates[0]).toMatchObject({
        ref: 'refs/heads/main',
        branch: 'main',
        status: 'rejected',
      });
      expect(result.updates[0].reason).toContain('Direct push');
      // Rejected protected ref is NOT transported.
      expect(gitServer.advanceRef).not.toHaveBeenCalled();
      expect(prisma.branch.upsert).not.toHaveBeenCalled();
    });

    it('rejects a protected push with insufficient approvals without transporting the ref', async () => {
      prisma.repository.findUnique.mockResolvedValue(REPO);
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'rule-1', branchPattern: 'main', requiredApprovals: 2, requireStatusChecks: false },
      ]);
      prisma.review.count.mockResolvedValue(1); // only 1 of 2 required approvals

      const service = makeService();

      const result = await service.pushRefs('owner-1', 'repo-1', [
        { ref: 'refs/heads/main', newSha: 'aaa111', prId: 'pr-1' },
      ]);

      expect(result.ok).toBe(false);
      expect(result.updates[0].status).toBe('rejected');
      expect(result.updates[0].reason).toContain('Requires 2 approval(s), but only has 1');
      expect(gitServer.advanceRef).not.toHaveBeenCalled();
    });

    it('advances a protected ref when protection passes (enough approvals)', async () => {
      prisma.repository.findUnique.mockResolvedValue(REPO);
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'rule-1', branchPattern: 'main', requiredApprovals: 2, requireStatusChecks: false },
      ]);
      prisma.review.count.mockResolvedValue(2); // meets required approvals

      const service = makeService();

      const result = await service.pushRefs('owner-1', 'repo-1', [
        { ref: 'refs/heads/main', newSha: 'bbb222', prId: 'pr-1' },
      ]);

      expect(result.ok).toBe(true);
      expect(result.updates[0]).toMatchObject({ branch: 'main', status: 'advanced', newSha: 'bbb222' });
      expect(gitServer.advanceRef).toHaveBeenCalledTimes(1);
      expect(prisma.branch.upsert).toHaveBeenCalledTimes(1);
    });

    it('rejects the protected ref but advances the unprotected ref in a mixed push', async () => {
      prisma.repository.findUnique.mockResolvedValue(REPO);
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'rule-1', branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: false },
      ]);

      const service = makeService();

      const result = await service.pushRefs('owner-1', 'repo-1', [
        { ref: 'refs/heads/main', newSha: 'aaa111' }, // protected, direct push => rejected
        { ref: 'refs/heads/feature', newSha: 'ccc333' }, // unprotected => advanced
      ]);

      expect(result.ok).toBe(false);
      const main = result.updates.find((u) => u.branch === 'main');
      const feature = result.updates.find((u) => u.branch === 'feature');
      expect(main?.status).toBe('rejected');
      expect(feature?.status).toBe('advanced');
      // Only the unprotected ref is transported.
      expect(gitServer.advanceRef).toHaveBeenCalledTimes(1);
      expect(gitServer.advanceRef).toHaveBeenCalledWith(
        expect.objectContaining({ branch: 'feature', newSha: 'ccc333' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Default access policy
  // -------------------------------------------------------------------------
  describe('ownerOnlyAccess policy', () => {
    it('grants write scope to the repo owner only', () => {
      expect(ownerOnlyAccess.hasWriteScope(REPO as never, 'owner-1')).toBe(true);
      expect(ownerOnlyAccess.hasWriteScope(REPO as never, 'someone-else')).toBe(false);
    });
  });
});
