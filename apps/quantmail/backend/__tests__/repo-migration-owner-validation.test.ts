// @vitest-environment node
// ============================================================================
// RepoMigrationService.importRepository — targetOwner honesty tests.
// P1 fix (2026-10-15): importRepository used to silently fall back to the
// 'user-default' pseudo-user when targetOwner was missing, minting repos
// attributed to a fake user for any caller that forgot to pass the owner
// (the /repos/import route always passes the authenticated userId, but the
// exported service function is reachable by any future caller). An absent
// owner is now an honest 400 MISSING_TARGET_OWNER — never a fake
// attribution.
//
// P1 fix (2026-10-17): importRepository now performs a real `git clone --bare`
// of the source URL. These tests inject a stub MigrationGitOps (+ a tmp-dir
// RepoStorageService) so no network is touched; the fixture SHAs below are
// test constants, and the assertions verify the service passes REAL
// discovered data through instead of inventing its own.
// ============================================================================

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  RepoMigrationService,
  memoryMigratedReposStore,
  type DiscoveredSourceRepo,
  type MigrationGitOps,
} from '../services/repo-migration.service';
import { RepoStorageService } from '../modules/code/services/git-transport/repo-storage.service';

const execFileAsync = promisify(execFile);

const VALID_INPUT = {
  sourceUrl: 'https://github.com/example/victim-repo.git',
  provider: 'github' as const,
  targetRepoName: 'migrated-repo',
};

const FIXTURE_SHA_MAIN = 'a'.repeat(40);
const FIXTURE_SHA_DEV = 'b'.repeat(40);

function fixtureDiscovery(): DiscoveredSourceRepo {
  return {
    branches: [
      { name: 'main', sha: FIXTURE_SHA_MAIN, commitCount: 42 },
      { name: 'feature-x', sha: FIXTURE_SHA_DEV, commitCount: 7 },
    ],
    defaultBranch: 'main',
    workflowFiles: [],
    envExampleContent: null,
  };
}

describe('RepoMigrationService.importRepository targetOwner honesty', () => {
  let storageBase: string;

  beforeEach(async () => {
    memoryMigratedReposStore.clear();
    storageBase = await mkdtemp(join(tmpdir(), 'qm-migration-owner-test-'));
  });

  afterEach(async () => {
    await rm(storageBase, { recursive: true, force: true });
  });

  function makeService(gitOps?: MigrationGitOps, prisma?: any) {
    const storage = new RepoStorageService(storageBase);
    const ops: MigrationGitOps = gitOps ?? {
      cloneAndDiscover: async () => {
        throw new Error('cloneAndDiscover must not be called');
      },
    };
    return new RepoMigrationService(prisma, ops, storage);
  }

  it('missing targetOwner → 400 MISSING_TARGET_OWNER, no repo record, no clone attempted', async () => {
    let cloneCalls = 0;
    const service = makeService({
      cloneAndDiscover: async () => {
        cloneCalls += 1;
        return fixtureDiscovery();
      },
    });

    const err = await service
      .importRepository({ ...VALID_INPUT, targetOwner: undefined as unknown as string })
      .then(() => null, (e) => e);

    expect(err).not.toBeNull();
    expect(err?.statusCode).toBe(400);
    expect(err?.code).toBe('MISSING_TARGET_OWNER');
    // Nothing must be minted behind the error — and validation must fail
    // before any clone is attempted.
    expect(cloneCalls).toBe(0);
    expect(memoryMigratedReposStore.size).toBe(0);
  });

  it('blank targetOwner (whitespace) → 400 MISSING_TARGET_OWNER, no repo record', async () => {
    const service = makeService();

    const err = await service
      .importRepository({ ...VALID_INPUT, targetOwner: '   ' })
      .then(() => null, (e) => e);

    expect(err).not.toBeNull();
    expect(err?.statusCode).toBe(400);
    expect(err?.code).toBe('MISSING_TARGET_OWNER');
    expect(memoryMigratedReposStore.size).toBe(0);
  });

  it('valid targetOwner → import succeeds, attributed to the real owner (never user-default)', async () => {
    const service = makeService({
      cloneAndDiscover: async (_url: string, stagingDir: string) => {
        await execFileAsync('git', ['init', '--bare', stagingDir]);
        return fixtureDiscovery();
      },
    });

    const result = await service.importRepository({
      ...VALID_INPUT,
      targetOwner: 'user_abc123',
    });

    expect(result.repo.ownerId).toBe('user_abc123');
    expect(result.repo.fullName).toBe('user_abc123/migrated-repo');
    expect(result.repo.ownerId).not.toBe('user-default');
    expect(memoryMigratedReposStore.size).toBe(1);
  });

  it('targetOwner is trimmed, not passed through raw', async () => {
    const service = makeService({
      cloneAndDiscover: async (_url: string, stagingDir: string) => {
        await execFileAsync('git', ['init', '--bare', stagingDir]);
        return fixtureDiscovery();
      },
    });

    const result = await service.importRepository({
      ...VALID_INPUT,
      targetOwner: '  user_xyz789  ',
    });

    expect(result.repo.ownerId).toBe('user_xyz789');
  });

  it('persisted branch rows carry the REAL discovered SHAs (never invented)', async () => {
    const branchCreates: any[] = [];
    const prisma = {
      repository: {
        findFirst: async () => null,
        create: async (args: any) => ({ id: args.data.id, ...args.data }),
      },
      branch: {
        create: async (args: any) => {
          branchCreates.push(args.data);
          return args.data;
        },
      },
    };
    const service = makeService({
      cloneAndDiscover: async (_url: string, stagingDir: string) => {
        await execFileAsync('git', ['init', '--bare', stagingDir]);
        return fixtureDiscovery();
      },
    }, prisma);

    await service.importRepository({ ...VALID_INPUT, targetOwner: 'user_abc123' });

    expect(branchCreates).toHaveLength(2);
    const byName = Object.fromEntries(branchCreates.map((b) => [b.name, b.commitSha]));
    expect(byName['main']).toBe(FIXTURE_SHA_MAIN);
    expect(byName['feature-x']).toBe(FIXTURE_SHA_DEV);
    // Both SHAs are valid 40-hex git object ids, and branch names come from
    // discovery — not the old hardcoded ['main', 'develop', 'release/v1.0'].
    for (const sha of Object.values(byName)) {
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    }
    expect(Object.keys(byName).sort()).toEqual(['feature-x', 'main']);
  });
});
