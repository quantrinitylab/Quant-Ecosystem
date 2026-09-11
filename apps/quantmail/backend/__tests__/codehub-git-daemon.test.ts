// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import gitTransportRoutes from '../modules/code/routes/git-transport';
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
let fixtureSequence = 0;

function git(repoPath: string, args: string[], options: { input?: string; env?: NodeJS.ProcessEnv } = {}) {
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
  await repoStorage.initBareRepo(routeOwner, routeName);
  const routeRepo = {
    id: 'route-repo-id',
    ownerId: routeOwner,
    name: routeName,
    visibility: 'PUBLIC',
    defaultBranch: 'main',
    storagePathUrl: null,
  };
  const routePrisma = {
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
});

afterAll(async () => {
  if (routeApp) await routeApp.close();
  if (originalGitReposPath === undefined) delete process.env['GIT_REPOS_PATH'];
  else process.env['GIT_REPOS_PATH'] = originalGitReposPath;
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

describe('smart-http.utils', () => {
  it('formats Git Smart HTTP service announcement pkt-lines', () => {
    expect(formatSmartHttpHeader('git-upload-pack')).toBe(
      '001e# service=git-upload-pack\n0000',
    );
    expect(formatSmartHttpHeader('git-receive-pack')).toBe(
      '001f# service=git-receive-pack\n0000',
    );
  });

  it('exports the Git Smart HTTP content types', () => {
    expect(UPLOAD_PACK_ADV_CONTENT_TYPE).toBe(
      'application/x-git-upload-pack-advertisement',
    );
    expect(RECEIVE_PACK_ADV_CONTENT_TYPE).toBe(
      'application/x-git-receive-pack-advertisement',
    );
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
});

describe('Git upload-pack and receive-pack services', () => {
  it('advertises upload-pack refs from a bare repository', async () => {
    const repoPath = await repoStorage.initBareRepo(owner, 'upload-pack-repo');
    const service = new GitUploadPackService();

    await expect(service.advertiseRefs(repoPath)).resolves.toEqual(expect.any(String));
  });

  it('advertises receive-pack refs from a bare repository', async () => {
    const repoPath = await repoStorage.initBareRepo(owner, 'receive-pack-repo');
    const service = new GitReceivePackService();

    await expect(service.advertiseRefs(repoPath)).resolves.toEqual(expect.any(String));
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
});
