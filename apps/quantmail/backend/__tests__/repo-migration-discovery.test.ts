// @vitest-environment node
// ============================================================================
// RepoMigrationService.discoverRemoteRefs — REAL `git ls-remote` discovery.
//
// P1 fix (2026-10-17): importRepository used to hardcode
// discoveredBranches=['main','develop','release/v1.0'], mint a random
// commitCount, and a random latestCommitSha — all persisted as if imported.
// Discovery now shells out to `git ls-remote --symref --heads` and parses the
// remote's REAL refs. These tests exercise the real code path against local
// git repositories created in a temp dir (no network), plus the loud-502
// contract for unreachable remotes.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  RepoMigrationService,
  type MigrationProvider,
  type RemoteRefDiscovery,
} from '../services/repo-migration.service';

const execFileAsync = promisify(execFile);

// Exposes the protected discovery method for direct testing.
class ExposedDiscoveryService extends RepoMigrationService {
  public discover(
    sourceUrl: string,
    provider: MigrationProvider,
    token?: string,
  ): Promise<RemoteRefDiscovery> {
    return this.discoverRemoteRefs(sourceUrl, provider, token);
  }
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@test',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@test',
    },
  });
}

describe('discoverRemoteRefs (real git ls-remote)', () => {
  let dir: string;
  let repoPath: string;
  let emptyRepoPath: string;
  const service = new ExposedDiscoveryService();

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'qm-migration-discovery-'));
    repoPath = join(dir, 'source-repo');
    emptyRepoPath = join(dir, 'empty-repo');

    await git(dir, 'init', '-b', 'main', 'source-repo');
    await execFileAsync('sh', ['-c', `echo hello > ${join(repoPath, 'README.md')}`]);
    await git(repoPath, 'add', '.');
    await git(repoPath, 'commit', '-m', 'initial commit');
    await git(repoPath, 'checkout', '-b', 'develop');
    await execFileAsync('sh', ['-c', `echo dev > ${join(repoPath, 'dev.txt')}`]);
    await git(repoPath, 'add', '.');
    await git(repoPath, 'commit', '-m', 'develop commit');
    await git(repoPath, 'checkout', '-b', 'release/v1.0');
    await execFileAsync('sh', ['-c', `echo rel > ${join(repoPath, 'rel.txt')}`]);
    await git(repoPath, 'add', '.');
    await git(repoPath, 'commit', '-m', 'release commit');

    await git(dir, 'init', '-b', 'main', 'empty-repo');
  }, 60_000);

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('discovers the remote\'s REAL branches and tip SHAs (never hardcoded, never random)', async () => {
    const discovery = await service.discover(repoPath, 'git');

    expect(discovery.branches.map((b) => b.name).sort()).toEqual([
      'develop',
      'main',
      'release/v1.0',
    ]);
    // Every SHA is a real 40-hex object id…
    for (const b of discovery.branches) {
      expect(b.sha).toMatch(/^[0-9a-f]{40}$/);
    }
    // …and distinct per branch (each branch has its own tip commit).
    const shas = new Set(discovery.branches.map((b) => b.sha));
    expect(shas.size).toBe(3);
    // Local-path remotes do not advertise a HEAD symref, so the documented
    // fallback applies: the first advertised branch (alphabetical ls-remote
    // order), real data rather than a 'main' guess.
    expect(discovery.defaultBranch).toBe('develop');
  });

  it('empty remote → empty branch list (honest), not fabricated branches', async () => {
    const discovery = await service.discover(emptyRepoPath, 'git');
    expect(discovery.branches).toEqual([]);
  });

  it('nonexistent local path → loud 502 REMOTE_GIT_UNREACHABLE', async () => {
    const err = await service
      .discover(join(dir, 'does-not-exist'), 'git')
      .then(() => null, (e) => e);

    expect(err?.statusCode).toBe(502);
    expect(err?.code).toBe('REMOTE_GIT_UNREACHABLE');
  });

  it('unreachable HTTPS remote → loud 502 REMOTE_GIT_UNREACHABLE', async () => {
    const err = await service
      .discover('https://127.0.0.1:1/no-such-repo.git', 'github')
      .then(() => null, (e) => e);

    expect(err?.statusCode).toBe(502);
    expect(err?.code).toBe('REMOTE_GIT_UNREACHABLE');
  });

  it('embedded credentials in the URL are masked in the 502 message (never echoed)', async () => {
    const err = await service
      .discover('https://user:s3cret-token-value@127.0.0.1:1/x.git', 'github', 'header-token-abc')
      .then(() => null, (e) => e);

    expect(err?.statusCode).toBe(502);
    expect(String(err?.message)).not.toContain('s3cret-token-value');
    expect(String(err?.message)).not.toContain('header-token-abc');
  });
});
