// @vitest-environment node
// ============================================================================
// QM-SCREEN-013 P1 — gitd dual registration.
// The backend advertises clone URLs as
//   https://quantmail.in/api/code/gitd/repos/<owner>/<name>.git
// but the staging ingress rewrites /api/* to the backend root and the Next.js
// catch-all proxy forwards without the /api prefix, so the backend actually
// receives /code/gitd/... — which 404'd before the dual registration in
// modules/code/index.ts (same pattern as the /repos + /api/repos dual
// registration in backend/app.ts). This test boots the real QuantCode module
// registration and asserts the advertised URL's post-rewrite path resolves on
// both prefixes.
// ============================================================================

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import { registerQuantCodeModule } from '../modules/code/index';
import { RepoStorageService } from '../modules/code/services/git-transport';

const originalGitReposPath = process.env['GIT_REPOS_PATH'];
let root = '';
let app: FastifyInstance;
let repository: Record<string, unknown>;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'quantmail-gitd-dual-'));
  process.env['GIT_REPOS_PATH'] = root;
  const storage = new RepoStorageService(root);
  const storagePathUrl = await storage.initBareRepo('user-1', 'dual-repo');
  repository = {
    id: 'repo-1',
    ownerId: 'user-1',
    name: 'dual-repo',
    visibility: 'PUBLIC',
    defaultBranch: 'main',
    storagePathUrl,
    deletedAt: null,
  };
  app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', {
    repository: { findFirst: vi.fn(async () => repository) },
  } as never);
  await registerQuantCodeModule(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  if (originalGitReposPath === undefined) delete process.env['GIT_REPOS_PATH'];
  else process.env['GIT_REPOS_PATH'] = originalGitReposPath;
  await rm(root, { recursive: true, force: true });
});

describe('gitd dual registration (QM-SCREEN-013 P1)', () => {
  it('registers the transport routes under both /api/code/gitd and /code/gitd', () => {
    expect(
      app.hasRoute({ method: 'GET', url: '/code/gitd/repos/:owner/:name/info/refs' }),
    ).toBe(true);
    expect(
      app.hasRoute({ method: 'GET', url: '/api/code/gitd/repos/:owner/:name/info/refs' }),
    ).toBe(true);
  });

  it('resolves the advertised clone URL path as the ingress rewrites it (/code/gitd/...)', async () => {
    // What the backend receives for
    // https://quantmail.in/api/code/gitd/repos/user-1/dual-repo.git
    // after the staging ingress strips /api.
    const response = await app.inject({
      method: 'GET',
      url: '/code/gitd/repos/user-1/dual-repo.git/info/refs?service=git-upload-pack',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('git-upload-pack-advertisement');
  });

  it('keeps the canonical /api/code/gitd prefix working', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/code/gitd/repos/user-1/dual-repo.git/info/refs?service=git-upload-pack',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('git-upload-pack-advertisement');
  });
});
