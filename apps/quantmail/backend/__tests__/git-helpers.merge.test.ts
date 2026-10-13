// @vitest-environment node
// ============================================================================
// git-helpers.performGitMerge — honest-failure discipline.
//
// Proves the Quanty agent's git merge helper NEVER fabricates a merge commit
// SHA: when the bare repository is absent from disk it throws
// RepoStorageUnavailableError (the PR must stay open); when the repo is
// present it performs a real merge-tree/commit-tree/update-ref merge and
// returns the genuine commit SHA.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  performGitMerge,
  RepoStorageUnavailableError,
  MergeConflictError,
} from '../services/quanty-agent/tools/git-helpers';

const execFileAsync = promisify(execFile);

const FAKE_SHA = '2222222222222222222222222222222222222222';

// Minimal Prisma stub — only branch.findUnique is reachable, and only when
// git refs cannot be resolved (never in these fixtures).
const fakePrisma: any = { branch: { findUnique: async () => null } };
const repo: any = {
  id: 'repo-1',
  ownerId: 'user-1',
  name: 'Quant-Ecosystem',
  storagePathUrl: null,
};
const cleanPr: any = { number: 1, sourceBranch: 'feat/test', targetBranch: 'main' };
const conflictPr: any = { number: 2, sourceBranch: 'feature-conflict', targetBranch: 'main' };

describe('performGitMerge honest-failure discipline', () => {
  let gitRoot = '';
  const savedGitReposPath = process.env.GIT_REPOS_PATH;

  beforeAll(async () => {
    gitRoot = await mkdtemp(join(tmpdir(), 'qm-git-helpers-merge-'));
    const bare = join(gitRoot, 'user-1', 'Quant-Ecosystem.git');
    const work = join(gitRoot, 'work');
    await mkdir(join(gitRoot, 'user-1'), { recursive: true });
    const git = (args: string[], cwd?: string) => execFileAsync('git', args, { cwd });
    await git(['init', '--bare', '--initial-branch=main', bare]);
    await git(['clone', bare, work]);
    const w = (args: string[]) => git(args, work);
    await w(['config', 'user.email', 'test@example.test']);
    await w(['config', 'user.name', 'Test']);

    // main: base commit, then moves forward changing file.txt
    await w(['checkout', '-b', 'main']);
    await writeFile(join(work, 'file.txt'), 'base line\n');
    await w(['add', 'file.txt']);
    await w(['commit', '-m', 'init']);
    await w(['push', '-u', 'origin', 'main']);
    await writeFile(join(work, 'file.txt'), 'main line\n');
    await w(['add', 'file.txt']);
    await w(['commit', '-m', 'main moves forward']);
    await w(['push', 'origin', 'main']);

    // feat/test: clean branch off main (new file -> merges cleanly)
    await w(['checkout', '-b', 'feat/test']);
    await writeFile(join(work, 'file2.txt'), 'clean addition\n');
    await w(['add', 'file2.txt']);
    await w(['commit', '-m', 'clean change']);
    await w(['push', '-u', 'origin', 'feat/test']);

    // feature-conflict: branched from the BASE commit, changes the SAME
    // line main changed -> genuine merge conflict on file.txt
    await w(['checkout', '-b', 'feature-conflict', 'main~1']);
    await writeFile(join(work, 'file.txt'), 'conflicting line\n');
    await w(['add', 'file.txt']);
    await w(['commit', '-m', 'conflicting change']);
    await w(['push', '-u', 'origin', 'feature-conflict']);

    process.env.GIT_REPOS_PATH = gitRoot;
  }, 60000);

  afterAll(async () => {
    if (savedGitReposPath === undefined) delete process.env.GIT_REPOS_PATH;
    else process.env.GIT_REPOS_PATH = savedGitReposPath;
    if (gitRoot) await rm(gitRoot, { recursive: true, force: true });
  });

  it('throws RepoStorageUnavailableError (never a synthetic SHA) when no bare repo is on disk', async () => {
    // Point at a repo name that does not exist under GIT_REPOS_PATH.
    const missingRepo = { ...repo, name: 'no-such-repo' };
    const promise = performGitMerge(fakePrisma, missingRepo, cleanPr);
    await expect(promise).rejects.toBeInstanceOf(RepoStorageUnavailableError);
    await expect(promise).rejects.toMatchObject({ code: 'REPO_STORAGE_UNAVAILABLE' });
    await expect(promise).rejects.toThrow(/refusing to fabricate/i);
    // And it must never resolve to the old synthetic placeholder.
    await expect(promise).rejects.not.toMatchObject({ message: expect.stringContaining(FAKE_SHA) });
  });

  it('throws RepoStorageUnavailableError when GIT_REPOS_PATH is unset', async () => {
    delete process.env.GIT_REPOS_PATH;
    try {
      await expect(performGitMerge(fakePrisma, repo, cleanPr)).rejects.toMatchObject({
        code: 'REPO_STORAGE_UNAVAILABLE',
      });
    } finally {
      process.env.GIT_REPOS_PATH = gitRoot;
    }
  });

  it('performs a REAL merge and returns a genuine commit SHA when the bare repo exists', async () => {
    const sha = await performGitMerge(fakePrisma, repo, cleanPr);
    expect(sha).toMatch(/^[0-9a-f]{40}$/i);
    expect(sha).not.toBe(FAKE_SHA);

    const bare = join(gitRoot, 'user-1', 'Quant-Ecosystem.git');
    // The SHA is a real merge commit: two parents, both in the repo.
    const { stdout: catOut } = await execFileAsync('git', ['cat-file', '-p', sha], {
      cwd: bare,
    });
    const parents = catOut.split('\n').filter((l) => l.startsWith('parent '));
    expect(parents).toHaveLength(2);
    for (const parentLine of parents) {
      const parentSha = parentLine.split(' ')[1];
      await execFileAsync('git', ['cat-file', '-e', parentSha], { cwd: bare });
    }
    // And update-ref genuinely moved the target branch ref to it.
    const { stdout: refOut } = await execFileAsync('git', ['rev-parse', 'refs/heads/main'], {
      cwd: bare,
    });
    expect(refOut.trim()).toBe(sha);
  });

  it('throws MergeConflictError (not a fabricated SHA) on genuinely conflicting branches', async () => {
    await expect(performGitMerge(fakePrisma, repo, conflictPr)).rejects.toBeInstanceOf(
      MergeConflictError,
    );
  });
});
