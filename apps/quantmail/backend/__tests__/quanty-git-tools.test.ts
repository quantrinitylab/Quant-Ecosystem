// ============================================================================
// Unit tests for Quanty Git Tools
// ============================================================================
// The tools take an injected prisma client, so tests run fully offline with
// a hand-rolled mock — no database required.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GIT_TOOLS,
  registerGitTools,
  createGitToolContext,
  type QuantyTool,
  type QuantyToolContext,
  type GitToolsPrisma,
} from '../services/quanty-agent/tools/git-tools';

function createMockPrisma(overrides: Partial<GitToolsPrisma> = {}): GitToolsPrisma {
  const noop = vi.fn();
  return {
    repository: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    branch: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    pullRequest: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    issue: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    ciRun: { findMany: vi.fn().mockResolvedValue([]) },
    review: { count: vi.fn().mockResolvedValue(0) },
    auditLog: { create: noop.mockResolvedValue({ id: 'audit-1' }) },
    ...overrides,
  } as unknown as GitToolsPrisma;
}

const REPO = {
  id: 'repo-1',
  ownerId: 'user-1',
  name: 'demo',
  description: 'Demo repo',
  visibility: 'PRIVATE',
  defaultBranch: 'main',
  storagePathUrl: null,
  starCount: 5,
  forkCount: 2,
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};

function ctxWithRepo(prisma?: GitToolsPrisma): { ctx: QuantyToolContext; prisma: GitToolsPrisma } {
  const p = prisma ?? createMockPrisma();
  (p.repository.findFirst as any).mockResolvedValue({ ...REPO, deletedAt: null });
  return { ctx: createGitToolContext('user-1', p), prisma: p };
}

function tool(name: string): QuantyTool {
  const t = GIT_TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

describe('Quanty Git Tools', () => {
  describe('registry', () => {
    it('exposes all 11 tools', () => {
      const names = GIT_TOOLS.map((t) => t.name).sort();
      expect(names).toEqual(
        [
          'close_issue',
          'create_issue',
          'create_repo',
          'get_pr_diff',
          'get_repo_stats',
          'list_actions',
          'list_issues',
          'list_prs',
          'list_repos',
          'merge_pr',
          'summarize_pr',
        ].sort(),
      );
    });

    it('registers every tool with a compatible registry', () => {
      const registered: QuantyTool[] = [];
      const tools = registerGitTools({ register: (t) => registered.push(t) });
      expect(registered).toHaveLength(11);
      expect(tools).toHaveLength(11);
    });

    it('marks only merge_pr as destructive + needsConfirm', () => {
      const destructive = GIT_TOOLS.filter((t) => t.destructive);
      expect(destructive.map((t) => t.name)).toEqual(['merge_pr']);
      expect(tool('merge_pr').needsConfirm).toBe(true);
      for (const t of GIT_TOOLS) {
        if (t.name !== 'merge_pr') expect(t.needsConfirm).toBe(false);
      }
    });

    it('every tool has name, description and JSON-schema parameters', () => {
      for (const t of GIT_TOOLS) {
        expect(t.name).toMatch(/^[a-z_]+$/);
        expect(t.description.length).toBeGreaterThan(10);
        for (const [pname, p] of Object.entries(t.parameters)) {
          expect(p.type, `${t.name}.${pname}`).toBeTruthy();
          expect(typeof p.required, `${t.name}.${pname}`).toBe('boolean');
        }
      }
    });
  });

  describe('list_repos', () => {
    it('returns the user repos', async () => {
      const { ctx, prisma } = ctxWithRepo();
      (prisma.repository.findMany as any).mockResolvedValue([{ ...REPO }]);
      const res = await tool('list_repos').handler({}, ctx);
      expect(res.success).toBe(true);
      expect((res.data as any[])).toHaveLength(1);
      expect((res.data as any[])[0].name).toBe('demo');
      expect(res.message).toContain('1 repository');
    });

    it('rejects unauthenticated calls', async () => {
      const res = await tool('list_repos').handler({}, createGitToolContext('', createMockPrisma()));
      expect(res.success).toBe(false);
    });
  });

  describe('create_repo', () => {
    it('creates a repository', async () => {
      const { ctx, prisma } = ctxWithRepo();
      (prisma.repository.findFirst as any).mockResolvedValue(null); // no duplicate
      (prisma.repository.create as any).mockImplementation(async (a: any) => ({ id: 'repo-2', ...a.data }));
      (prisma.branch.upsert as any).mockResolvedValue({});
      const res = await tool('create_repo').handler({ name: 'new-repo', private: true }, ctx);
      expect(res.success).toBe(true);
      expect((res.data as any).name).toBe('new-repo');
      expect(prisma.repository.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('rejects duplicate names', async () => {
      const { ctx } = ctxWithRepo(); // findFirst returns REPO by default
      const res = await tool('create_repo').handler({ name: 'demo' }, ctx);
      expect(res.success).toBe(false);
      expect(res.message).toContain('already exists');
    });

    it('rejects invalid names', async () => {
      const { ctx } = ctxWithRepo();
      const res = await tool('create_repo').handler({ name: 'bad name!' }, ctx);
      expect(res.success).toBe(false);
    });

    it('requires a name', async () => {
      const { ctx } = ctxWithRepo();
      const res = await tool('create_repo').handler({}, ctx);
      expect(res.success).toBe(false);
    });
  });

  describe('list_prs', () => {
    it('lists PRs with state filter', async () => {
      const { ctx, prisma } = ctxWithRepo();
      (prisma.pullRequest.findMany as any).mockResolvedValue([
        { number: 3, title: 'Fix bug', status: 'OPEN', sourceBranch: 'fix', targetBranch: 'main', createdAt: new Date() },
      ]);
      const res = await tool('list_prs').handler({ repo: 'demo', state: 'open' }, ctx);
      expect(res.success).toBe(true);
      expect((res.data as any[])[0].number).toBe(3);
      expect(prisma.pullRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'OPEN' }) }),
      );
    });

    it('rejects invalid state', async () => {
      const { ctx } = ctxWithRepo();
      const res = await tool('list_prs').handler({ repo: 'demo', state: 'bogus' }, ctx);
      expect(res.success).toBe(false);
    });

    it('fails for unknown repo', async () => {
      const prisma = createMockPrisma();
      const res = await tool('list_prs').handler({ repo: 'nope' }, createGitToolContext('user-1', prisma));
      expect(res.success).toBe(false);
      expect(res.message).toContain('not found');
    });
  });

  describe('get_pr_diff', () => {
    it('returns diff stats for a PR', async () => {
      const { ctx, prisma } = ctxWithRepo();
      (prisma.pullRequest.findFirst as any).mockResolvedValue({
        id: 'pr-1',
        number: 3,
        title: 'Fix bug',
        status: 'OPEN',
        sourceBranch: 'fix',
        targetBranch: 'main',
      });
      const res = await tool('get_pr_diff').handler({ repo: 'demo', prNumber: 3 }, ctx);
      expect(res.success).toBe(true);
      expect((res.data as any).number).toBe(3);
      expect((res.data as any)).toHaveProperty('files');
      expect((res.data as any)).toHaveProperty('additions');
    });

    it('fails for missing PR', async () => {
      const { ctx } = ctxWithRepo();
      const res = await tool('get_pr_diff').handler({ repo: 'demo', prNumber: 99 }, ctx);
      expect(res.success).toBe(false);
    });
  });

  describe('merge_pr', () => {
    it('merges an open PR', async () => {
      const { ctx, prisma } = ctxWithRepo();
      const pr = {
        id: 'pr-1',
        number: 3,
        title: 'Fix bug',
        status: 'OPEN',
        sourceBranch: 'fix',
        targetBranch: 'main',
        authorId: 'user-1',
      };
      (prisma.pullRequest.findFirst as any).mockResolvedValue(pr);
      (prisma.pullRequest.update as any).mockImplementation(async (a: any) => ({ ...pr, ...a.data }));
      (prisma.branch.upsert as any).mockResolvedValue({});
      const res = await tool('merge_pr').handler({ repo: 'demo', prNumber: 3 }, ctx);
      expect(res.success).toBe(true);
      expect((res.data as any).number).toBe(3);
      expect(prisma.pullRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'MERGED' }) }),
      );
    });

    it('refuses already-merged PRs', async () => {
      const { ctx, prisma } = ctxWithRepo();
      (prisma.pullRequest.findFirst as any).mockResolvedValue({
        id: 'pr-1',
        number: 3,
        status: 'MERGED',
        sourceBranch: 'fix',
        targetBranch: 'main',
      });
      const res = await tool('merge_pr').handler({ repo: 'demo', prNumber: 3 }, ctx);
      expect(res.success).toBe(false);
      expect(res.message).toContain('already merged');
    });

    it('enforces branch protection approvals', async () => {
      const prisma = createMockPrisma({
        branchProtection: { findFirst: vi.fn().mockResolvedValue({ requiredApprovals: 2, requireStatusChecks: false }) },
      });
      (prisma.repository.findFirst as any).mockResolvedValue({ ...REPO, deletedAt: null });
      (prisma.pullRequest.findFirst as any).mockResolvedValue({
        id: 'pr-1',
        number: 3,
        status: 'OPEN',
        sourceBranch: 'fix',
        targetBranch: 'main',
        authorId: 'user-2',
      });
      (prisma.review.count as any).mockResolvedValue(1);
      const res = await tool('merge_pr').handler(
        { repo: 'demo', prNumber: 3 },
        createGitToolContext('user-1', prisma),
      );
      expect(res.success).toBe(false);
      expect(res.message).toContain('approval');
    });

    it('denies write without permission', async () => {
      const prisma = createMockPrisma();
      (prisma.repository.findFirst as any).mockResolvedValue({
        ...REPO,
        ownerId: 'other-user',
        visibility: 'PUBLIC',
        deletedAt: null,
      });
      const res = await tool('merge_pr').handler(
        { repo: 'demo', prNumber: 3 },
        createGitToolContext('user-1', prisma),
      );
      expect(res.success).toBe(false);
      expect(res.message).toContain('write permission');
    });
  });

  describe('create_issue', () => {
    it('creates an issue with the next number', async () => {
      const { ctx, prisma } = ctxWithRepo();
      (prisma.issue.findFirst as any).mockResolvedValue({ number: 7 });
      (prisma.issue.create as any).mockImplementation(async (a: any) => ({ id: 'issue-1', ...a.data }));
      const res = await tool('create_issue').handler(
        { repo: 'demo', title: 'Bug report', body: 'Steps...', labels: 'bug,ui' },
        ctx,
      );
      expect(res.success).toBe(true);
      expect((res.data as any).number).toBe(8);
      expect((res.data as any).labels).toEqual(['bug', 'ui']);
    });

    it('requires a title', async () => {
      const { ctx } = ctxWithRepo();
      const res = await tool('create_issue').handler({ repo: 'demo', title: '  ' }, ctx);
      expect(res.success).toBe(false);
    });
  });

  describe('list_issues', () => {
    it('lists issues with state filter', async () => {
      const { ctx, prisma } = ctxWithRepo();
      (prisma.issue.findMany as any).mockResolvedValue([
        { number: 1, title: 'Bug', status: 'OPEN', labels: ['bug'], createdAt: new Date() },
      ]);
      const res = await tool('list_issues').handler({ repo: 'demo', state: 'open' }, ctx);
      expect(res.success).toBe(true);
      expect((res.data as any[])[0].state).toBe('open');
    });
  });

  describe('close_issue', () => {
    it('closes an open issue', async () => {
      const { ctx, prisma } = ctxWithRepo();
      (prisma.issue.findFirst as any).mockResolvedValue({
        id: 'issue-1',
        number: 4,
        status: 'OPEN',
        authorId: 'user-1',
      });
      (prisma.issue.update as any).mockImplementation(async (a: any) => ({ number: 4, ...a.data }));
      const res = await tool('close_issue').handler({ repo: 'demo', issueNumber: 4 }, ctx);
      expect(res.success).toBe(true);
      expect((res.data as any).state).toBe('closed');
      expect(prisma.issue.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CLOSED' }) }),
      );
    });

    it('refuses already-closed issues', async () => {
      const { ctx, prisma } = ctxWithRepo();
      (prisma.issue.findFirst as any).mockResolvedValue({
        id: 'issue-1',
        number: 4,
        status: 'CLOSED',
        authorId: 'user-1',
      });
      const res = await tool('close_issue').handler({ repo: 'demo', issueNumber: 4 }, ctx);
      expect(res.success).toBe(false);
    });
  });

  describe('list_actions', () => {
    it('lists workflow runs', async () => {
      const { ctx, prisma } = ctxWithRepo();
      (prisma.ciRun.findMany as any).mockResolvedValue([
        {
          id: 'run-1',
          branch: 'main',
          commitSha: 'abcdef1234567890',
          status: 'SUCCESS',
          triggeredBy: 'user-1',
          createdAt: new Date(),
          completedAt: new Date(),
        },
      ]);
      const res = await tool('list_actions').handler({ repo: 'demo' }, ctx);
      expect(res.success).toBe(true);
      expect((res.data as any[])[0].status).toBe('success');
      expect((res.data as any[])[0].commitSha).toBe('abcdef1');
    });
  });

  describe('get_repo_stats', () => {
    it('returns aggregated stats', async () => {
      const { ctx, prisma } = ctxWithRepo();
      (prisma.pullRequest.count as any).mockImplementation(async (a: any) =>
        a.where.status === 'OPEN' ? 2 : 5,
      );
      (prisma.issue.count as any).mockImplementation(async (a: any) =>
        a.where.status === 'OPEN' ? 3 : 1,
      );
      (prisma.pullRequest.findFirst as any).mockResolvedValue({ updatedAt: new Date('2026-10-02') });
      (prisma.issue.findFirst as any).mockResolvedValue({ updatedAt: new Date('2026-10-03') });
      (prisma.branch.findMany as any).mockResolvedValue([
        { name: 'main', commitSha: 'abc123def456' },
        { name: 'fix', commitSha: '0000000000000000000000000000000000000000' },
      ]);
      const res = await tool('get_repo_stats').handler({ repo: 'demo' }, ctx);
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.stars).toBe(5);
      expect(data.openPullRequests).toBe(2);
      expect(data.openIssues).toBe(3);
      expect(data.branchCount).toBe(2);
      expect(data.lastCommitSha).toBe('abc123d');
    });
  });

  describe('summarize_pr', () => {
    it('produces a structured summary', async () => {
      const { ctx, prisma } = ctxWithRepo();
      (prisma.pullRequest.findFirst as any).mockResolvedValue({
        id: 'pr-1',
        number: 3,
        title: 'Add feature',
        body: 'Implements X',
        status: 'OPEN',
        sourceBranch: 'feat',
        targetBranch: 'main',
      });
      const res = await tool('summarize_pr').handler({ repo: 'demo', prNumber: 3 }, ctx);
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.number).toBe(3);
      expect(data.size).toMatch(/small|medium|large/);
      expect(data.summary).toContain('PR #3');
    });

    it('fails for missing PR', async () => {
      const { ctx } = ctxWithRepo();
      const res = await tool('summarize_pr').handler({ repo: 'demo', prNumber: 42 }, ctx);
      expect(res.success).toBe(false);
    });
  });

  describe('audit logging', () => {
    it('logs tool actions and never fails the tool when logging throws', async () => {
      const prisma = createMockPrisma();
      (prisma.repository.findMany as any).mockResolvedValue([]);
      (prisma.auditLog.create as any).mockRejectedValue(new Error('db down'));
      const res = await tool('list_repos').handler(
        {},
        createGitToolContext('user-1', prisma),
      );
      expect(res.success).toBe(true);
    });
  });
});
