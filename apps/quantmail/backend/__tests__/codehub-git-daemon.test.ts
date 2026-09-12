// @vitest-environment node

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generatePersonalAccessToken } from '@quant/auth';
import { errorHandlerPlugin } from '@quant/server-core';
import gitRoutes from '../modules/code/routes/git';
import gitTransportRoutes from '../modules/code/routes/git-transport';
import { LocalGitServerPort } from '../modules/code/services/git.service';
import {
  GitInspectService,
  GitReceivePackService,
  GitUploadPackService,
  RECEIVE_PACK_ADV_CONTENT_TYPE,
  RECEIVE_PACK_CONTENT_TYPE,
  RepoStorageService,
  UPLOAD_PACK_ADV_CONTENT_TYPE,
  UPLOAD_PACK_CONTENT_TYPE,
  formatSmartHttpHeader,
} from '../modules/code/services/git-transport';

const originalGitReposPath = process.env['GIT_REPOS_PATH'];
const owner = 'test-owner';
let testRoot = '';
let repoStorage: RepoStorageService;
let inspectService: GitInspectService;
let inspectRepoPath = '';
let baseCommit = '';
let headCommit = '';
let routeApp: FastifyInstance | undefined;
let inspectionApp: FastifyInstance | undefined;
let routeRepo: any;
let routePrisma: any;
let fixtureSequence = 0;

function git(
  repoPath: string,
  args: string[],
  options: { input?: string; env?: NodeJS.ProcessEnv } = {},
) {
  return execFileSync('git', ['--git-dir', repoPath, ...args], {
    encoding: 'utf8',
    input: options.input,
    env: options.env ?? process.env,
  }).trim();
}

async function createCommit(
  repoPath: string,
  fileName: string,
  content: string,
  message: string,
  parent?: string,
): Promise<string> {
  fixtureSequence += 1;
  const fixturePath = join(testRoot, `fixture-${fixtureSequence}.txt`);
  await writeFile(fixturePath, content, 'utf8');

  const blobSha = git(repoPath, ['hash-object', '-w', fixturePath]);
  const treeSha = git(repoPath, ['mktree'], {
    input: `100644 blob ${blobSha}\t${fileName}\n`,
  });
  const commitArgs = ['commit-tree', treeSha, '-m', message];
  if (parent) commitArgs.push('-p', parent);

  const identityEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'CodeHub Test Author',
    GIT_AUTHOR_EMAIL: 'codehub@example.test',
    GIT_AUTHOR_DATE: '2026-01-02T03:04:05Z',
    GIT_COMMITTER_NAME: 'CodeHub Test Author',
    GIT_COMMITTER_EMAIL: 'codehub@example.test',
    GIT_COMMITTER_DATE: '2026-01-02T03:04:05Z',
  };

  return git(repoPath, commitArgs, { env: identityEnv });
}

beforeAll(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'quantmail-codehub-git-'));
  process.env['GIT_REPOS_PATH'] = testRoot;
  repoStorage = new RepoStorageService(testRoot);
  inspectService = new GitInspectService(repoStorage);

  inspectRepoPath = await repoStorage.initBareRepo(owner, 'inspect-repo');
  baseCommit = await createCommit(
    inspectRepoPath,
    'README.md',
    'hello world\n',
    'Initial CodeHub commit',
  );
  headCommit = await createCommit(
    inspectRepoPath,
    'README.md',
    'hello world\nsecond line\n',
    'Update CodeHub README',
    baseCommit,
  );
  git(inspectRepoPath, ['update-ref', 'refs/heads/main', headCommit]);

  const routeOwner = 'route-owner';
  const routeName = 'route-repo';
  const routePath = await repoStorage.initBareRepo(routeOwner, routeName);
  routeRepo = {
    id: 'route-repo-id',
    ownerId: routeOwner,
    name: routeName,
    visibility: 'PUBLIC',
    defaultBranch: 'main',
    storagePathUrl: routePath,
  };
  routePrisma = {
    repository: {
      findFirst: vi.fn(async (args: { where: { ownerId: string; name: string } }) =>
        args.where.ownerId === routeOwner && args.where.name === routeName ? routeRepo : null,
      ),
    },
  };

  routeApp = Fastify();
  await routeApp.register(errorHandlerPlugin);
  routeApp.decorate('prisma', routePrisma as never);
  routeApp.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: 'read-only-user' };
  });
  await routeApp.register(gitTransportRoutes);
  await routeApp.ready();

  const privateRepo = {
    id: 'private-repo-id',
    ownerId: routeOwner,
    name: 'private-repo',
    visibility: 'PRIVATE',
    defaultBranch: 'main',
    storagePathUrl: null,
    deletedAt: null,
  };
  const internalRepo = {
    ...privateRepo,
    id: 'internal-repo-id',
    name: 'internal-repo',
    visibility: 'INTERNAL',
  };
  const inspectionPrisma = {
    repository: {
      findFirst: vi.fn(async (args: { where: { ownerId: string; name: string } }) => {
        if (args.where.ownerId !== routeOwner) return null;
        if (args.where.name === privateRepo.name) return privateRepo;
        if (args.where.name === internalRepo.name) return internalRepo;
        return null;
      }),
    },
  };

  inspectionApp = Fastify();
  await inspectionApp.register(errorHandlerPlugin);
  inspectionApp.decorate('prisma', inspectionPrisma as never);
  inspectionApp.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: 'non-owner' };
  });
  await inspectionApp.register(gitRoutes);
  await inspectionApp.ready();
});

afterAll(async () => {
  if (routeApp) await routeApp.close();
  if (inspectionApp) await inspectionApp.close();
  if (originalGitReposPath === undefined) delete process.env['GIT_REPOS_PATH'];
  else process.env['GIT_REPOS_PATH'] = originalGitReposPath;
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

describe('smart-http.utils', () => {
  it('formats Git Smart HTTP service announcement pkt-lines', () => {
    expect(formatSmartHttpHeader('git-upload-pack')).toBe('001e# service=git-upload-pack\n0000');
    expect(formatSmartHttpHeader('git-receive-pack')).toBe('001f# service=git-receive-pack\n0000');
  });

  it('exports the Git Smart HTTP content types', () => {
    expect(UPLOAD_PACK_ADV_CONTENT_TYPE).toBe('application/x-git-upload-pack-advertisement');
    expect(RECEIVE_PACK_ADV_CONTENT_TYPE).toBe('application/x-git-receive-pack-advertisement');
    expect(UPLOAD_PACK_CONTENT_TYPE).toBe('application/x-git-upload-pack-result');
    expect(RECEIVE_PACK_CONTENT_TYPE).toBe('application/x-git-receive-pack-result');
  });
});

describe('RepoStorageService', () => {
  it('rejects traversal, leading slashes, and trailing slashes', () => {
    expect(() => repoStorage.getRepoPath('..', 'repo')).toThrow(/Invalid repository path/);
    expect(() => repoStorage.getRepoPath(owner, '..')).toThrow(/Invalid repository path/);
    expect(() => repoStorage.getRepoPath('/owner', 'repo')).toThrow(/Invalid repository path/);
    expect(() => repoStorage.getRepoPath('owner/', 'repo')).toThrow(/Invalid repository path/);
    expect(() => repoStorage.getRepoPath(owner, '/repo')).toThrow(/Invalid repository path/);
    expect(() => repoStorage.getRepoPath(owner, 'repo/')).toThrow(/Invalid repository path/);
  });

  it('initializes a real bare repository in the temporary storage root', async () => {
    const repoPath = await repoStorage.initBareRepo(owner, 'storage-repo');

    expect(repoPath).toBe(join(testRoot, owner, 'storage-repo.git'));
    await expect(access(join(repoPath, 'HEAD'))).resolves.toBeUndefined();
    expect(git(repoPath, ['rev-parse', '--is-bare-repository'])).toBe('true');
  });

  it('reports existence and removes a bare repository', async () => {
    await repoStorage.initBareRepo(owner, 'delete-repo');
    await expect(repoStorage.repoExists(owner, 'delete-repo')).resolves.toBe(true);

    await repoStorage.deleteRepo(owner, 'delete-repo');
    await expect(repoStorage.repoExists(owner, 'delete-repo')).resolves.toBe(false);
  });

  it('never removes a repository path that existed before a failed initialization', async () => {
    const repoPath = repoStorage.getRepoPath(owner, 'pre-existing-storage');
    await mkdir(repoPath, { recursive: true });
    await writeFile(join(repoPath, 'objects'), 'not-a-directory', 'utf8');
    const sentinel = join(repoPath, 'do-not-delete.txt');
    await writeFile(sentinel, 'preserve me', 'utf8');

    await expect(repoStorage.initBareRepo(owner, 'pre-existing-storage')).rejects.toThrow();

    await expect(readFile(sentinel, 'utf8')).resolves.toBe('preserve me');
  });
});

describe('Git upload-pack and receive-pack services', () => {
  it('advertises upload-pack refs as a byte-exact buffer', async () => {
    const repoPath = await repoStorage.initBareRepo(owner, 'upload-pack-repo');
    const service = new GitUploadPackService();

    const refs = await service.advertiseRefs(repoPath);
    expect(Buffer.isBuffer(refs)).toBe(true);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.toString('utf8')).toContain('capabilities^{}');
  });

  it('advertises receive-pack refs as a byte-exact buffer', async () => {
    const repoPath = await repoStorage.initBareRepo(owner, 'receive-pack-repo');
    const service = new GitReceivePackService();

    const refs = await service.advertiseRefs(repoPath);
    expect(Buffer.isBuffer(refs)).toBe(true);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.toString('utf8')).toContain('capabilities^{}');
  });

  it('ships executable hook files without a UTF-8 BOM', async () => {
    for (const name of ['pre-receive', 'post-receive']) {
      const hookDir = resolve(fileURLToPath(new URL('../modules/code/git-hooks', import.meta.url)));
      const path = join(hookDir, name);
      const [content, metadata] = await Promise.all([readFile(path), stat(path)]);
      expect(content[0]).toBe(0x23);
      expect(content.subarray(0, 2).toString('utf8')).toBe('#!');
      if (process.platform !== 'win32') {
        expect(metadata.mode & 0o111).not.toBe(0);
      } else {
        const ls = execFileSync('git', ['ls-files', '-s', path], { encoding: 'utf8' });
        expect(ls).toMatch(/^100755/);
      }
    }
  });

  it('rejects protected Smart HTTP pushes and synchronizes accepted branches', async () => {
    const e2eOwner = 'e2e-owner';
    const e2eName = 'e2e-repo';
    const e2ePath = await repoStorage.initBareRepo(e2eOwner, e2eName);
    const generated = generatePersonalAccessToken();
    let protectedBranch: string | null = null;
    const upsert = vi.fn(async () => ({}));
    const e2ePrisma = {
      repository: {
        findFirst: vi.fn(async () => ({
          id: 'e2e-repo-id',
          ownerId: e2eOwner,
          name: e2eName,
          visibility: 'PRIVATE',
          defaultBranch: 'main',
          storagePathUrl: e2ePath,
          deletedAt: null,
        })),
      },
      personalAccessToken: {
        findUnique: vi.fn(async ({ where }: { where: { tokenId: string } }) =>
          where.tokenId === generated.tokenId
            ? {
                id: 'e2e-pat-id',
                tokenId: generated.tokenId,
                tokenHash: generated.tokenHash,
                userId: e2eOwner,
                scopes: ['repo:read', 'repo:write'],
                expiresAt: new Date('2099-01-01T00:00:00Z'),
                revokedAt: null,
                lastUsedAt: new Date(),
              }
            : null,
        ),
        update: vi.fn(),
      },
      branchProtection: {
        findMany: vi.fn(async () =>
          protectedBranch
            ? [
                {
                  id: 'e2e-rule-id',
                  repoId: 'e2e-repo-id',
                  branchPattern: protectedBranch,
                  requiredApprovals: 1,
                  requireStatusChecks: false,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ]
            : [],
        ),
      },
      branch: { upsert, deleteMany: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(e2ePrisma)),
    };

    const app = Fastify();
    await app.register(errorHandlerPlugin);
    app.decorate('prisma', e2ePrisma as never);
    await app.register(gitTransportRoutes);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });

    const work = join(testRoot, 'e2e-work');
    execFileSync('git', ['init', work]);
    await writeFile(join(work, 'README.md'), 'accepted\n', 'utf8');
    execFileSync('git', ['add', 'README.md'], { cwd: work });
    execFileSync('git', ['commit', '-m', 'accepted'], {
      cwd: work,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'E2E',
        GIT_AUTHOR_EMAIL: 'e2e@example.test',
        GIT_COMMITTER_NAME: 'E2E',
        GIT_COMMITTER_EMAIL: 'e2e@example.test',
      },
    });
    const remote =
      `${address.replace('http://', `http://x-access-token:${generated.token}@`)}` +
      `/repos/${e2eOwner}/${e2eName}.git`;

    const pushMain = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      const child = spawn('git', ['push', remote, 'HEAD:refs/heads/main'], {
        cwd: work,
        env: process.env,
      });
      let stderr = '';
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('close', (code) => resolve({ code, stderr }));
    });
    expect(pushMain.code).toBe(0);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ repoId: 'e2e-repo-id', name: 'main' }),
      }),
    );

    const acceptedSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: work,
      encoding: 'utf8',
    }).trim();
    await writeFile(join(work, 'README.md'), 'rejected update\n', 'utf8');
    execFileSync('git', ['add', 'README.md'], { cwd: work });
    execFileSync('git', ['commit', '-m', 'protected update'], {
      cwd: work,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'E2E',
        GIT_AUTHOR_EMAIL: 'e2e@example.test',
        GIT_COMMITTER_NAME: 'E2E',
        GIT_COMMITTER_EMAIL: 'e2e@example.test',
      },
    });
    protectedBranch = 'main';
    const rejected = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      const child = spawn('git', ['push', remote, 'HEAD:refs/heads/main'], {
        cwd: work,
        env: process.env,
      });
      let stderr = '';
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('close', (code) => resolve({ code, stderr }));
    });
    expect(rejected.code).not.toBe(0);
    expect(rejected.stderr).toContain('Direct push to protected branch is not allowed');
    expect(git(e2ePath, ['rev-parse', 'refs/heads/main'])).toBe(acceptedSha);
    await app.close();
  }, 30_000);
});

describe('LocalGitServerPort', () => {
  it('advances an existing ref when oldSha matches', async () => {
    const port = new LocalGitServerPort(repoStorage);
    const ref = 'refs/heads/gt-old-sha';
    git(inspectRepoPath, ['update-ref', ref, baseCommit]);

    await expect(
      port.advanceRef({
        repoId: 'inspect-repo-id',
        owner,
        name: 'inspect-repo',
        storagePathUrl: null,
        branch: 'gt-old-sha',
        ref,
        newSha: headCommit,
        oldSha: baseCommit,
      }),
    ).resolves.toEqual({ newSha: headCommit });
    expect(git(inspectRepoPath, ['rev-parse', ref])).toBe(headCommit);
  });

  it('creates a ref when oldSha is omitted', async () => {
    const port = new LocalGitServerPort(repoStorage);
    const ref = 'refs/heads/gt-no-old-sha';

    await expect(
      port.advanceRef({
        repoId: 'inspect-repo-id',
        owner,
        name: 'inspect-repo',
        storagePathUrl: null,
        branch: 'gt-no-old-sha',
        ref,
        newSha: headCommit,
      }),
    ).resolves.toEqual({ newSha: headCommit });
    expect(git(inspectRepoPath, ['rev-parse', ref])).toBe(headCommit);
  });

  it('rejects when the bare repository does not exist', async () => {
    const port = new LocalGitServerPort(repoStorage);

    await expect(
      port.advanceRef({
        repoId: 'missing-repo-id',
        owner,
        name: 'missing-repo',
        storagePathUrl: null,
        branch: 'main',
        ref: 'refs/heads/main',
        newSha: headCommit,
      }),
    ).rejects.toThrow('Repository not found on disk');
  });
});

describe('GitInspectService', () => {
  it('returns empty trees and commit logs for an unborn bare repository', async () => {
    await repoStorage.initBareRepo(owner, 'unborn-repo');

    await expect(inspectService.getTree(owner, 'unborn-repo', 'HEAD')).resolves.toEqual([]);
    await expect(inspectService.getCommits(owner, 'unborn-repo')).resolves.toEqual([]);
  });

  it('reads real commit metadata produced by commit-tree', async () => {
    const commits = await inspectService.getCommits(owner, 'inspect-repo', 'refs/heads/main');

    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      sha: headCommit,
      parents: [baseCommit],
      author: {
        name: 'CodeHub Test Author',
        email: 'codehub@example.test',
      },
      message: 'Update CodeHub README',
    });
    expect(commits[0]!.timestamp).toBeGreaterThan(0);
  });

  it('lists real tree entries with blob metadata', async () => {
    const tree = await inspectService.getTree(owner, 'inspect-repo', 'refs/heads/main');

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      mode: '100644',
      type: 'blob',
      name: 'README.md',
      path: 'README.md',
      size: Buffer.byteLength('hello world\nsecond line\n'),
    });
    expect(tree[0]!.sha).toMatch(/^[0-9a-f]{40,64}$/);
  });

  it('returns real blob content and byte length', async () => {
    const blob = await inspectService.getBlob(
      owner,
      'inspect-repo',
      'refs/heads/main',
      'README.md',
    );

    expect(blob).toEqual({
      path: 'README.md',
      content: 'hello world\nsecond line\n',
      size: Buffer.byteLength('hello world\nsecond line\n'),
      sha: 'refs/heads/main',
    });
  });

  it('returns patch and stat output for a real two-commit diff', async () => {
    const diff = await inspectService.getDiff(owner, 'inspect-repo', baseCommit, headCommit);

    expect(diff.base).toBe(baseCommit);
    expect(diff.head).toBe(headCommit);
    expect(diff.patch).toContain('diff --git a/README.md b/README.md');
    expect(diff.patch).toContain('+second line');
    expect(diff.stat).toContain('README.md');
  });

  it('reports a clean merge for an ancestor and its descendant', async () => {
    const result = await inspectService.checkMerge(owner, 'inspect-repo', baseCommit, headCommit);

    expect(result.clean).toBe(true);
    expect(result.output).not.toContain('<<<<<<<');
  });
});

describe('Smart HTTP Fastify routes', () => {
  it('advertises upload-pack refs with the protocol content type and service header', async () => {
    const response = await routeApp!.inject({
      method: 'GET',
      url: '/repos/route-owner/route-repo/info/refs?service=git-upload-pack',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain(UPLOAD_PACK_ADV_CONTENT_TYPE);
    expect(response.body).toMatch(/^001e# service=git-upload-pack\n0000/);
    expect(response.body.slice(4)).toMatch(/^# service=git-upload-pack\n0000/);
  });

  it('returns 400 for an unsupported Smart HTTP service', async () => {
    const response = await routeApp!.inject({
      method: 'GET',
      url: '/repos/route-owner/route-repo/info/refs?service=invalid',
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 404 when the repository does not exist in Prisma', async () => {
    const response = await routeApp!.inject({
      method: 'GET',
      url: '/repos/route-owner/missing/info/refs?service=git-upload-pack',
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 403 when an authenticated user lacks receive-pack write access', async () => {
    const response = await routeApp!.inject({
      method: 'GET',
      url: '/repos/route-owner/route-repo/info/refs?service=git-receive-pack',
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns 503 STORAGE_UNAVAILABLE when storagePathUrl is null', async () => {
    const unprovisionedRepo = {
      ...routeRepo,
      name: 'unprovisioned-repo',
      storagePathUrl: null,
    };
    routePrisma.repository.findFirst.mockImplementationOnce(async () => unprovisionedRepo);

    const response = await routeApp!.inject({
      method: 'GET',
      url: '/repos/route-owner/unprovisioned-repo/info/refs?service=git-upload-pack',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('STORAGE_UNAVAILABLE');
  });
});

describe('Git inspection route authorization', () => {
  it('returns 403 FORBIDDEN when a non-owner inspects a PRIVATE repository', async () => {
    const response = await inspectionApp!.inject({
      method: 'GET',
      url: '/repos/route-owner/private-repo/tree/main',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  it('returns 403 FORBIDDEN when a non-owner inspects an INTERNAL repository', async () => {
    const response = await inspectionApp!.inject({
      method: 'GET',
      url: '/repos/route-owner/internal-repo/commits?ref=main',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });
});
