// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generatePersonalAccessToken, verifyPersonalAccessToken } from '@quant/auth';
import { errorHandlerPlugin } from '@quant/server-core';
import gitTransportRoutes from '../modules/code/routes/git-transport';
import { RepoStorageService } from '../modules/code/services/git-transport';

const originalGitReposPath = process.env['GIT_REPOS_PATH'];
let root = '';
let app: FastifyInstance;
let generated: ReturnType<typeof generatePersonalAccessToken>;
let tokenRecord: Record<string, unknown>;
let repository: Record<string, unknown>;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'quantmail-gitd-pat-'));
  process.env['GIT_REPOS_PATH'] = root;
  const storage = new RepoStorageService(root);
  const storagePathUrl = await storage.initBareRepo('user-1', 'private-repo');
  generated = generatePersonalAccessToken();
  tokenRecord = {
    id: 'pat-1',
    tokenId: generated.tokenId,
    tokenHash: generated.tokenHash,
    userId: 'user-1',
    scopes: ['repo:read'],
    expiresAt: new Date('2099-01-01T00:00:00Z'),
    revokedAt: null,
    lastUsedAt: null,
  };
  repository = {
    id: 'repo-1',
    ownerId: 'user-1',
    name: 'private-repo',
    visibility: 'PRIVATE',
    defaultBranch: 'main',
    storagePathUrl,
    deletedAt: null,
  };
  app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', {
    repository: { findFirst: vi.fn(async () => repository) },
    personalAccessToken: {
      findUnique: vi.fn(async ({ where }: { where: { tokenId: string } }) =>
        where.tokenId === tokenRecord['tokenId'] ? tokenRecord : null,
      ),
      update: vi.fn(async () => tokenRecord),
    },
  } as never);
  await app.register(gitTransportRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  if (originalGitReposPath === undefined) delete process.env['GIT_REPOS_PATH'];
  else process.env['GIT_REPOS_PATH'] = originalGitReposPath;
  await rm(root, { recursive: true, force: true });
});

function basic(token: string, username = 'x-access-token'): string {
  return `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}`;
}

describe('Git Smart HTTP PAT authentication', () => {
  it('accepts a valid PAT from the Basic password field', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/repos/user-1/private-repo/info/refs?service=git-upload-pack',
      headers: { authorization: basic(generated.token) },
    });
    expect(response.statusCode).toBe(200);
  });

  it('accepts a valid PAT as a Bearer credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/repos/user-1/private-repo/info/refs?service=git-upload-pack',
      headers: { authorization: `Bearer ${generated.token}` },
    });
    expect(response.statusCode).toBe(200);
  });

  it('rejects a read-only PAT from receive-pack advertisement', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/repos/user-1/private-repo/info/refs?service=git-receive-pack',
      headers: { authorization: basic(generated.token) },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('INSUFFICIENT_SCOPE');
  });

  it('does not treat the Basic username as an identity', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/repos/user-1/private-repo/info/refs?service=git-upload-pack',
      headers: { authorization: basic('anything', 'user-1') },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects an expired PAT', async () => {
    tokenRecord = { ...tokenRecord, expiresAt: new Date('2000-01-01T00:00:00Z') };
    const response = await app.inject({
      method: 'GET',
      url: '/repos/user-1/private-repo/info/refs?service=git-upload-pack',
      headers: { authorization: basic(generated.token) },
    });
    expect(response.statusCode).toBe(401);
    tokenRecord = { ...tokenRecord, expiresAt: new Date('2099-01-01T00:00:00Z') };
  });

  it('allows anonymous upload-pack only for public repositories', async () => {
    repository = { ...repository, visibility: 'PUBLIC' };
    const response = await app.inject({
      method: 'GET',
      url: '/repos/user-1/private-repo/info/refs?service=git-upload-pack',
    });
    expect(response.statusCode).toBe(200);
    repository = { ...repository, visibility: 'PRIVATE' };
  });
});
