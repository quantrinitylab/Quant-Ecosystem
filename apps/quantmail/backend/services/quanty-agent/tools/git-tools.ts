// ============================================================================
// Quanty Git Tools — agentic Git operations for QuantGit
// ============================================================================
// These tools power the agentic Quanty: they operate on the REAL backend
// (Prisma + git), never on mock/fixture data. Every handler:
//   - is scoped to the calling userId (read vs write permission checks)
//   - returns a structured { success, data, message } result
//   - logs the action to the audit trail (best-effort, never throws)
//
// Tool safety flags:
//   - destructive: true  -> irreversible-ish, the agent layer must confirm
//                              with the user before calling
//   - reversible: true   -> can be undone (e.g. reopen an issue)
//   - needsConfirm: true -> destructive tools always need confirmation
// ============================================================================

import { prisma as defaultPrisma } from '@quant/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal Prisma surface the git tools need (injectable for tests). */
export interface GitToolsPrisma {
  repository: {
    findMany: (args: any) => Promise<any[]>;
    findFirst: (args: any) => Promise<any | null>;
    findUnique: (args: any) => Promise<any | null>;
    create: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
    count: (args: any) => Promise<number>;
  };
  branch: {
    findUnique: (args: any) => Promise<any | null>;
    findMany: (args: any) => Promise<any[]>;
    update: (args: any) => Promise<any>;
    upsert: (args: any) => Promise<any>;
  };
  pullRequest: {
    findFirst: (args: any) => Promise<any | null>;
    findMany: (args: any) => Promise<any[]>;
    create: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
    count: (args: any) => Promise<number>;
  };
  issue: {
    findFirst: (args: any) => Promise<any | null>;
    findMany: (args: any) => Promise<any[]>;
    create: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
    count: (args: any) => Promise<number>;
  };
  ciRun: {
    findMany: (args: any) => Promise<any[]>;
  };
  review: {
    count: (args: any) => Promise<number>;
  };
  branchProtection?: {
    findFirst: (args: any) => Promise<any | null>;
  };
  repositoryCollaborator?: {
    findFirst: (args: any) => Promise<any | null>;
  };
  auditLog: {
    create: (args: any) => Promise<any>;
  };
}

export interface QuantyToolContext {
  userId: string;
  prisma: GitToolsPrisma;
}

export interface QuantyToolResult {
  success: boolean;
  data?: unknown;
  /** Human-readable summary for the agent to narrate. */
  message: string;
  error?: string;
}

export interface QuantyToolParameter {
  type: string;
  description: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

export interface QuantyTool {
  name: string;
  description: string;
  parameters: Record<string, QuantyToolParameter>;
  /** True when the action is hard/impossible to undo (merge, delete). */
  destructive: boolean;
  /** True when the action can be cleanly undone (close -> reopen). */
  reversible: boolean;
  /** True when the agent layer must ask the user before calling. */
  needsConfirm: boolean;
  handler: (params: Record<string, unknown>, ctx: QuantyToolContext) => Promise<QuantyToolResult>;
}

export interface QuantyToolRegistry {
  register(tool: QuantyTool): void;
}

export interface GitToolsDeps {
  prisma?: GitToolsPrisma;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(data: unknown, message: string): QuantyToolResult {
  return { success: true, data, message };
}

function fail(error: string): QuantyToolResult {
  return { success: false, message: error, error };
}

function requireUserId(ctx: QuantyToolContext): string {
  if (!ctx.userId) throw new Error('Not authenticated');
  return ctx.userId;
}

/** Best-effort audit logging — never throws, never blocks the tool. */
async function logToolAction(
  ctx: QuantyToolContext,
  toolName: string,
  resource: string,
  resourceId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await ctx.prisma.auditLog.create({
      data: {
        userId: ctx.userId,
        action: `quanty.git.${toolName}`,
        resource,
        resourceId,
        metadata: { ...metadata, agent: 'quanty' },
      },
    });
  } catch {
    // Audit logging is best-effort; a logging failure must not fail the tool.
  }
}

interface RepoRef {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  visibility: string;
  defaultBranch: string;
  storagePathUrl: string | null;
  starCount: number;
  forkCount: number;
}

/**
 * Resolve a repository by id or name, scoped to the calling user.
 * Mirrors the permission logic of the repos.ts route layer:
 *   - id lookup, then name lookup (own repos, then public/internal repos)
 *   - private repos of other users are invisible (treated as not found)
 */
async function resolveRepo(
  ctx: QuantyToolContext,
  repoRef: string,
  opts: { writable?: boolean } = {},
): Promise<RepoRef> {
  const userId = requireUserId(ctx);
  const prisma = ctx.prisma;

  let repo: any =
    (await prisma.repository.findFirst({
      where: { id: repoRef, deletedAt: null },
    })) ?? null;

  if (!repo) {
    repo =
      (await prisma.repository.findFirst({
        where: { name: repoRef, ownerId: userId, deletedAt: null },
      })) ?? null;
  }

  if (!repo) {
    repo =
      (await prisma.repository.findFirst({
        where: {
          name: repoRef,
          visibility: { in: ['PUBLIC', 'INTERNAL'] },
          deletedAt: null,
        },
      })) ?? null;
  }

  if (!repo) return Promise.reject(new Error('Repository not found'));

  if (repo.ownerId !== userId && String(repo.visibility).toUpperCase() === 'PRIVATE') {
    // Private repos of other users are invisible unless a collaboration grants access.
    const collab = prisma.repositoryCollaborator
      ? await prisma.repositoryCollaborator.findFirst({
          where: { repositoryId: repo.id, userId },
        })
      : null;
    if (!collab) return Promise.reject(new Error('Repository not found'));
  }

  if (opts.writable && repo.ownerId !== userId) {
    const collab = prisma.repositoryCollaborator
      ? await prisma.repositoryCollaborator.findFirst({
          where: { repositoryId: repo.id, userId },
        })
      : null;
    const role = collab ? String((collab as any).role ?? '').toUpperCase() : '';
    const canWrite = ['OWNER', 'ADMIN', 'MAINTAIN', 'WRITE'].includes(role);
    if (!canWrite) {
      return Promise.reject(new Error('You do not have write permission for this repository'));
    }
  }

  return repo as RepoRef;
}

function repoSummary(r: any): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    visibility: String(r.visibility ?? 'PUBLIC').toLowerCase(),
    stars: r.starCount ?? 0,
    forks: r.forkCount ?? 0,
    defaultBranch: r.defaultBranch ?? 'main',
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
  };
}

/** Parse a unified diff into per-file stats. */
function parseDiffStats(diffText: string): Array<{
  file: string;
  additions: number;
  deletions: number;
}> {
  const files: Array<{ file: string; additions: number; deletions: number }> = [];
  let current: { file: string; additions: number; deletions: number } | null = null;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/diff --git a\/(.*?) b\//);
      if (current) files.push(current);
      current = { file: m ? m[1] : 'unknown', additions: 0, deletions: 0 };
    } else if (current) {
      if (line.startsWith('+') && !line.startsWith('+++')) current.additions += 1;
      else if (line.startsWith('-') && !line.startsWith('---')) current.deletions += 1;
    }
  }
  if (current) files.push(current);
  return files;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

const listReposTool: QuantyTool = {
  name: 'list_repos',
  description: "List the user's repositories (name, description, stars, last updated).",
  parameters: {
    limit: {
      type: 'number',
      description: 'Maximum number of repositories to return',
      required: false,
      default: 20,
    },
    includePublic: {
      type: 'boolean',
      description: 'Also include public repositories owned by other users',
      required: false,
      default: false,
    },
  },
  destructive: false,
  reversible: false,
  needsConfirm: false,
  handler: async (params, ctx) => {
    const userId = ctx.userId;
    if (!userId) return fail('Not authenticated.');
    const limit = Math.min(Math.max(Number(params['limit'] ?? 20) || 20, 1), 100);
    const includePublic = params['includePublic'] === true;

    const where: any = includePublic
      ? { OR: [{ ownerId: userId }, { visibility: { in: ['PUBLIC', 'INTERNAL'] } }], deletedAt: null }
      : { ownerId: userId, deletedAt: null };

    const repos = await ctx.prisma.repository.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    await logToolAction(ctx, 'list_repos', 'repository', null, { count: repos.length });
    const data = repos.map(repoSummary);
    return ok(data, `Found ${data.length} repositor${data.length === 1 ? 'y' : 'ies'}.`);
  },
};

const createRepoTool: QuantyTool = {
  name: 'create_repo',
  description: 'Create a new repository for the user.',
  parameters: {
    name: { type: 'string', description: 'Repository name (unique per user)', required: true },
    description: { type: 'string', description: 'Repository description', required: false },
    private: {
      type: 'boolean',
      description: 'Make the repository private (default true)',
      required: false,
      default: true,
    },
  },
  destructive: false,
  reversible: true,
  needsConfirm: false,
  handler: async (params, ctx) => {
    const userId = ctx.userId;
    if (!userId) return fail('Not authenticated.');
    const name = String(params['name'] ?? '').trim();
    if (!name) return fail('Repository name is required.');
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      return fail('Repository name may only contain letters, numbers, dots, dashes and underscores.');
    }

    const existing = await ctx.prisma.repository.findFirst({
      where: { ownerId: userId, name, deletedAt: null },
    });
    if (existing) return fail(`A repository named "${name}" already exists.`);

    const repo = await ctx.prisma.repository.create({
      data: {
        ownerId: userId,
        name,
        description: params['description'] ? String(params['description']) : null,
        visibility: params['private'] === false ? 'PUBLIC' : 'PRIVATE',
        defaultBranch: 'main',
      },
    });

    await ctx.prisma.branch.upsert({
      where: { repoId_name: { repoId: repo.id, name: 'main' } },
      update: {},
      create: {
        repoId: repo.id,
        name: 'main',
        commitSha: '0000000000000000000000000000000000000000',
      },
    });

    await logToolAction(ctx, 'create_repo', 'repository', repo.id, { name });
    return ok(repoSummary(repo), `Repository "${name}" created.`);
  },
};

const PR_STATES = ['open', 'closed', 'merged'] as const;

const listPrsTool: QuantyTool = {
  name: 'list_prs',
  description: 'List pull requests for a repository, optionally filtered by state.',
  parameters: {
    repo: {
      type: 'string',
      description: 'Repository id or name',
      required: true,
    },
    state: {
      type: 'string',
      description: 'Filter by PR state',
      required: false,
      enum: ['open', 'closed', 'merged'],
    },
    limit: { type: 'number', description: 'Maximum PRs to return', required: false, default: 20 },
  },
  destructive: false,
  reversible: false,
  needsConfirm: false,
  handler: async (params, ctx) => {
    let repo: RepoRef;
    try {
      repo = await resolveRepo(ctx, String(params['repo'] ?? ''));
    } catch (e: any) {
      return fail(e.message);
    }

    const state = String(params['state'] ?? '').toLowerCase();
    const where: any = { repoId: repo.id };
    if (state === 'open') where.status = 'OPEN';
    else if (state === 'closed') where.status = 'CLOSED';
    else if (state === 'merged') where.status = 'MERGED';
    else if (state && !(PR_STATES as readonly string[]).includes(state)) {
      return fail(`Invalid state "${state}". Use one of: open, closed, merged.`);
    }

    const limit = Math.min(Math.max(Number(params['limit'] ?? 20) || 20, 1), 100);
    const prs = await ctx.prisma.pullRequest.findMany({
      where,
      orderBy: { number: 'desc' },
      take: limit,
    });

    const data = prs.map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      state: String(pr.status).toLowerCase(),
      sourceBranch: pr.sourceBranch,
      targetBranch: pr.targetBranch,
      mergedAt: pr.mergedAt ? new Date(pr.mergedAt).toISOString() : null,
      createdAt: pr.createdAt ? new Date(pr.createdAt).toISOString() : null,
    }));
    await logToolAction(ctx, 'list_prs', 'repository', repo.id, {
      state: state || 'all',
      count: data.length,
    });
    return ok(data, `Found ${data.length} pull request${data.length === 1 ? '' : 's'} in ${repo.name}.`);
  },
};

const getPrDiffTool: QuantyTool = {
  name: 'get_pr_diff',
  description: 'Get the diff for a pull request (per-file additions/deletions).',
  parameters: {
    repo: { type: 'string', description: 'Repository id or name', required: true },
    prNumber: { type: 'number', description: 'Pull request number', required: true },
  },
  destructive: false,
  reversible: false,
  needsConfirm: false,
  handler: async (params, ctx) => {
    let repo: RepoRef;
    try {
      repo = await resolveRepo(ctx, String(params['repo'] ?? ''));
    } catch (e: any) {
      return fail(e.message);
    }
    const prNumber = Number(params['prNumber']);
    if (!Number.isInteger(prNumber) || prNumber < 1) return fail('A valid PR number is required.');

    const pr = await ctx.prisma.pullRequest.findFirst({
      where: { repoId: repo.id, number: prNumber },
    });
    if (!pr) return fail(`Pull request #${prNumber} not found in ${repo.name}.`);

    // Compute the diff from the bare git repo when present, mirroring the
    // repos.ts diff endpoint. Falls back to an empty diff when no git data.
    let diffText = '';
    try {
      const { resolveGitDiff } = await import('./git-helpers');
      diffText = await resolveGitDiff(ctx.prisma, repo, pr);
    } catch {
      diffText = '';
    }

    const files = parseDiffStats(diffText);
    const additions = files.reduce((s, f) => s + f.additions, 0);
    const deletions = files.reduce((s, f) => s + f.deletions, 0);

    await logToolAction(ctx, 'get_pr_diff', 'pull_request', pr.id, {
      repoId: repo.id,
      number: prNumber,
      files: files.length,
    });
    return ok(
      {
        number: pr.number,
        title: pr.title,
        state: String(pr.status).toLowerCase(),
        sourceBranch: pr.sourceBranch,
        targetBranch: pr.targetBranch,
        files,
        additions,
        deletions,
        changedFiles: files.length,
        diff: diffText.length > 20000 ? diffText.slice(0, 20000) + '\n…(truncated)' : diffText,
      },
      `PR #${prNumber}: ${files.length} files changed, +${additions}/-${deletions}.`,
    );
  },
};

const mergePrTool: QuantyTool = {
  name: 'merge_pr',
  description:
    'Merge an open pull request into its target branch. Respects branch protection rules (approvals, status checks) and fails on merge conflicts.',
  parameters: {
    repo: { type: 'string', description: 'Repository id or name', required: true },
    prNumber: { type: 'number', description: 'Pull request number', required: true },
    strategy: {
      type: 'string',
      description: 'Merge strategy',
      required: false,
      enum: ['merge', 'squash', 'rebase'],
      default: 'merge',
    },
  },
  destructive: true,
  reversible: false,
  needsConfirm: true,
  handler: async (params, ctx) => {
    const userId = ctx.userId;
    if (!userId) return fail('Not authenticated.');
    let repo: RepoRef;
    try {
      repo = await resolveRepo(ctx, String(params['repo'] ?? ''), { writable: true });
    } catch (e: any) {
      return fail(e.message);
    }
    const prNumber = Number(params['prNumber']);
    if (!Number.isInteger(prNumber) || prNumber < 1) return fail('A valid PR number is required.');

    const pr = await ctx.prisma.pullRequest.findFirst({
      where: { repoId: repo.id, number: prNumber },
    });
    if (!pr) return fail(`Pull request #${prNumber} not found in ${repo.name}.`);
    if (pr.status === 'MERGED') return fail(`Pull request #${prNumber} is already merged.`);
    if (pr.status !== 'OPEN') return fail(`Pull request #${prNumber} is ${String(pr.status).toLowerCase()}, not open.`);

    // Branch protection: approvals + status checks (mirrors repos.ts route logic).
    if (ctx.prisma.branchProtection) {
      const rule = await ctx.prisma.branchProtection.findFirst({
        where: { repoId: repo.id, branchPattern: pr.targetBranch },
      });
      if (rule) {
        if ((rule.requiredApprovals ?? 0) > 0) {
          const approved = await ctx.prisma.review.count({
            where: { prId: pr.id, status: 'APPROVED', reviewerId: { not: pr.authorId } },
          });
          if (approved < rule.requiredApprovals) {
            return fail(
              `Branch "${pr.targetBranch}" requires ${rule.requiredApprovals} approval(s); only ${approved} present.`,
            );
          }
        }
        if (rule.requireStatusChecks) {
          const latestCi = await ctx.prisma.ciRun.findMany({
            where: { repoId: repo.id, branch: pr.sourceBranch },
            orderBy: { createdAt: 'desc' },
            take: 1,
          });
          if (!latestCi[0] || String(latestCi[0].status).toUpperCase() !== 'SUCCESS') {
            return fail(`Branch "${pr.targetBranch}" requires passing status checks.`);
          }
        }
      }
    }

    // Perform the git-level merge when a bare repo is present, otherwise
    // record the merge at the Prisma level.
    let mergeCommitSha: string;
    try {
      const { performGitMerge } = await import('./git-helpers');
      mergeCommitSha = await performGitMerge(ctx.prisma, repo, pr);
    } catch (e: any) {
      if (e && (e as any).code === 'MERGE_CONFLICT') {
        return fail(`Merge conflict detected for PR #${prNumber}. Resolve conflicts and retry.`);
      }
      return fail(`Merge failed: ${(e as Error).message}`);
    }

    const mergedAt = new Date();
    await ctx.prisma.pullRequest.update({
      where: { id: pr.id },
      data: { status: 'MERGED', mergedAt, mergeCommitSha },
    });

    await ctx.prisma.branch.upsert({
      where: { repoId_name: { repoId: repo.id, name: pr.targetBranch } },
      update: { commitSha: mergeCommitSha },
      create: { repoId: repo.id, name: pr.targetBranch, commitSha: mergeCommitSha },
    });

    await logToolAction(ctx, 'merge_pr', 'pull_request', pr.id, {
      repoId: repo.id,
      number: prNumber,
      mergeCommitSha,
      mergedBy: userId,
      strategy: params['strategy'] ?? 'merge',
    });
    return ok(
      { number: prNumber, mergeCommitSha, mergedAt: mergedAt.toISOString() },
      `Pull request #${prNumber} merged into ${pr.targetBranch} (${mergeCommitSha.slice(0, 7)}).`,
    );
  },
};

const createIssueTool: QuantyTool = {
  name: 'create_issue',
  description: 'Create an issue in a repository.',
  parameters: {
    repo: { type: 'string', description: 'Repository id or name', required: true },
    title: { type: 'string', description: 'Issue title', required: true },
    body: { type: 'string', description: 'Issue body (markdown)', required: false },
    labels: {
      type: 'string',
      description: 'Comma-separated labels (e.g. "bug,ui")',
      required: false,
    },
  },
  destructive: false,
  reversible: true,
  needsConfirm: false,
  handler: async (params, ctx) => {
    const userId = ctx.userId;
    if (!userId) return fail('Not authenticated.');
    let repo: RepoRef;
    try {
      repo = await resolveRepo(ctx, String(params['repo'] ?? ''), { writable: true });
    } catch (e: any) {
      return fail(e.message);
    }
    const title = String(params['title'] ?? '').trim();
    if (!title) return fail('Issue title is required.');

    const latest = await ctx.prisma.issue.findFirst({
      where: { repoId: repo.id },
      orderBy: { number: 'desc' },
    });
    const nextNumber = (latest?.number ?? 0) + 1;
    const labels = params['labels']
      ? String(params['labels'])
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean)
      : [];

    const issue = await ctx.prisma.issue.create({
      data: {
        repoId: repo.id,
        number: nextNumber,
        title,
        body: params['body'] ? String(params['body']) : '',
        authorId: userId,
        labels,
        assignees: [],
        status: 'OPEN',
      },
    });

    await logToolAction(ctx, 'create_issue', 'issue', issue.id, {
      repoId: repo.id,
      number: nextNumber,
      title,
    });
    return ok(
      { number: nextNumber, title, state: 'open', labels },
      `Issue #${nextNumber} "${title}" created in ${repo.name}.`,
    );
  },
};

const listIssuesTool: QuantyTool = {
  name: 'list_issues',
  description: 'List issues for a repository, optionally filtered by state.',
  parameters: {
    repo: { type: 'string', description: 'Repository id or name', required: true },
    state: {
      type: 'string',
      description: 'Filter by issue state',
      required: false,
      enum: ['open', 'closed'],
    },
    limit: { type: 'number', description: 'Maximum issues to return', required: false, default: 20 },
  },
  destructive: false,
  reversible: false,
  needsConfirm: false,
  handler: async (params, ctx) => {
    let repo: RepoRef;
    try {
      repo = await resolveRepo(ctx, String(params['repo'] ?? ''));
    } catch (e: any) {
      return fail(e.message);
    }

    const state = String(params['state'] ?? '').toLowerCase();
    const where: any = { repoId: repo.id };
    if (state === 'open') where.status = 'OPEN';
    else if (state === 'closed') where.status = 'CLOSED';
    else if (state) return fail(`Invalid state "${state}". Use one of: open, closed.`);

    const limit = Math.min(Math.max(Number(params['limit'] ?? 20) || 20, 1), 100);
    const issues = await ctx.prisma.issue.findMany({
      where,
      orderBy: { number: 'desc' },
      take: limit,
    });

    const data = issues.map((i: any) => ({
      number: i.number,
      title: i.title,
      state: String(i.status).toLowerCase(),
      labels: Array.isArray(i.labels) ? i.labels : [],
      createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : null,
    }));
    await logToolAction(ctx, 'list_issues', 'repository', repo.id, {
      state: state || 'all',
      count: data.length,
    });
    return ok(data, `Found ${data.length} issue${data.length === 1 ? '' : 's'} in ${repo.name}.`);
  },
};

const closeIssueTool: QuantyTool = {
  name: 'close_issue',
  description: 'Close an open issue. Reversible — the issue can be reopened.',
  parameters: {
    repo: { type: 'string', description: 'Repository id or name', required: true },
    issueNumber: { type: 'number', description: 'Issue number', required: true },
  },
  destructive: false,
  reversible: true,
  needsConfirm: false,
  handler: async (params, ctx) => {
    const userId = ctx.userId;
    if (!userId) return fail('Not authenticated.');
    let repo: RepoRef;
    try {
      repo = await resolveRepo(ctx, String(params['repo'] ?? ''), { writable: true });
    } catch (e: any) {
      return fail(e.message);
    }
    const issueNumber = Number(params['issueNumber']);
    if (!Number.isInteger(issueNumber) || issueNumber < 1) return fail('A valid issue number is required.');

    const issue = await ctx.prisma.issue.findFirst({
      where: { repoId: repo.id, number: issueNumber },
    });
    if (!issue) return fail(`Issue #${issueNumber} not found in ${repo.name}.`);
    if (issue.status === 'CLOSED') return fail(`Issue #${issueNumber} is already closed.`);

    // Only the repo owner or the issue author may close (mirrors route logic).
    if (repo.ownerId !== userId && issue.authorId !== userId) {
      return fail('You do not have permission to close this issue.');
    }

    await ctx.prisma.issue.update({
      where: { id: issue.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    await logToolAction(ctx, 'close_issue', 'issue', issue.id, {
      repoId: repo.id,
      number: issueNumber,
    });
    return ok({ number: issueNumber, state: 'closed' }, `Issue #${issueNumber} closed.`);
  },
};

const listActionsTool: QuantyTool = {
  name: 'list_actions',
  description: 'List CI workflow runs for a repository (status, branch, commit).',
  parameters: {
    repo: { type: 'string', description: 'Repository id or name', required: true },
    limit: { type: 'number', description: 'Maximum runs to return', required: false, default: 10 },
  },
  destructive: false,
  reversible: false,
  needsConfirm: false,
  handler: async (params, ctx) => {
    let repo: RepoRef;
    try {
      repo = await resolveRepo(ctx, String(params['repo'] ?? ''));
    } catch (e: any) {
      return fail(e.message);
    }

    const limit = Math.min(Math.max(Number(params['limit'] ?? 10) || 10, 1), 50);
    const runs = await ctx.prisma.ciRun.findMany({
      where: { repoId: repo.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const data = runs.map((r: any) => ({
      id: r.id,
      branch: r.branch,
      commitSha: (r.commitSha ?? '').slice(0, 7),
      status: String(r.status).toLowerCase(),
      triggeredBy: r.triggeredBy ?? null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
    }));
    await logToolAction(ctx, 'list_actions', 'repository', repo.id, { count: data.length });
    return ok(data, `Found ${data.length} workflow run${data.length === 1 ? '' : 's'} in ${repo.name}.`);
  },
};

const getRepoStatsTool: QuantyTool = {
  name: 'get_repo_stats',
  description: 'Get repository statistics: stars, forks, open PRs/issues, last commit.',
  parameters: {
    repo: { type: 'string', description: 'Repository id or name', required: true },
  },
  destructive: false,
  reversible: false,
  needsConfirm: false,
  handler: async (params, ctx) => {
    let repo: RepoRef;
    try {
      repo = await resolveRepo(ctx, String(params['repo'] ?? ''));
    } catch (e: any) {
      return fail(e.message);
    }

    const [openPrs, openIssues, closedIssues, totalPrs] = await Promise.all([
      ctx.prisma.pullRequest.count({ where: { repoId: repo.id, status: 'OPEN' } }),
      ctx.prisma.issue.count({ where: { repoId: repo.id, status: 'OPEN' } }),
      ctx.prisma.issue.count({ where: { repoId: repo.id, status: 'CLOSED' } }),
      ctx.prisma.pullRequest.count({ where: { repoId: repo.id } }),
    ]);

    const latestPr = await ctx.prisma.pullRequest.findFirst({
      where: { repoId: repo.id },
      orderBy: { updatedAt: 'desc' },
    });
    const latestIssue = await ctx.prisma.issue.findFirst({
      where: { repoId: repo.id },
      orderBy: { updatedAt: 'desc' },
    });
    const lastActivity = [latestPr?.updatedAt, latestIssue?.updatedAt]
      .filter(Boolean)
      .map((d: any) => new Date(d).getTime());
    const branches = await ctx.prisma.branch.findMany({ where: { repoId: repo.id } });
    const lastCommitSha =
      branches.length > 0
        ? branches
            .map((b: any) => b.commitSha)
            .filter((s: string) => s && !/^0+$/.test(s))[0] ?? null
        : null;

    const data = {
      ...repoSummary(repo),
      openPullRequests: openPrs,
      totalPullRequests: totalPrs,
      openIssues,
      closedIssues,
      branchCount: branches.length,
      lastCommitSha: lastCommitSha ? String(lastCommitSha).slice(0, 7) : null,
      lastActivityAt:
        lastActivity.length > 0 ? new Date(Math.max(...lastActivity)).toISOString() : null,
    };
    await logToolAction(ctx, 'get_repo_stats', 'repository', repo.id, {});
    return ok(data, `${repo.name}: ${repo.starCount} stars, ${openPrs} open PRs, ${openIssues} open issues.`);
  },
};

const summarizePrTool: QuantyTool = {
  name: 'summarize_pr',
  description:
    'Produce a structured summary of a pull request: what changed, which areas of the codebase, and how large the change is. Read-only.',
  parameters: {
    repo: { type: 'string', description: 'Repository id or name', required: true },
    prNumber: { type: 'number', description: 'Pull request number', required: true },
  },
  destructive: false,
  reversible: false,
  needsConfirm: false,
  handler: async (params, ctx) => {
    let repo: RepoRef;
    try {
      repo = await resolveRepo(ctx, String(params['repo'] ?? ''));
    } catch (e: any) {
      return fail(e.message);
    }
    const prNumber = Number(params['prNumber']);
    if (!Number.isInteger(prNumber) || prNumber < 1) return fail('A valid PR number is required.');

    const pr = await ctx.prisma.pullRequest.findFirst({
      where: { repoId: repo.id, number: prNumber },
    });
    if (!pr) return fail(`Pull request #${prNumber} not found in ${repo.name}.`);

    let diffText = '';
    try {
      const { resolveGitDiff } = await import('./git-helpers');
      diffText = await resolveGitDiff(ctx.prisma, repo, pr);
    } catch {
      diffText = '';
    }

    const files = parseDiffStats(diffText);
    const additions = files.reduce((s, f) => s + f.additions, 0);
    const deletions = files.reduce((s, f) => s + f.deletions, 0);

    // Group by top-level directory / area.
    const areas: Record<string, { files: number; additions: number; deletions: number }> = {};
    for (const f of files) {
      const area = f.file.includes('/') ? f.file.split('/')[0] : '(root)';
      const a = (areas[area] = areas[area] ?? { files: 0, additions: 0, deletions: 0 });
      a.files += 1;
      a.additions += f.additions;
      a.deletions += f.deletions;
    }
    const topAreas = Object.entries(areas)
      .map(([area, s]) => ({ area, ...s }))
      .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
      .slice(0, 5);

    const topFiles = [...files]
      .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
      .slice(0, 5);

    const size =
      additions + deletions < 50 ? 'small' : additions + deletions < 400 ? 'medium' : 'large';

    const summaryLines = [
      `PR #${prNumber} "${pr.title}" (${String(pr.status).toLowerCase()}):`,
      `- ${files.length} files changed, +${additions}/-${deletions} (${size} change)`,
    ];
    if (topAreas.length > 0) {
      summaryLines.push(`- Main areas: ${topAreas.map((a) => `${a.area} (${a.files} files)`).join(', ')}`);
    }
    if (pr.body) summaryLines.push(`- Description: ${String(pr.body).slice(0, 300)}`);

    await logToolAction(ctx, 'summarize_pr', 'pull_request', pr.id, {
      repoId: repo.id,
      number: prNumber,
    });
    return ok(
      {
        number: prNumber,
        title: pr.title,
        state: String(pr.status).toLowerCase(),
        sourceBranch: pr.sourceBranch,
        targetBranch: pr.targetBranch,
        size,
        changedFiles: files.length,
        additions,
        deletions,
        topAreas,
        topFiles,
        summary: summaryLines.join('\n'),
      },
      summaryLines.join(' '),
    );
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const GIT_TOOLS: QuantyTool[] = [
  listReposTool,
  createRepoTool,
  listPrsTool,
  getPrDiffTool,
  mergePrTool,
  createIssueTool,
  listIssuesTool,
  closeIssueTool,
  listActionsTool,
  getRepoStatsTool,
  summarizePrTool,
];

/**
 * Register all QuantGit tools with a tool registry.
 * Compatible with the `packages/agentic` ToolRegistry shape
 * ({ register(tool) }) — the extra safety flags ride along on the object.
 */
export function registerGitTools(
  registry: QuantyToolRegistry,
  deps: GitToolsDeps = {},
): QuantyTool[] {
  // Deps are captured per-context at call time; the registry entry keeps
  // handlers pure so the agent layer supplies { userId, prisma } on invoke.
  void deps;
  for (const tool of GIT_TOOLS) {
    registry.register(tool);
  }
  return GIT_TOOLS;
}

/** Build an execution context for a user (uses the shared prisma by default). */
export function createGitToolContext(userId: string, prisma?: GitToolsPrisma): QuantyToolContext {
  return { userId, prisma: prisma ?? (defaultPrisma as unknown as GitToolsPrisma) };
}
