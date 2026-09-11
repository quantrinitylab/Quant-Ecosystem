// ============================================================================
// QuantCode module — Git ref-transport service (Pillar 2)
// quantmail-superhub · Task 10.1 (Requirement 6.3)
// ============================================================================
//
// PURPOSE
//   Implements the `pushRefs` operation from the QuantCodeModule interface
//   (design §"INTERFACE QuantCodeModule"):
//
//       PROCEDURE pushRefs(userId, repoId, packfile) RETURNS RefUpdateResult
//         PRECONDITION:  caller has write scope on repoId
//         POSTCONDITION: branch protection rules evaluated before refs advance
//
//   Two guarantees are enforced here (Requirement 6.3):
//     1. WRITE-SCOPE GATE — the caller must hold write scope on the target repo
//        (the repo owner, or — once a collaborator/role model exists — an
//        authorized collaborator). A caller without write scope is rejected
//        with 403 and *no* ref is touched.
//     2. BRANCH-PROTECTION GATE — before any ref that matches a protected
//        `BranchProtection.branchPattern` is advanced, the protection rules
//        (required approvals, required status checks, direct-push ban) are
//        evaluated via `BranchProtectionService.enforceOnPush`. A protected ref
//        only advances when protection passes; a non-protected ref advances
//        normally for a write-scoped caller.
//
//   The actual ref transport is hidden behind the injectable `GitServerPort`
//   seam. The default local adapter advances refs in the on-disk bare repo,
//   while tests and future remote deployments can supply another adapter.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PrismaClient, Repository } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { BranchProtectionService } from './branch-protection.service';
import { RepoStorageService } from './git-transport/repo-storage.service';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Input / output contracts
// ---------------------------------------------------------------------------

/** A single requested ref advance within a push. */
export interface RefUpdate {
  /** Full or short ref name, e.g. `refs/heads/main` or `main`. */
  ref: string;
  /** Target commit SHA the ref should point at after the push. */
  newSha: string;
  /** Expected current SHA (optimistic concurrency); omitted for ref creation. */
  oldSha?: string;
  /**
   * The pull request backing this advance, when the ref is protected. Protected
   * branches forbid direct pushes (no `prId`) and gate on the PR's reviews/CI.
   */
  prId?: string;
}

/** Per-ref outcome of a push. */
export interface RefUpdateOutcome {
  ref: string;
  /** Short branch name the ref resolves to (`refs/heads/main` → `main`). */
  branch: string;
  status: 'advanced' | 'rejected';
  /** Commit SHA the ref points at after the operation (only when advanced). */
  newSha?: string;
  /** Human-readable reason a protected ref was blocked. */
  reason?: string;
}

/** Aggregate result of `pushRefs`. */
export interface RefUpdateResult {
  /** True only when every requested ref advanced. */
  ok: boolean;
  updates: RefUpdateOutcome[];
}

// ---------------------------------------------------------------------------
// Injectable ports (seams for testability + git-server wiring)
// ---------------------------------------------------------------------------

export interface GitServerPort {
  advanceRef(input: {
    repoId: string;
    owner: string;
    name: string;
    storagePathUrl: string | null;
    branch: string;
    ref: string;
    newSha: string;
    oldSha?: string;
    packfile?: Buffer;
  }): Promise<{ newSha: string }>;
}

/** Advance refs directly in the local bare-repository store. */
export class LocalGitServerPort implements GitServerPort {
  constructor(private readonly repoStorage: RepoStorageService = new RepoStorageService()) {}

  async advanceRef(input: Parameters<GitServerPort['advanceRef']>[0]): Promise<{ newSha: string }> {
    if (await this.repoStorage.repoExists(input.owner, input.name)) {
      const repoPath = this.repoStorage.getRepoPath(input.owner, input.name);
      await execFileAsync(
        'git',
        ['update-ref', input.ref, input.newSha, input.oldSha ?? ''],
        { cwd: repoPath },
      );
    }

    return { newSha: input.newSha };
  }
}

/**
 * Write-scope decision seam. The default implementation grants write scope to
 * the repo owner only. When a collaborator/role model is introduced, swap in an
 * adapter that also honours authorized collaborators/roles — `pushRefs` itself
 * does not change.
 */
export interface RepoAccessPort {
  hasWriteScope(repo: Repository, userId: string): boolean | Promise<boolean>;
}

/** Default write-scope policy: the repository owner holds write scope. */
export const ownerOnlyAccess: RepoAccessPort = {
  hasWriteScope(repo, userId) {
    return repo.ownerId === userId;
  },
};

export interface GitServiceOptions {
  gitServer?: GitServerPort;
  access?: RepoAccessPort;
  branchProtection?: BranchProtectionService;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a full ref (`refs/heads/main`) to its short branch name (`main`). */
function refToBranch(ref: string): string {
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GitService {
  private readonly gitServer: GitServerPort;
  private readonly access: RepoAccessPort;
  private readonly branchProtection: BranchProtectionService;

  constructor(
    private readonly prisma: PrismaClient,
    options: GitServiceOptions = {},
  ) {
    this.access = options.access ?? ownerOnlyAccess;
    this.branchProtection = options.branchProtection ?? new BranchProtectionService(prisma);
    this.gitServer = options.gitServer ?? new LocalGitServerPort();
  }

  /**
   * Advance one or more refs on a repository.
   *
   * @throws 404 when the repo does not exist.
   * @throws 403 when the caller does not hold write scope on the repo.
   *
   * Returns a per-ref result. Protected refs that fail their protection rules
   * are marked `rejected` and are NOT transported; non-protected refs (and
   * protected refs whose rules pass) advance.
   */
  async pushRefs(
    userId: string,
    repoId: string,
    refUpdates: RefUpdate[],
    packfile?: Buffer,
  ): Promise<RefUpdateResult> {
    // ----- 1. Resolve repo -------------------------------------------------
    const repo = await this.prisma.repository.findUnique({ where: { id: repoId } });
    if (!repo) {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }

    // ----- 2. WRITE-SCOPE GATE (Requirement 6.3) ---------------------------
    const writeAllowed = await this.access.hasWriteScope(repo, userId);
    if (!writeAllowed) {
      throw createAppError(
        'Write scope required to push to this repository',
        403,
        'WRITE_SCOPE_REQUIRED',
      );
    }

    if (refUpdates.length === 0) {
      return { ok: true, updates: [] };
    }

    // ----- 3. Per-ref branch-protection gate + transport -------------------
    const outcomes: RefUpdateOutcome[] = [];

    for (const update of refUpdates) {
      const branch = refToBranch(update.ref);

      // Evaluate protection BEFORE the ref is allowed to advance.
      const enforcement = await this.branchProtection.enforceOnPush(
        repo.id,
        branch,
        update.prId,
      );

      if (!enforcement.allowed) {
        outcomes.push({
          ref: update.ref,
          branch,
          status: 'rejected',
          reason: enforcement.reason ?? 'Blocked by branch protection',
        });
        // Do NOT transport a blocked protected ref.
        continue;
      }

      // Protection passed (or branch is unprotected) — transport the advance.
      const { newSha } = await this.gitServer.advanceRef({
        repoId: repo.id,
        owner: repo.ownerId,
        name: repo.name,
        storagePathUrl: repo.storagePathUrl,
        branch,
        ref: update.ref,
        newSha: update.newSha,
        oldSha: update.oldSha,
        packfile,
      });

      // Reflect the advanced ref in the QuantCode metadata view.
      await this.prisma.branch.upsert({
        where: { repoId_name: { repoId: repo.id, name: branch } },
        update: { commitSha: newSha },
        create: { repoId: repo.id, name: branch, commitSha: newSha },
      });

      outcomes.push({ ref: update.ref, branch, status: 'advanced', newSha });
    }

    return {
      ok: outcomes.every((o) => o.status === 'advanced'),
      updates: outcomes,
    };
  }
}
