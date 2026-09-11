// ============================================================================
// QuantCode module — Git ref-transport service (Pillar 2)
// quantmail-superhub · Task 10.1 (Requirement 6.3)
// ============================================================================

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PrismaClient, Repository } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { BranchProtectionService } from './branch-protection.service';
import { RepoStorageService } from './git-transport/repo-storage.service';
import { GIT_CHILD_ENV } from './git-transport/git-child-env';

const execFileAsync = promisify(execFile);

export interface RefUpdate {
  ref: string;
  newSha: string;
  oldSha?: string;
  prId?: string;
}

export interface RefUpdateOutcome {
  ref: string;
  branch: string;
  status: 'advanced' | 'rejected';
  newSha?: string;
  reason?: string;
}

export interface RefUpdateResult {
  ok: boolean;
  updates: RefUpdateOutcome[];
}

export interface GitServerPort {
  readonly managesBranchMetadata?: boolean;
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

export class LocalGitServerPort implements GitServerPort {
  readonly managesBranchMetadata = true;

  constructor(
    private readonly repoStorage: RepoStorageService = new RepoStorageService(),
    private readonly prisma?: PrismaClient,
  ) {}

  async advanceRef(input: Parameters<GitServerPort['advanceRef']>[0]): Promise<{ newSha: string }> {
    if (!(await this.repoStorage.repoExists(input.owner, input.name))) {
      throw new Error('Repository not found on disk');
    }

    const repoPath = this.repoStorage.getRepoPath(input.owner, input.name);
    const args = ['update-ref', input.ref, input.newSha];
    if (input.oldSha) args.push(input.oldSha);
    await execFileAsync('git', args, { cwd: repoPath, env: GIT_CHILD_ENV });

    if (this.prisma) {
      await this.prisma.branch.upsert({
        where: { repoId_name: { repoId: input.repoId, name: input.branch } },
        update: { commitSha: input.newSha },
        create: { repoId: input.repoId, name: input.branch, commitSha: input.newSha },
      });
    }

    return { newSha: input.newSha };
  }
}

export interface RepoAccessPort {
  hasWriteScope(repo: Repository, userId: string): boolean | Promise<boolean>;
}

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

function refToBranch(ref: string): string {
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

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
    this.gitServer = options.gitServer ?? new LocalGitServerPort(new RepoStorageService(), prisma);
  }

  async pushRefs(
    userId: string,
    repoId: string,
    refUpdates: RefUpdate[],
    packfile?: Buffer,
  ): Promise<RefUpdateResult> {
    const repo = await this.prisma.repository.findUnique({ where: { id: repoId } });
    if (!repo) throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');

    const writeAllowed = await this.access.hasWriteScope(repo, userId);
    if (!writeAllowed) {
      throw createAppError(
        'Write scope required to push to this repository',
        403,
        'WRITE_SCOPE_REQUIRED',
      );
    }

    if (refUpdates.length === 0) return { ok: true, updates: [] };

    const outcomes: RefUpdateOutcome[] = [];
    for (const update of refUpdates) {
      const branch = refToBranch(update.ref);
      const enforcement = await this.branchProtection.enforceOnPush(repo.id, branch, update.prId);

      if (!enforcement.allowed) {
        outcomes.push({
          ref: update.ref,
          branch,
          status: 'rejected',
          reason: enforcement.reason ?? 'Blocked by branch protection',
        });
        continue;
      }

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

      if (!this.gitServer.managesBranchMetadata) {
        await this.prisma.branch.upsert({
          where: { repoId_name: { repoId: repo.id, name: branch } },
          update: { commitSha: newSha },
          create: { repoId: repo.id, name: branch, commitSha: newSha },
        });
      }

      outcomes.push({ ref: update.ref, branch, status: 'advanced', newSha });
    }

    return { ok: outcomes.every((outcome) => outcome.status === 'advanced'), updates: outcomes };
  }
}
