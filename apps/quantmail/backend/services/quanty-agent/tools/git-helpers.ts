// ============================================================================
// Quanty Git helpers — real git operations shared by the git tools.
// ============================================================================
// Mirrors the git plumbing in apps/quantmail/backend/routes/repos.ts
// (merge-tree / commit-tree / update-ref, diff). Kept in a separate module so
// the agent tool layer can reuse it without importing route internals.
// ============================================================================

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { GitToolsPrisma } from './git-tools';

const execFileAsync = promisify(execFile);

const GIT_CHILD_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'QuantGit',
  GIT_AUTHOR_EMAIL: 'quantgit@quant.local',
  GIT_COMMITTER_NAME: 'QuantGit',
  GIT_COMMITTER_EMAIL: 'quantgit@quant.local',
};

interface RepoLike {
  ownerId: string;
  name: string;
  storagePathUrl: string | null;
}

interface PrLike {
  number: number;
  sourceBranch: string;
  targetBranch: string;
}

export class MergeConflictError extends Error {
  readonly code = 'MERGE_CONFLICT';
  constructor() {
    super('Merge conflict detected');
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRepoPath(repo: RepoLike): Promise<string | null> {
  if (repo.storagePathUrl && (await pathExists(repo.storagePathUrl))) {
    return repo.storagePathUrl;
  }
  const basePath = process.env['GIT_REPOS_PATH'] ?? join(process.cwd(), 'data', 'git-repos');
  const repoName = repo.name.endsWith('.git') ? repo.name : `${repo.name}.git`;
  const defaultPath = join(basePath, repo.ownerId, repoName);
  if (await pathExists(defaultPath)) {
    return defaultPath;
  }
  return null;
}

async function resolveGitRefSha(repoPath: string, branch: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`], {
      cwd: repoPath,
      env: GIT_CHILD_ENV,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function branchSha(
  prisma: GitToolsPrisma,
  repoId: string,
  branchName: string,
): Promise<string | null> {
  const row = await prisma.branch.findUnique({
    where: { repoId_name: { repoId, name: branchName } },
  });
  return row?.commitSha ?? null;
}

/**
 * Resolve the unified diff between a PR's target and source branches.
 * Returns '' when no git data is available (the caller falls back gracefully).
 */
export async function resolveGitDiff(
  prisma: GitToolsPrisma,
  repo: RepoLike & { id: string },
  pr: PrLike,
): Promise<string> {
  const repoPath = await resolveRepoPath(repo);
  if (!repoPath || !(await pathExists(repoPath))) return '';

  const baseSha =
    (await resolveGitRefSha(repoPath, pr.targetBranch)) ?? (await branchSha(prisma, repo.id, pr.targetBranch));
  const headSha =
    (await resolveGitRefSha(repoPath, pr.sourceBranch)) ?? (await branchSha(prisma, repo.id, pr.sourceBranch));
  if (!baseSha || !headSha) return '';

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '-p', '--end-of-options', `${baseSha}..${headSha}`, '--'],
      { cwd: repoPath, env: GIT_CHILD_ENV },
    );
    return stdout;
  } catch {
    return '';
  }
}

/**
 * Perform a real merge of the PR's source branch into its target branch.
 * Uses `git merge-tree` + `commit-tree` + `update-ref` when a bare repo is
 * present (same as the repos.ts merge endpoint); otherwise records a
 * synthetic merge commit SHA. Throws MergeConflictError on conflicts.
 */
export async function performGitMerge(
  prisma: GitToolsPrisma,
  repo: RepoLike & { id: string },
  pr: PrLike,
): Promise<string> {
  const repoPath = await resolveRepoPath(repo);
  const isBareRepoPresent = repoPath ? await pathExists(repoPath) : false;

  let baseSha =
    repoPath && isBareRepoPresent ? await resolveGitRefSha(repoPath, pr.targetBranch) : null;
  let headSha =
    repoPath && isBareRepoPresent ? await resolveGitRefSha(repoPath, pr.sourceBranch) : null;
  baseSha = baseSha ?? (await branchSha(prisma, repo.id, pr.targetBranch));
  headSha = headSha ?? (await branchSha(prisma, repo.id, pr.sourceBranch));

  if (isBareRepoPresent && repoPath && baseSha && headSha) {
    let mergeTreeStdout = '';
    try {
      const res = await execFileAsync('git', ['merge-tree', baseSha, headSha], {
        cwd: repoPath,
        env: GIT_CHILD_ENV,
      });
      mergeTreeStdout = res.stdout;
    } catch {
      throw new MergeConflictError();
    }

    if (mergeTreeStdout.includes('CONFLICT') || mergeTreeStdout.includes('<<<<<<<')) {
      throw new MergeConflictError();
    }

    const treeSha = mergeTreeStdout.trim().split('\n')[0].trim();
    if (!/^[0-9a-f]{40}$/i.test(treeSha)) {
      throw new MergeConflictError();
    }

    const commitMsg = `Merge pull request #${pr.number} from ${pr.sourceBranch} into ${pr.targetBranch}`;
    const { stdout: commitStdout } = await execFileAsync(
      'git',
      ['commit-tree', treeSha, '-p', baseSha, '-p', headSha, '-m', commitMsg],
      { cwd: repoPath, env: GIT_CHILD_ENV },
    );
    const newCommitSha = commitStdout.trim();

    await execFileAsync(
      'git',
      ['update-ref', `refs/heads/${pr.targetBranch}`, newCommitSha, baseSha],
      { cwd: repoPath, env: GIT_CHILD_ENV },
    );
    return newCommitSha;
  }

  // No bare repo on disk — record a synthetic merge SHA (matches the route's
  // fallback behaviour so DB state stays consistent).
  return '2222222222222222222222222222222222222222';
}
