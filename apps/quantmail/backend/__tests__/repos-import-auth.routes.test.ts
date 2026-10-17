// @vitest-environment node
// ============================================================================
// POST /repos/import + /api/repos/import — import auth-boundary tests.
// P0 fix (2026-10-13): handleImportRepo wrapped requireUserId in try/catch and
// fell back to the caller-supplied targetOwner (or the 'user-default'
// pseudo-user), letting unauthenticated callers mint repositories owned by
// arbitrary user IDs. Auth is now mandatory — the 401 propagates — and the
// owner always derives from the authenticated identity.
// P1 fix (2026-10-17): importRepository now performs a real `git clone --bare`
// of the source URL instead of inventing branches/SHAs. The authenticated
// (201) cases below stub the clone boundary on the shared singleton — the
// fixture SHA is a test constant — so no network is touched and no real
// storage is polluted. The 401 cases are unaffected (auth fails first).
// ============================================================================

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import reposRoutes from '../routes/repos';
import {
  memoryMigratedReposStore,
  setRepoMigrationServiceTestOverrides,
  resetRepoMigrationServiceTestOverrides,
  type MigrationGitOps,
} from '../services/repo-migration.service';
import { RepoStorageService } from '../modules/code/services/git-transport/repo-storage.service';

const execFileAsync = promisify(execFile);

const VALID_BODY = {
  sourceUrl: 'https://github.com/example/victim-repo.git',
  provider: 'github',
  targetRepoName: 'migrated-repo',
};

const FIXTURE_SHA = 'f'.repeat(40);

/** Simulates a successful clone: a real bare repo at the staging dir. */
function stubGitOps(): MigrationGitOps {
  return {
    cloneAndDiscover: async (_url: string, stagingDir: string) => {
      await execFileAsync('git', ['init', '--bare', stagingDir]);
      return {
        branches: [{ name: 'main', sha: FIXTURE_SHA, commitCount: 9 }],
        defaultBranch: 'main',
        workflowFiles: [],
        envExampleContent: null,
      };
    },
  };
}

async function buildApp(userId: string | null) {
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  // Mirrors the existing repos.routes.test.ts harness: the x-user-id header (or
  // the default) sets request.auth, exactly like the server-core auth hook
  // would for an authenticated caller. With null and no header, request.auth
  // stays unset — the unauthenticated path the old try/catch fallback exploited.
  app.addHook('onRequest', async (request) => {
    const overrideUser = (request.headers['x-user-id'] as string) || userId;
    if (overrideUser)
      (request as unknown as { auth: { userId: string } }).auth = { userId: overrideUser };
  });
  await app.register(reposRoutes, { prefix: '/repos' });
  await app.register(reposRoutes, { prefix: '/api/repos' });
  await app.ready();
  return app;
}

describe('POST /repos/import + /api/repos/import auth boundary', () => {
  let storageBase: string;

  beforeEach(async () => {
    memoryMigratedReposStore.clear();
    storageBase = await mkdtemp(join(tmpdir(), 'qm-import-route-test-'));
    // Stub the clone boundary on the shared singleton: no network, no real
    // storage. The route wiring (auth → service) is what's under test.
    setRepoMigrationServiceTestOverrides({
      gitOps: stubGitOps(),
      storage: new RepoStorageService(storageBase),
    });
  });

  afterEach(async () => {
    resetRepoMigrationServiceTestOverrides();
    await rm(storageBase, { recursive: true, force: true });
  });

  it('unauthenticated POST /repos/import with a spoofed targetOwner → 401, no repo record', async () => {
    const app = await buildApp(null);

    const res = await app.inject({
      method: 'POST',
      url: '/repos/import',
      payload: { ...VALID_BODY, targetOwner: 'victim-user', token: 'ghp_attacker' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()?.error?.code).toBe('UNAUTHORIZED');
    // The spoof must leave nothing behind.
    expect(memoryMigratedReposStore.size).toBe(0);
  });

  it('unauthenticated POST /api/repos/import with a spoofed targetOwner → 401, no repo record', async () => {
    const app = await buildApp(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/repos/import',
      payload: { ...VALID_BODY, targetOwner: 'victim-user' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()?.error?.code).toBe('UNAUTHORIZED');
    expect(memoryMigratedReposStore.size).toBe(0);
  });

  it('unauthenticated POST without any targetOwner → 401 (no user-default fallback)', async () => {
    const app = await buildApp(null);

    const res = await app.inject({
      method: 'POST',
      url: '/repos/import',
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()?.error?.code).toBe('UNAUTHORIZED');
    expect(memoryMigratedReposStore.size).toBe(0);
  });

  it('authenticated import ignores a spoofed targetOwner — owner is the authenticated identity', async () => {
    const app = await buildApp('user-1');

    const res = await app.inject({
      method: 'POST',
      url: '/repos/import',
      payload: { ...VALID_BODY, targetOwner: 'victim-user', token: 'ghp_legit' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()?.success).toBe(true);
    const records = [...memoryMigratedReposStore.values()];
    expect(records).toHaveLength(1);
    expect(records[0].ownerId).toBe('user-1');
    expect(records[0].fullName).toBe('user-1/migrated-repo');
    // The spoofed owner must appear nowhere in the created record.
    expect(JSON.stringify(records[0])).not.toContain('victim-user');
    // The import really provisioned storage: a servable bare repo exists.
    const storage = new RepoStorageService(storageBase);
    expect(await storage.repoExists('user-1', 'migrated-repo')).toBe(true);
  });

  it('authenticated import via /api/repos/import still works with the real owner', async () => {
    const app = await buildApp('user-2');

    const res = await app.inject({
      method: 'POST',
      url: '/api/repos/import',
      payload: { ...VALID_BODY, targetRepoName: 'api-imported-repo' },
    });

    expect(res.statusCode).toBe(201);
    const records = [...memoryMigratedReposStore.values()];
    expect(records).toHaveLength(1);
    expect(records[0].ownerId).toBe('user-2');
    expect(records[0].fullName).toBe('user-2/api-imported-repo');
  });
});
