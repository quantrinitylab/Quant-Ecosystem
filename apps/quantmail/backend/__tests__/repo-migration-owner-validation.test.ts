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
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RepoMigrationService,
  memoryMigratedReposStore,
} from '../services/repo-migration.service';

const VALID_INPUT = {
  sourceUrl: 'https://github.com/example/victim-repo.git',
  provider: 'github' as const,
  targetRepoName: 'migrated-repo',
};

describe('RepoMigrationService.importRepository targetOwner honesty', () => {
  beforeEach(() => {
    memoryMigratedReposStore.clear();
  });

  it('missing targetOwner → 400 MISSING_TARGET_OWNER, no repo record', async () => {
    const service = new RepoMigrationService();

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
    const service = new RepoMigrationService();

    const err = await service
      .importRepository({ ...VALID_INPUT, targetOwner: '   ' })
      .then(() => null, (e) => e);

    expect(err).not.toBeNull();
    expect(err?.statusCode).toBe(400);
    expect(err?.code).toBe('MISSING_TARGET_OWNER');
    expect(memoryMigratedReposStore.size).toBe(0);
  });

  it('valid targetOwner → import succeeds, attributed to the real owner (never user-default)', async () => {
    const service = new RepoMigrationService();

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
    const service = new RepoMigrationService();

    const result = await service.importRepository({
      ...VALID_INPUT,
      targetOwner: '  user_xyz789  ',
    });

    expect(result.repo.ownerId).toBe('user_xyz789');
  });
});
