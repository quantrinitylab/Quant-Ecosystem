import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitInspectService } from '../modules/code/services/git-transport/git-inspect.service';
import { RepoStorageService } from '../modules/code/services/git-transport/repo-storage.service';

// File-recency fabrication fix: the tree endpoint must return REAL per-file
// last-commit data (git log -1 per path) and leave it absent when unknowable —
// never a fabricated "Update file" message or "recently" timestamp.

const owner = 'recency-owner';

let testRoot = '';
let repoStorage: RepoStorageService;
let inspectService: GitInspectService;
let fixtureSeq = 0;

function git(repoPath: string, args: string[], options?: { input?: string; env?: NodeJS.ProcessEnv }): string {
  return execFileSync('git', ['--git-dir', repoPath, ...args], {
    encoding: 'utf8',
    input: options?.input,
    env: options?.env ?? process.env,
  }).trim();
}

function identityEnv(date: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: 'Recency Test Author',
    GIT_AUTHOR_EMAIL: 'recency@example.test',
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: 'Recency Test Author',
    GIT_COMMITTER_EMAIL: 'recency@example.test',
    GIT_COMMITTER_DATE: date,
  };
}

async function writeBlob(repoPath: string, content: string): Promise<string> {
  fixtureSeq += 1;
  const fixturePath = join(testRoot, `fixture-${fixtureSeq}.txt`);
  await writeFile(fixturePath, content, 'utf8');
  return git(repoPath, ['hash-object', '-w', fixturePath]);
}

/**
 * Commits a root tree shaped as:
 *   README.md        (message of the second commit)
 *   docs/guide.txt   (message of the first commit)
 * so the root listing contains one file entry and one directory entry whose
 * last-commits genuinely differ.
 */
async function commitTwoFileTree(
  repoPath: string,
  readmeContent: string,
  readmeMessage: string,
  readmeDate: string,
  parent?: string,
): Promise<string> {
  const readmeBlob = await writeBlob(repoPath, readmeContent);
  const guideBlob = await writeBlob(repoPath, 'guide v1\n');
  // docs/ subtree (only touched by the first commit)
  const docsTree = git(repoPath, ['mktree'], {
    input: `100644 blob ${guideBlob}\tguide.txt\n`,
  });
  // root tree
  const rootTree = git(repoPath, ['mktree'], {
    input: `100644 blob ${readmeBlob}\tREADME.md\n040000 tree ${docsTree}\tdocs\n`,
  });
  const commitArgs = ['commit-tree', rootTree, '-m', readmeMessage];
  if (parent) commitArgs.push('-p', parent);
  return git(repoPath, commitArgs, { env: identityEnv(readmeDate) });
}

beforeAll(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'quantmail-tree-recency-'));
  repoStorage = new RepoStorageService(testRoot);
  inspectService = new GitInspectService(repoStorage);

  const repoPath = await repoStorage.initBareRepo(owner, 'recency-repo');
  // Commit 1 (older): docs/ subtree added under 'docs: add deployment guide'.
  // Note: README is rewritten in commit 2, so its message differs from docs'.
  const first = await commitTwoFileTree(
    repoPath,
    '# recency repo\n',
    'docs: add deployment guide',
    '2026-01-02T03:04:05Z',
  );
  // Commit 2 (newer): only README.md content changes; docs/ subtree untouched.
  const second = await commitTwoFileTree(
    repoPath,
    '# recency repo v2\n',
    'chore: refresh readme',
    '2026-06-07T08:09:10Z',
    first,
  );
  git(repoPath, ['update-ref', 'refs/heads/main', second]);
}, 60000);

afterAll(async () => {
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

describe('GitInspectService tree recency enrichment', () => {
  it('returns real last-commit message and date per file', async () => {
    const tree = await inspectService.getTree(owner, 'recency-repo', 'refs/heads/main');
    const byPath = new Map(tree.map((e) => [e.path, e]));

    const readme = byPath.get('README.md');
    expect(readme).toBeDefined();
    expect(readme!.lastCommit).toBe('chore: refresh readme');
    // Canonical UTC form: getLastCommitForPath normalizes git's version-
    // dependent strict-ISO rendering (`+00:00` on old git, `Z` on new git)
    // to this stable `Z` string — assert the canonical form, not git's raw
    // output (see canonicalizeGitIsoDate).
    expect(readme!.lastCommitDate).toBe('2026-06-07T08:09:10Z');

    const guide = tree.find((e) => e.path === 'docs');
    // root listing shows the docs/ directory entry (files under it via path=)
    expect(guide?.type).toBe('tree');
  });

  it('resolves directory entries to the newest commit touching anything under them', async () => {
    const tree = await inspectService.getTree(owner, 'recency-repo', 'refs/heads/main');
    const docs = tree.find((e) => e.type === 'tree' && e.path === 'docs');
    expect(docs).toBeDefined();
    expect(docs!.lastCommit).toBe('docs: add deployment guide');
    // Canonical UTC form (see note above) — stable across git versions.
    expect(docs!.lastCommitDate).toBe('2026-01-02T03:04:05Z');
  });

  it('never fabricates "Update file" or "recently" placeholders', async () => {
    const tree = await inspectService.getTree(owner, 'recency-repo', 'refs/heads/main');
    expect(tree.length).toBeGreaterThan(0);
    for (const entry of tree) {
      expect(entry.lastCommit ?? '').not.toBe('Update file');
      expect(entry.lastCommitDate ?? '').not.toBe('recently');
    }
  });

  it('returns an empty tree (no invented recency) for a missing repo', async () => {
    await expect(inspectService.getTree(owner, 'no-such-repo', 'main')).resolves.toEqual([]);
  });
});
