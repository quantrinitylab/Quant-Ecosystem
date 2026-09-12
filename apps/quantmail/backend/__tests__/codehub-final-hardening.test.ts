// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import gitRoutes from '../modules/code/routes/git';
import { RepoStorageService } from '../modules/code/services/git-transport';

async function buildRouteApp(userId: string) {
  const repository = {
    id: 'repo-1',
    ownerId: 'owner-1',
    name: 'project',
    description: null,
    visibility: 'PUBLIC',
    defaultBranch: 'main',
    storagePathUrl: '/tmp/project.git',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const prisma = {
    repository: {
      findFirst: vi.fn(async () => repository),
      findUnique: vi.fn(async () => repository),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...repository,
        ...data,
      })),
    },
  };
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(gitRoutes);
  await app.ready();
  return { app, prisma };
}

const apps: Array<Awaited<ReturnType<typeof buildRouteApp>>['app']> = [];
const originalGitReposPath = process.env['GIT_REPOS_PATH'];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  if (originalGitReposPath === undefined) delete process.env['GIT_REPOS_PATH'];
  else process.env['GIT_REPOS_PATH'] = originalGitReposPath;
});

describe('CodeHub final release hardening', () => {
  it('renames a soft-deleted repository to release its active unique name', async () => {
    const { app, prisma } = await buildRouteApp('owner-1');
    apps.push(app);

    const response = await app.inject({
      method: 'DELETE',
      url: '/repos/owner-1/project',
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.repository.update).toHaveBeenCalledWith({
      where: { id: 'repo-1' },
      data: {
        deletedAt: expect.any(Date),
        name: expect.stringMatching(/^project-deleted-\d+$/),
        storagePathUrl: '/tmp/project.git',
      },
    });
  });

  it('renames both the row and bare directory before same-name recreation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codehub-delete-rename-'));
    process.env['GIT_REPOS_PATH'] = root;
    const storage = new RepoStorageService(root);
    const originalPath = await storage.initBareRepo('owner-1', 'project');
    const blob = execFileSync('git', ['--git-dir', originalPath, 'hash-object', '-w', '--stdin'], {
      input: 'private history\n',
      encoding: 'utf8',
    }).trim();
    const tree = execFileSync('git', ['--git-dir', originalPath, 'mktree'], {
      input: `100644 blob ${blob}\tSECRET.md\n`,
      encoding: 'utf8',
    }).trim();
    const commit = execFileSync(
      'git',
      ['--git-dir', originalPath, 'commit-tree', tree, '-m', 'old'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@example.test',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@example.test',
        },
      },
    ).trim();
    execFileSync('git', ['--git-dir', originalPath, 'update-ref', 'refs/heads/main', commit]);

    const { app, prisma } = await buildRouteApp('owner-1');
    apps.push(app);
    const response = await app.inject({ method: 'DELETE', url: '/repos/owner-1/project' });
    expect(response.statusCode).toBe(200);
    const update = (
      prisma.repository.update as unknown as {
        mock: { calls: Array<Array<{ data: { name: string; storagePathUrl?: string } }>> };
      }
    ).mock.calls[0]![0];
    const tombstoneName = update.data.name;
    expect(tombstoneName).toMatch(/^project-deleted-\d+$/);
    const tombstonePath = storage.getRepoPath('owner-1', tombstoneName);
    await expect(access(originalPath)).rejects.toThrow();
    await expect(access(tombstonePath)).resolves.toBeUndefined();
    expect(update.data.storagePathUrl).toBe(tombstonePath);

    const recreatedPath = await storage.initBareRepo('owner-1', 'project');
    const refs = execFileSync('git', ['--git-dir', recreatedPath, 'for-each-ref'], {
      encoding: 'utf8',
    });
    expect(refs).toBe('');
    expect(() =>
      execFileSync('git', ['--git-dir', recreatedPath, 'cat-file', '-e', commit]),
    ).toThrow();
    await rm(root, { recursive: true, force: true });
  });

  it('does not let a read-only public-repository caller reach pushRefs', async () => {
    const { app } = await buildRouteApp('reader-1');
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/repos/owner-1/project/push',
      payload: {
        refs: [
          {
            ref: 'refs/heads/main',
            newSha: 'a'.repeat(40),
          },
        ],
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('WRITE_SCOPE_REQUIRED');
  });
});
