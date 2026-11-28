import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PullRequestService } from '../modules/code/services/pr.service';

function createMockPrisma() {
  return {
    pullRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    repository: {
      findFirst: vi.fn(),
    },
    repositoryCollaborator: {
      findMany: vi.fn(),
    },
    branchProtection: {
      findMany: vi.fn(),
    },
    review: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    ciRun: {
      findFirst: vi.fn(),
    },
    branch: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'QuantGit Test',
  GIT_AUTHOR_EMAIL: 'test@quant.local',
  GIT_COMMITTER_NAME: 'QuantGit Test',
  GIT_COMMITTER_EMAIL: 'test@quant.local',
};

/**
 * Build a REAL bare repo under a temp GIT_REPOS_PATH with `main` and
 * `feature` branches, so merge tests prove a real commit lands — not a
 * paper status flip. Returns the temp base dir (caller removes it).
 */
function makeRealRepo(): { base: string; barePath: string } {
  const base = mkdtempSync(join(tmpdir(), 'qm-legacy-merge-'));
  const barePath = join(base, 'user-1', 'demo.git');
  execFileSync('git', ['init', '--bare', barePath], { env: GIT_ENV });
  const work = join(base, 'work');
  execFileSync('git', ['clone', barePath, work], { env: GIT_ENV });
  execFileSync('git', ['checkout', '-b', 'main'], { cwd: work, env: GIT_ENV });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'base'], { cwd: work, env: GIT_ENV });
  execFileSync('git', ['push', 'origin', 'main'], { cwd: work, env: GIT_ENV });
  execFileSync('git', ['checkout', '-b', 'feature'], { cwd: work, env: GIT_ENV });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'feature work'], {
    cwd: work,
    env: GIT_ENV,
  });
  execFileSync('git', ['push', 'origin', 'feature'], { cwd: work, env: GIT_ENV });
  return { base, barePath };
}

function openPr() {
  return {
    id: 'pr-1',
    repoId: 'repo-1',
    number: 1,
    title: 'Add feature',
    body: 'Feature body',
    authorId: 'user-1',
    status: 'OPEN',
    sourceBranch: 'feature',
    targetBranch: 'main',
  };
}

function mustSha(value: string | null | undefined): string {
  expect(value).toMatch(/^[0-9a-f]{40}$/);
  if (!value) throw new Error('expected a merge commit SHA');
  return value;
}

function ownerRepo() {
  return { id: 'repo-1', ownerId: 'user-1', name: 'demo', storagePathUrl: null };
}

describe('PullRequestService', () => {
  let service: PullRequestService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new PullRequestService(prisma as never);
  });

  describe('createPR', () => {
    it('creates a PR with auto-incrementing number', async () => {
      prisma.pullRequest.count.mockResolvedValue(3);
      const mockPR = {
        id: 'pr-1',
        repoId: 'repo-1',
        number: 4,
        title: 'Add feature',
        body: 'Description',
        authorId: 'user-1',
        status: 'OPEN',
        sourceBranch: 'feature/new',
        targetBranch: 'main',
        createdAt: new Date(),
      };
      prisma.pullRequest.create.mockResolvedValue(mockPR);

      const result = await service.createPR({
        repoId: 'repo-1',
        title: 'Add feature',
        body: 'Description',
        authorId: 'user-1',
        sourceBranch: 'feature/new',
        targetBranch: 'main',
      });

      expect(result.number).toBe(4);
      expect(result.status).toBe('OPEN');
      expect(prisma.pullRequest.count).toHaveBeenCalledWith({
        where: { repoId: 'repo-1' },
      });
      expect(prisma.pullRequest.create).toHaveBeenCalledWith({
        data: {
          repoId: 'repo-1',
          number: 4,
          title: 'Add feature',
          body: 'Description',
          authorId: 'user-1',
          status: 'OPEN',
          sourceBranch: 'feature/new',
          targetBranch: 'main',
        },
      });
    });

    it('sets body to null when not provided', async () => {
      prisma.pullRequest.count.mockResolvedValue(0);
      prisma.pullRequest.create.mockResolvedValue({
        id: 'pr-1',
        number: 1,
        body: null,
        status: 'OPEN',
      });

      await service.createPR({
        repoId: 'repo-1',
        title: 'Quick fix',
        authorId: 'user-1',
        sourceBranch: 'fix/bug',
        targetBranch: 'main',
      });

      expect(prisma.pullRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ body: null, number: 1 }),
      });
    });
  });

  describe('listPRs', () => {
    it('lists PRs for a repo without filters', async () => {
      const mockPRs = [
        { id: 'pr-1', number: 1, status: 'OPEN' },
        { id: 'pr-2', number: 2, status: 'MERGED' },
      ];
      prisma.pullRequest.findMany.mockResolvedValue(mockPRs);

      const result = await service.listPRs('repo-1');

      expect(result).toHaveLength(2);
      expect(prisma.pullRequest.findMany).toHaveBeenCalledWith({
        where: { repoId: 'repo-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('filters PRs by status', async () => {
      prisma.pullRequest.findMany.mockResolvedValue([{ id: 'pr-1', status: 'OPEN' }]);

      const result = await service.listPRs('repo-1', { status: 'OPEN' });

      expect(result).toHaveLength(1);
      expect(prisma.pullRequest.findMany).toHaveBeenCalledWith({
        where: { repoId: 'repo-1', status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getPR', () => {
    it('returns a PR by repo and number', async () => {
      const mockPR = { id: 'pr-1', repoId: 'repo-1', number: 1, title: 'Test PR' };
      prisma.pullRequest.findUnique.mockResolvedValue(mockPR);

      const result = await service.getPR('repo-1', 1);

      expect(result).toEqual(mockPR);
      expect(prisma.pullRequest.findUnique).toHaveBeenCalledWith({
        where: { repoId_number: { repoId: 'repo-1', number: 1 } },
      });
    });

    it('throws 404 when PR not found', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(null);

      await expect(service.getPR('repo-1', 999)).rejects.toThrow('Pull request not found');
    });
  });

  describe('mergePR', () => {
    it('throws 409 when PR is already merged', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue({
        id: 'pr-1',
        status: 'MERGED',
      });

      await expect(
        service.mergePR('repo-1', 1, { strategy: 'MERGE' }, { actorId: 'user-1' }),
      ).rejects.toThrow('Pull request is not open');
    });

    it('throws 404 when PR not found', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.mergePR('repo-1', 1, { strategy: 'MERGE' }, { actorId: 'user-1' }),
      ).rejects.toThrow('Pull request not found');
    });

    it('throws 401 when no actor is supplied (write access cannot be verified)', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(openPr());

      await expect(service.mergePR('repo-1', 1, { strategy: 'MERGE' })).rejects.toThrow(
        'Authentication required',
      );
      expect(prisma.pullRequest.update).not.toHaveBeenCalled();
    });

    it('refuses a non-owner, non-collaborator even with no protection rule', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(openPr());
      prisma.repository.findFirst.mockResolvedValue(ownerRepo());
      prisma.repositoryCollaborator.findMany.mockResolvedValue([]);
      prisma.branchProtection.findMany.mockResolvedValue([]);

      await expect(
        service.mergePR('repo-1', 1, { strategy: 'MERGE' }, { actorId: 'user-9' }),
      ).rejects.toThrow('write permission');
      expect(prisma.pullRequest.update).not.toHaveBeenCalled();
    });

    it('refuses a TRIAGE collaborator (read-only role cannot merge)', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(openPr());
      prisma.repository.findFirst.mockResolvedValue(ownerRepo());
      prisma.repositoryCollaborator.findMany.mockResolvedValue([
        { userId: 'user-9', role: 'TRIAGE' },
      ]);
      prisma.branchProtection.findMany.mockResolvedValue([]);

      await expect(
        service.mergePR('repo-1', 1, { strategy: 'MERGE' }, { actorId: 'user-9' }),
      ).rejects.toThrow('write permission');
      expect(prisma.pullRequest.update).not.toHaveBeenCalled();
    });

    it('blocks a protected PR with an outstanding CHANGES_REQUESTED verdict even when approvals are met', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(openPr());
      prisma.repository.findFirst.mockResolvedValue(ownerRepo());
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'bp-1', branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: false },
      ]);
      prisma.review.count.mockResolvedValue(1);
      prisma.review.findMany.mockResolvedValue([
        { reviewerId: 'user-3', status: 'CHANGES_REQUESTED', createdAt: new Date('2026-09-05') },
        { reviewerId: 'user-2', status: 'APPROVED', createdAt: new Date('2026-09-04') },
      ]);

      await expect(
        service.mergePR('repo-1', 1, { strategy: 'MERGE' }, { actorId: 'user-1' }),
      ).rejects.toThrow('changes requested');
      expect(prisma.pullRequest.update).not.toHaveBeenCalled();
    });

    it('blocks a protected PR when required approvals are not met', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(openPr());
      prisma.repository.findFirst.mockResolvedValue(ownerRepo());
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'bp-1', branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: false },
      ]);
      prisma.review.count.mockResolvedValue(0);

      await expect(
        service.mergePR('repo-1', 1, { strategy: 'MERGE' }, { actorId: 'user-1' }),
      ).rejects.toThrow('Requires 1 approval');
      expect(prisma.pullRequest.update).not.toHaveBeenCalled();
    });

    it('blocks a protected PR when required status checks have not passed', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(openPr());
      prisma.repository.findFirst.mockResolvedValue(ownerRepo());
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'bp-1', branchPattern: 'main', requiredApprovals: 0, requireStatusChecks: true },
      ]);
      prisma.ciRun.findFirst.mockResolvedValue({ status: 'PENDING' });

      await expect(
        service.mergePR('repo-1', 1, { strategy: 'MERGE' }, { actorId: 'user-1' }),
      ).rejects.toThrow('status checks have not passed');
      expect(prisma.pullRequest.update).not.toHaveBeenCalled();
    });

    it('rejects REBASE honestly instead of faking a merge', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(openPr());
      prisma.repository.findFirst.mockResolvedValue(ownerRepo());
      prisma.branchProtection.findMany.mockResolvedValue([]);

      await expect(
        service.mergePR('repo-1', 1, { strategy: 'REBASE' }, { actorId: 'user-1' }),
      ).rejects.toThrow('not supported');
      expect(prisma.pullRequest.update).not.toHaveBeenCalled();
    });

    it('refuses a merge when no git storage can be resolved, leaving the PR open', async () => {
      const base = mkdtempSync(join(tmpdir(), 'qm-legacy-merge-empty-'));
      const prev = process.env['GIT_REPOS_PATH'];
      process.env['GIT_REPOS_PATH'] = base;
      try {
        prisma.pullRequest.findUnique.mockResolvedValue(openPr());
        prisma.repository.findFirst.mockResolvedValue(ownerRepo());
        prisma.branchProtection.findMany.mockResolvedValue([]);
        prisma.branch.findUnique.mockResolvedValue(null);

        await expect(
          service.mergePR('repo-1', 1, { strategy: 'MERGE' }, { actorId: 'user-1' }),
        ).rejects.toThrow('git storage is unavailable');
        expect(prisma.pullRequest.update).not.toHaveBeenCalled();
      } finally {
        if (prev === undefined) delete process.env['GIT_REPOS_PATH'];
        else process.env['GIT_REPOS_PATH'] = prev;
        rmSync(base, { recursive: true, force: true });
      }
    });

    it('merges an open PR with MERGE strategy into a real two-parent commit', async () => {
      const { base, barePath } = makeRealRepo();
      const prev = process.env['GIT_REPOS_PATH'];
      process.env['GIT_REPOS_PATH'] = base;
      try {
        prisma.pullRequest.findUnique.mockResolvedValue(openPr());
        prisma.repository.findFirst.mockResolvedValue(ownerRepo());
        prisma.branchProtection.findMany.mockResolvedValue([]);
        prisma.branch.findUnique.mockResolvedValue(null);
        prisma.pullRequest.update.mockImplementation(async ({ data }: any) => ({
          ...openPr(),
          ...data,
        }));

        const result = await service.mergePR('repo-1', 1, { strategy: 'MERGE' }, { actorId: 'user-1' });

        expect(result.status).toBe('MERGED');
        const sha = mustSha(result.mergeCommitSha);
        // The commit really exists in the bare repo, has two parents, and the
        // target ref now points at it.
        expect(
          execFileSync('git', ['cat-file', '-t', sha], {
            cwd: barePath,
            encoding: 'utf8',
          }).trim(),
        ).toBe('commit');
        const parents = execFileSync(
          'git',
          ['rev-list', '--parents', '-n', '1', sha],
          { cwd: barePath, encoding: 'utf8' },
        )
          .trim()
          .split(/\s+/);
        expect(parents).toHaveLength(3);
        expect(
          execFileSync('git', ['rev-parse', 'refs/heads/main'], {
            cwd: barePath,
            encoding: 'utf8',
          }).trim(),
        ).toBe(sha);
        expect(prisma.pullRequest.update).toHaveBeenCalledWith({
          where: { id: 'pr-1' },
          data: expect.objectContaining({
            status: 'MERGED',
            mergeStrategy: 'MERGE',
            mergeCommitSha: sha,
          }),
        });
      } finally {
        if (prev === undefined) delete process.env['GIT_REPOS_PATH'];
        else process.env['GIT_REPOS_PATH'] = prev;
        rmSync(base, { recursive: true, force: true });
      }
    });

    it('merges with SQUASH strategy into a real single-parent commit', async () => {
      const { base, barePath } = makeRealRepo();
      const prev = process.env['GIT_REPOS_PATH'];
      process.env['GIT_REPOS_PATH'] = base;
      try {
        prisma.pullRequest.findUnique.mockResolvedValue(openPr());
        prisma.repository.findFirst.mockResolvedValue(ownerRepo());
        prisma.branchProtection.findMany.mockResolvedValue([]);
        prisma.branch.findUnique.mockResolvedValue(null);
        prisma.pullRequest.update.mockImplementation(async ({ data }: any) => ({
          ...openPr(),
          ...data,
        }));

        const result = await service.mergePR(
          'repo-1',
          1,
          { strategy: 'SQUASH' },
          { actorId: 'user-1' },
        );

        expect(result.status).toBe('MERGED');
        const sha = mustSha(result.mergeCommitSha);
        const parents = execFileSync(
          'git',
          ['rev-list', '--parents', '-n', '1', sha],
          { cwd: barePath, encoding: 'utf8' },
        )
          .trim()
          .split(/\s+/);
        expect(parents).toHaveLength(2);
        expect(
          execFileSync('git', ['rev-parse', 'refs/heads/main'], {
            cwd: barePath,
            encoding: 'utf8',
          }).trim(),
        ).toBe(sha);
      } finally {
        if (prev === undefined) delete process.env['GIT_REPOS_PATH'];
        else process.env['GIT_REPOS_PATH'] = prev;
        rmSync(base, { recursive: true, force: true });
      }
    });

    it('merges once the changes-requester later approves (latest verdict wins)', async () => {
      const { base } = makeRealRepo();
      const prev = process.env['GIT_REPOS_PATH'];
      process.env['GIT_REPOS_PATH'] = base;
      try {
        prisma.pullRequest.findUnique.mockResolvedValue(openPr());
        prisma.repository.findFirst.mockResolvedValue(ownerRepo());
        prisma.branchProtection.findMany.mockResolvedValue([
          { id: 'bp-1', branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: false },
        ]);
        prisma.review.count.mockResolvedValue(2);
        // Newest first: user-3's later APPROVED supersedes the earlier block.
        prisma.review.findMany.mockResolvedValue([
          { reviewerId: 'user-3', status: 'APPROVED', createdAt: new Date('2026-09-06') },
          { reviewerId: 'user-3', status: 'CHANGES_REQUESTED', createdAt: new Date('2026-09-05') },
          { reviewerId: 'user-2', status: 'APPROVED', createdAt: new Date('2026-09-04') },
        ]);
        prisma.branch.findUnique.mockResolvedValue(null);
        prisma.pullRequest.update.mockImplementation(async ({ data }: any) => ({
          ...openPr(),
          ...data,
        }));

        const result = await service.mergePR('repo-1', 1, { strategy: 'MERGE' }, { actorId: 'user-1' });

        expect(result.status).toBe('MERGED');
        mustSha(result.mergeCommitSha);
      } finally {
        if (prev === undefined) delete process.env['GIT_REPOS_PATH'];
        else process.env['GIT_REPOS_PATH'] = prev;
        rmSync(base, { recursive: true, force: true });
      }
    });
  });

  describe('closePR', () => {
    it('closes an open PR', async () => {
      const mockPR = { id: 'pr-1', repoId: 'repo-1', number: 1, status: 'OPEN' };
      prisma.pullRequest.findUnique.mockResolvedValue(mockPR);
      prisma.pullRequest.update.mockResolvedValue({
        ...mockPR,
        status: 'CLOSED',
        closedAt: new Date(),
      });

      const result = await service.closePR('repo-1', 1);

      expect(result.status).toBe('CLOSED');
      expect(result.closedAt).toBeInstanceOf(Date);
      expect(prisma.pullRequest.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' },
        data: {
          status: 'CLOSED',
          closedAt: expect.any(Date),
        },
      });
    });

    it('throws 404 when PR not found', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(null);

      await expect(service.closePR('repo-1', 5)).rejects.toThrow('Pull request not found');
    });
  });

  describe('getDiff', () => {
    it('returns a diff string for an existing PR', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue({
        id: 'pr-1',
        repoId: 'repo-1',
        number: 1,
      });

      const result = await service.getDiff('repo-1', 1);

      expect(result).toContain('diff --git');
      expect(result).toContain('-old line');
      expect(result).toContain('+new line');
    });

    it('throws 404 when PR not found', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(null);

      await expect(service.getDiff('repo-1', 99)).rejects.toThrow('Pull request not found');
    });
  });
});
