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
// P1 fix (2026-10-17): importRepository used to mint FAKE discovery data
// (hardcoded branches, random commit counts, random SHAs) and convert SAMPLE
// pipeline/env templates labeled as imported. Discovery is now real
// `git ls-remote`; unreachable remotes are a loud 502 with nothing minted;
// pipeline/env conversion from the remote's actual files is not wired up and
// answers 501 when requested. The success-path tests below stub discovery
// (no network in unit tests); the real git path is covered in
// repo-migration-discovery.test.ts against local git repositories.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RepoMigrationService,
  memoryMigratedReposStore,
  type RemoteRefDiscovery,
} from '../services/repo-migration.service';

// Deterministic discovery stub: no network in unit tests. The shape mirrors
// a real `git ls-remote --symref --heads` result.
const STUB_DISCOVERY: RemoteRefDiscovery = {
  branches: [
    { name: 'main', sha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' },
    { name: 'develop', sha: 'b1b2c3d4e5f60718293a4b5c6d7e8f9012345678' },
  ],
  defaultBranch: 'main',
};

class StubDiscoveryService extends RepoMigrationService {
  public override async discoverRemoteRefs(): Promise<RemoteRefDiscovery> {
    return STUB_DISCOVERY;
  }
}

const VALID_INPUT = {
  sourceUrl: 'https://github.com/example/victim-repo.git',
  provider: 'github' as const,
  targetRepoName: 'migrated-repo',
  importPipelines: false,
  importEnv: false,
};

describe('RepoMigrationService.importRepository targetOwner honesty', () => {
  beforeEach(() => {
    memoryMigratedReposStore.clear();
  });

  it('missing targetOwner → 400 MISSING_TARGET_OWNER, no repo record', async () => {
    const service = new StubDiscoveryService();

    const err = await service
      .importRepository({ ...VALID_INPUT, targetOwner: undefined as unknown as string })
      .then(() => null, (e) => e);

    expect(err).not.toBeNull();
    expect(err?.statusCode).toBe(400);
    expect(err?.code).toBe('MISSING_TARGET_OWNER');
    // Nothing must be minted behind the error.
    expect(memoryMigratedReposStore.size).toBe(0);
  });

  it('blank targetOwner (whitespace) → 400 MISSING_TARGET_OWNER, no repo record', async () => {
    const service = new StubDiscoveryService();

    const err = await service
      .importRepository({ ...VALID_INPUT, targetOwner: '   ' })
      .then(() => null, (e) => e);

    expect(err).not.toBeNull();
    expect(err?.statusCode).toBe(400);
    expect(err?.code).toBe('MISSING_TARGET_OWNER');
    expect(memoryMigratedReposStore.size).toBe(0);
  });

  it('valid targetOwner → import succeeds with REAL discovered refs, attributed to the real owner (never user-default)', async () => {
    const service = new StubDiscoveryService();

    const result = await service.importRepository({
      ...VALID_INPUT,
      targetOwner: 'user_abc123',
    });

    expect(result.repo.ownerId).toBe('user_abc123');
    expect(result.repo.fullName).toBe('user_abc123/migrated-repo');
    expect(result.repo.ownerId).not.toBe('user-default');
    // Real discovery data, not the old hardcoded ['main','develop','release/v1.0'].
    expect(result.repo.branches).toEqual(['main', 'develop']);
    expect(result.repo.defaultBranch).toBe('main');
    // No fabricated numbers anywhere on the record or result.
    expect(result.repo).not.toHaveProperty('commitCount');
    expect(result).not.toHaveProperty('importedCommits');
    expect(result.convertedPipelines).toEqual([]);
    expect(result.importedEnvVars).toEqual([]);
    expect(memoryMigratedReposStore.size).toBe(1);
  });

  it('targetOwner is trimmed, not passed through raw', async () => {
    const service = new StubDiscoveryService();

    const result = await service.importRepository({
      ...VALID_INPUT,
      targetOwner: '  user_xyz789  ',
    });

    expect(result.repo.ownerId).toBe('user_xyz789');
  });

  it('unreachable remote → loud 502 REMOTE_GIT_UNREACHABLE, no repo record minted', async () => {
    // No stub: the real ls-remote path runs against a guaranteed-dead local
    // endpoint (connection refused is instant and deterministic).
    const service = new RepoMigrationService();

    const err = await service
      .importRepository({
        ...VALID_INPUT,
        provider: 'git',
        sourceUrl: 'https://127.0.0.1:1/no-such-repo.git',
        targetOwner: 'user_abc123',
      })
      .then(() => null, (e) => e);

    expect(err).not.toBeNull();
    expect(err?.statusCode).toBe(502);
    expect(err?.code).toBe('REMOTE_GIT_UNREACHABLE');
    expect(memoryMigratedReposStore.size).toBe(0);
  });

  it('importPipelines:true → loud 501, never sample-template fabrication', async () => {
    const service = new StubDiscoveryService();

    const err = await service
      .importRepository({ ...VALID_INPUT, targetOwner: 'user_abc123', importPipelines: true })
      .then(() => null, (e) => e);

    expect(err?.statusCode).toBe(501);
    expect(err?.code).toBe('PIPELINE_IMPORT_NOT_SUPPORTED');
    expect(memoryMigratedReposStore.size).toBe(0);
  });

  it('importEnv:true → loud 501, never sample-env fabrication', async () => {
    const service = new StubDiscoveryService();

    const err = await service
      .importRepository({ ...VALID_INPUT, targetOwner: 'user_abc123', importEnv: true })
      .then(() => null, (e) => e);

    expect(err?.statusCode).toBe(501);
    expect(err?.code).toBe('ENV_IMPORT_NOT_SUPPORTED');
    expect(memoryMigratedReposStore.size).toBe(0);
  });
});
