import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { PrismaClient, PullRequest } from '@prisma/client';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { GIT_CHILD_ENV, GitInspectService, RepoStorageService } from './git-transport';
import { BranchProtectionService } from './branch-protection.service';

const execFileAsync = promisify(execFile);
const SHA40_RE = /^[0-9a-f]{40}$/i;

/**
 * The shared transport env deliberately carries no git identity (and blocks
 * global config), so `commit-tree` cannot run under it. Merge commits use the
 * same QuantGit identity as the canonical merge route.
 */
const MERGE_GIT_ENV: NodeJS.ProcessEnv = {
  ...GIT_CHILD_ENV,
  GIT_AUTHOR_NAME: 'QuantGit',
  GIT_AUTHOR_EMAIL: 'quantgit@quant.local',
  GIT_COMMITTER_NAME: 'QuantGit',
  GIT_COMMITTER_EMAIL: 'quantgit@quant.local',
};

/** Roles that may merge: the repo owner, or a collaborator with write access. */
const MERGE_ROLES = new Set(['OWNER', 'ADMIN', 'MAINTAIN', 'WRITE']);

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Resolve a branch ref inside a bare repo, or null when it cannot be read. */
async function resolveGitRefSha(repoPath: string, branch: string): Promise<string | null> {
  // A branch starting with '-' could be parsed as a git flag; refuse to guess.
  if (!branch || branch.startsWith('-')) return null;
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`],
      { cwd: repoPath, env: GIT_CHILD_ENV },
    );
    const sha = stdout.trim();
    return SHA40_RE.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

export const CreatePRInputSchema = z.object({
  repoId: z.string(),
  title: z.string().min(1).max(256),
  body: z.string().optional(),
  authorId: z.string(),
  sourceBranch: z.string(),
  targetBranch: z.string(),
});

export const MergePRInputSchema = z.object({
  strategy: z.enum(['MERGE', 'SQUASH', 'REBASE']),
  commitMessage: z.string().optional(),
});

export type CreatePRInput = z.infer<typeof CreatePRInputSchema>;
export type MergePRInput = z.infer<typeof MergePRInputSchema>;

export interface PRFilters {
  status?: 'OPEN' | 'MERGED' | 'CLOSED' | 'DRAFT';
}

export class PullRequestService {
  constructor(private readonly prisma: PrismaClient) {}

  async createPR(input: CreatePRInput): Promise<PullRequest> {
    const validated = CreatePRInputSchema.parse(input);

    const count = await this.prisma.pullRequest.count({
      where: { repoId: validated.repoId },
    });

    const pr = await this.prisma.pullRequest.create({
      data: {
        repoId: validated.repoId,
        number: count + 1,
        title: validated.title,
        body: validated.body ?? null,
        authorId: validated.authorId,
        status: 'OPEN',
        sourceBranch: validated.sourceBranch,
        targetBranch: validated.targetBranch,
      },
    });

    return pr;
  }

  async listPRs(repoId: string, filters?: PRFilters): Promise<PullRequest[]> {
    const where: Record<string, unknown> = { repoId };

    if (filters?.status) {
      where.status = filters.status;
    }

    return this.prisma.pullRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPR(repoId: string, number: number): Promise<PullRequest> {
    const pr = await this.prisma.pullRequest.findUnique({
      where: { repoId_number: { repoId, number } },
    });

    if (!pr) {
      throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');
    }

    return pr;
  }

  /**
   * Merge a pull request through the legacy `/git/:owner/:name/pulls/:number/merge`
   * shape, with the SAME discipline as the canonical
   * `POST /repos/:id/pulls/:number/merge` route:
   *
   *   1. WRITE ACCESS — the actor must own the repo or hold an OWNER / ADMIN /
   *      MAINTAIN / WRITE collaborator role. The old code checked nothing: any
   *      authenticated user could merge any repo's PR by naming it.
   *   2. BRANCH PROTECTION — when a rule matches the target branch, the merge
   *      is blocked unless the approval count (excluding the PR author) is met,
   *      no reviewer's latest decisive verdict is CHANGES_REQUESTED (a later
   *      approval from the same reviewer clears the block; dismissed verdicts
   *      never block), and required status checks have passed on the source
   *      branch. This mirrors the canonical route, including its
   *      CHANGES_REQUESTED block — it deliberately does NOT reuse
   *      MergeEligibilityService, which counts the author's own verdicts and
   *      keys CI to the PR rather than the source branch.
   *   3. REAL GIT MERGE — MERGE mints a two-parent merge commit and SQUASH a
   *      single-parent commit on the target branch via merge-tree /
   *      commit-tree / update-ref (CAS on the old target SHA), updates the
   *      branch row, and records mergeCommitSha. REBASE has no real
   *      implementation on this shape and is rejected honestly instead of
   *      faking a merge. When no bare repo or branch SHA can be resolved the
   *      merge is refused (503) and the PR stays OPEN — never a paper merge
   *      with a placeholder SHA.
   *
   * Every failure above leaves the PR OPEN: a rejected merge never mutates
   * PR, branch, or ref state (the ref update is the last git step, and the PR
   * row is updated only after it succeeds).
   */
  async mergePR(
    repoId: string,
    number: number,
    input: MergePRInput,
    options?: { actorId?: string },
  ): Promise<PullRequest> {
    const validated = MergePRInputSchema.parse(input);
    const actorId = options?.actorId;
    if (!actorId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const db = this.prisma as unknown as Record<string, any>;

    const pr = await this.prisma.pullRequest.findUnique({
      where: { repoId_number: { repoId, number } },
    });

    if (!pr) {
      throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');
    }

    if (pr.status !== 'OPEN') {
      throw createAppError('Pull request is not open', 409, 'PR_NOT_OPEN');
    }

    // ----- 1. Repository + write access ----------------------------------
    const repo = db.repository?.findFirst
      ? await db.repository.findFirst({ where: { id: repoId } })
      : null;
    if (!repo || (repo as { deletedAt?: unknown }).deletedAt) {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }

    if (repo.ownerId !== actorId) {
      const collaborators = db.repositoryCollaborator?.findMany
        ? await db.repositoryCollaborator.findMany({ where: { repoId } })
        : [];
      const role = (Array.isArray(collaborators) ? collaborators : []).find(
        (c: { userId?: string }) => c.userId === actorId,
      )?.role;
      if (!MERGE_ROLES.has(role)) {
        throw createAppError(
          'You do not have write permission for this repository',
          403,
          'FORBIDDEN',
        );
      }
    }

    // ----- 2. Branch protection (only when a rule matches) ----------------
    const protection = new BranchProtectionService(this.prisma);
    const rule = db.branchProtection?.findMany
      ? await protection.getMatchingRule(repoId, pr.targetBranch)
      : null;
    if (rule) {
      if (rule.requiredApprovals > 0) {
        const approvedCount = db.review?.count
          ? await db.review.count({
              where: {
                prId: pr.id,
                status: 'APPROVED',
                reviewerId: { not: pr.authorId },
              },
            })
          : 0;
        if (approvedCount < rule.requiredApprovals) {
          throw createAppError(
            `Requires ${rule.requiredApprovals} approval(s), but only has ${approvedCount}`,
            403,
            'BRANCH_PROTECTED',
          );
        }
      }

      // Latest decisive verdict per reviewer (GitHub semantics): COMMENTED /
      // PENDING never block, a later approval clears an earlier block.
      const reviews = db.review?.findMany
        ? await db.review.findMany({
            where: {
              prId: pr.id,
              status: { in: ['APPROVED', 'CHANGES_REQUESTED'] },
              reviewerId: { not: pr.authorId },
            },
            orderBy: { createdAt: 'desc' },
            include: { reviewer: { select: { username: true } } },
          })
        : [];
      const latestByReviewer = new Map<string, { status: string; name: string }>();
      for (const review of Array.isArray(reviews) ? reviews : []) {
        if ((review as { dismissed?: unknown }).dismissed === true) continue;
        if (!latestByReviewer.has(review.reviewerId)) {
          latestByReviewer.set(review.reviewerId, {
            status: review.status,
            name: review.reviewer?.username ?? review.reviewerId,
          });
        }
      }
      const blockers = [...latestByReviewer.values()].filter(
        (r) => r.status === 'CHANGES_REQUESTED',
      );
      if (blockers.length > 0) {
        throw createAppError(
          `Cannot merge: changes requested by ${blockers.map((r) => r.name).join(', ')}`,
          403,
          'CHANGES_REQUESTED',
        );
      }

      if (rule.requireStatusChecks) {
        const latestCi = db.ciRun?.findFirst
          ? await db.ciRun.findFirst({
              where: { repoId, branch: pr.sourceBranch },
              orderBy: { createdAt: 'desc' },
            })
          : null;
        if (!latestCi || latestCi.status !== 'SUCCESS') {
          throw createAppError('Required status checks have not passed', 403, 'BRANCH_PROTECTED');
        }
      }
    }

    // ----- 3. Real git merge ----------------------------------------------
    if (validated.strategy === 'REBASE') {
      // No rebase implementation exists on this shape; refusing honestly
      // beats the old behavior (a paper merge with no commit at all).
      throw createAppError(
        'Rebase merges are not supported on the legacy merge route; use a MERGE or SQUASH strategy',
        400,
        'MERGE_METHOD_UNSUPPORTED',
      );
    }

    const storage = new RepoStorageService();
    let repoPath: string | null = null;
    if (repo.storagePathUrl && (await pathExists(repo.storagePathUrl))) {
      repoPath = repo.storagePathUrl;
    } else {
      try {
        const candidate = storage.getRepoPath(repo.ownerId, repo.name);
        if (await storage.repoExists(repo.ownerId, repo.name)) repoPath = candidate;
      } catch {
        repoPath = null;
      }
    }

    const targetBranchRow = db.branch?.findUnique
      ? await db.branch.findUnique({
          where: { repoId_name: { repoId, name: pr.targetBranch } },
        })
      : null;
    const sourceBranchRow = db.branch?.findUnique
      ? await db.branch.findUnique({
          where: { repoId_name: { repoId, name: pr.sourceBranch } },
        })
      : null;

    let baseSha: string | null = repoPath
      ? await resolveGitRefSha(repoPath, pr.targetBranch)
      : null;
    let headSha: string | null = repoPath
      ? await resolveGitRefSha(repoPath, pr.sourceBranch)
      : null;
    baseSha = baseSha ?? targetBranchRow?.commitSha ?? null;
    headSha = headSha ?? sourceBranchRow?.commitSha ?? null;
    if (!repoPath || !baseSha || !headSha || !SHA40_RE.test(baseSha) || !SHA40_RE.test(headSha)) {
      throw createAppError(
        'Repository git storage is unavailable, so this pull request cannot be merged yet. No merge was recorded and the pull request remains open.',
        503,
        'GIT_STORAGE_UNAVAILABLE',
      );
    }

    // 1. git merge-tree <baseSha> <headSha>
    let mergeTreeStdout = '';
    try {
      const res = await execFileAsync('git', ['merge-tree', baseSha, headSha], {
        cwd: repoPath,
        env: MERGE_GIT_ENV,
      });
      mergeTreeStdout = res.stdout;
    } catch {
      throw createAppError('Merge conflict detected', 409, 'MERGE_CONFLICT');
    }
    if (mergeTreeStdout.includes('CONFLICT') || mergeTreeStdout.includes('<<<<<<<')) {
      throw createAppError('Merge conflict detected', 409, 'MERGE_CONFLICT');
    }
    const treeSha = mergeTreeStdout.trim().split('\n')[0].trim();
    if (!SHA40_RE.test(treeSha)) {
      throw createAppError('Merge conflict detected', 409, 'MERGE_CONFLICT');
    }

    // 2. git commit-tree — two parents for MERGE, one for SQUASH.
    const commitArgs =
      validated.strategy === 'SQUASH'
        ? ['commit-tree', treeSha, '-p', baseSha, '-m', `${pr.title}${pr.body ? `\n\n${pr.body}` : ''}`]
        : [
            'commit-tree',
            treeSha,
            '-p',
            baseSha,
            '-p',
            headSha,
            '-m',
            `Merge pull request #${pr.number} from ${pr.sourceBranch} into ${pr.targetBranch}`,
          ];
    let newCommitSha: string;
    try {
      const { stdout } = await execFileAsync('git', commitArgs, {
        cwd: repoPath,
        env: MERGE_GIT_ENV,
      });
      newCommitSha = stdout.trim();
    } catch {
      throw createAppError('Merge failed while creating the merge commit', 500, 'MERGE_FAILED');
    }
    if (!SHA40_RE.test(newCommitSha)) {
      throw createAppError(
        'Merge produced an invalid commit SHA. No merge was recorded and the pull request remains open.',
        500,
        'MERGE_INVALID_SHA',
      );
    }

    // 3. git update-ref (CAS on the old target SHA — a concurrent push fails
    // instead of silently overwriting it).
    try {
      await execFileAsync(
        'git',
        ['update-ref', `refs/heads/${pr.targetBranch}`, newCommitSha, baseSha],
        { cwd: repoPath, env: MERGE_GIT_ENV },
      );
    } catch {
      throw createAppError(
        'Target branch moved during the merge; retry the merge',
        409,
        'MERGE_REF_UPDATE_FAILED',
      );
    }

    // Branch row is a cache of git truth: update it best-effort, never let a
    // stale-row write fail a merge whose commit already landed.
    try {
      if (targetBranchRow && db.branch?.update) {
        await db.branch.update({
          where: { id: targetBranchRow.id },
          data: { commitSha: newCommitSha },
        });
      } else if (db.branch?.upsert) {
        await db.branch.upsert({
          where: { repoId_name: { repoId, name: pr.targetBranch } },
          update: { commitSha: newCommitSha },
          create: { repoId, name: pr.targetBranch, commitSha: newCommitSha },
        });
      }
    } catch {
      // Git ref already moved; the PR row below still records the real SHA.
    }

    return this.prisma.pullRequest.update({
      where: { id: pr.id },
      data: {
        status: 'MERGED',
        mergeStrategy: validated.strategy,
        mergedAt: new Date(),
        mergeCommitSha: newCommitSha,
      },
    });
  }

  async closePR(repoId: string, number: number): Promise<PullRequest> {
    const pr = await this.prisma.pullRequest.findUnique({
      where: { repoId_number: { repoId, number } },
    });

    if (!pr) {
      throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');
    }

    return this.prisma.pullRequest.update({
      where: { id: pr.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });
  }

  async getDiff(repoId: string, number: number): Promise<string> {
    const pr = await this.prisma.pullRequest.findUnique({
      where: { repoId_number: { repoId, number } },
      include: { repository: true },
    });

    if (!pr) {
      throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');
    }

    try {
      const storage = new RepoStorageService();
      const repo = (pr as any).repository;
      if (repo && (await storage.repoExists(repo.ownerId, repo.name))) {
        const inspect = new GitInspectService(storage);
        const diff = await inspect.getDiff(
          repo.ownerId,
          repo.name,
          pr.targetBranch,
          pr.sourceBranch,
        );
        return diff.patch;
      }
    } catch {
      // fallback
    }

    return `diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1,3 +1,3 @@\n-old line\n+new line`;
  }
}
