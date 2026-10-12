// ============================================================================
// GET /:id/pulls/:number/mergeable — real dry-run merge-conflict pre-check.
// ============================================================================
//
// Proves the QuantGit merge box's conflict status is backed by a genuine
// backend dry-run (`git merge-tree`, no writes), never fabricated client-side:
//  - clean branches  -> { mergeable: true,  reason: 'CLEAN',    conflicts: [] }
//  - conflicting ones -> { mergeable: false, reason: 'CONFLICTS', conflicts: [...] }
//  - no local repo   -> { mergeable: null,  reason: 'CHECK_UNAVAILABLE' } (honest unknown)
//  - unknown PR      -> 404 PR_NOT_FOUND
//
// Fixtures are REAL bare git repositories in a temp dir (wired through
// GIT_REPOS_PATH), so `git merge-tree` genuinely executes.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { errorHandlerPlugin } from '@quant/server-core';
import reposRoutes from '../routes/repos';

const execFileAsync = promisify(execFile);

const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.test',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.test',
};

const MOCK_REPO = {
  id: 'repo-1',
  ownerId: 'user-1',
  name: 'Quant-Ecosystem',
  description: 'fixture repo',
  visibility: 'PUBLIC',
  defaultBranch: 'main',
  storagePathUrl: null,
  starCount: 0,
  forkCount: 0,
  isArchived: false,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  deletedAt: null,
};

function mockPR(sourceBranch: string, status = 'OPEN') {
  return {
    id: `pr-${sourceBranch}`,
    repoId: 'repo-1',
    number: 1,
    title: 'fixture PR',
    body: '',
    authorId: 'user-1',
    status,
    sourceBranch,
    targetBranch: 'main',
    createdAt: new Date('2026-09-03T00:00:00.000Z'),
    updatedAt: new Date('2026-09-03T00:00:00.000Z'),
    closedAt: null,
    mergedAt: null,
  };
}

async function buildApp(prismaOverrides: Record<string, any> = {}) {
  const prisma = {
    repository: {
      findUnique: vi.fn().mockResolvedValue(MOCK_REPO),
      findFirst: vi.fn().mockResolvedValue(null),
      ...(prismaOverrides.repository || {}),
    },
    pullRequest: {
      findFirst: vi.fn().mockResolvedValue(mockPR('feature-clean')),
      ...(prismaOverrides.pullRequest || {}),
    },
    branch: {
      // No prisma branch rows: SHA resolution falls through to the
      // authoritative git refs in the fixture bare repo.
      findUnique: vi.fn().mockResolvedValue(null),
      ...(prismaOverrides.branch || {}),
    },
    branchProtection: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-1' };
  });
  await app.register(reposRoutes, { prefix: '/repos' });
  await app.ready();
  return app;
}

describe('GET /repos/:id/pulls/:number/mergeable', () => {
  let gitRoot = '';

  beforeAll(async () => {
    gitRoot = await mkdtemp(join(tmpdir(), 'qm-mergeable-'));
    const bare = join(gitRoot, 'user-1', 'Quant-Ecosystem.git');
    const work = join(gitRoot, 'work');
    await mkdir(join(gitRoot, 'user-1'), { recursive: true });

    const git = (args: string[], cwd?: string) =>
      execFileAsync('git', args, { cwd, env: GIT_ENV });

    await git(['init', '--bare', '--initial-branch=main', bare]);
    await git(['clone', bare, work]);
    const w = (args: string[]) => git(args, work);

    await w(['config', 'user.email', 'test@example.test']);
    await w(['config', 'user.name', 'Test']);
    // main: base commit
    await w(['checkout', '-b', 'main']);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(work, 'file.txt'), 'base line\n');
    await w(['add', 'file.txt']);
    await w(['commit', '-m', 'init']);
    await w(['push', '-u', 'origin', 'main']);

    // feature-clean: touches a NEW file -> merges cleanly
    await w(['checkout', '-b', 'feature-clean']);
    await writeFile(join(work, 'file2.txt'), 'clean addition\n');
    await w(['add', 'file2.txt']);
    await w(['commit', '-m', 'clean change']);
    await w(['push', '-u', 'origin', 'feature-clean']);

    // main moves forward, changing the SAME line the conflict branch will touch
    await w(['checkout', 'main']);
    await writeFile(join(work, 'file.txt'), 'main line\n');
    await w(['add', 'file.txt']);
    await w(['commit', '-m', 'main changes the line']);
    await w(['push', 'origin', 'main']);

    // feature-conflict: branched from the BASE commit, changes the same line
    // main changed -> genuine merge conflict on file.txt
    await w(['checkout', '-b', 'feature-conflict', 'main~1']);
    await writeFile(join(work, 'file.txt'), 'conflicting line\n');
    await w(['add', 'file.txt']);
    await w(['commit', '-m', 'conflicting change']);
    await w(['push', '-u', 'origin', 'feature-conflict']);

    process.env.GIT_REPOS_PATH = gitRoot;
  }, 60000);

  afterAll(async () => {
    delete process.env.GIT_REPOS_PATH;
    if (gitRoot) await rm(gitRoot, { recursive: true, force: true });
  });

  it('reports mergeable:true with no conflicts for a clean branch', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/repos/repo-1/pulls/1/mergeable' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.mergeable).toBe(true);
    expect(body.data.reason).toBe('CLEAN');
    expect(body.data.conflicts).toEqual([]);
    expect(body.data.baseSha).toMatch(/^[0-9a-f]{40}$/);
    expect(body.data.headSha).toMatch(/^[0-9a-f]{40}$/);
    await app.close();
  });

  it('reports mergeable:false with the conflicting file for a conflicting branch', async () => {
    const app = await buildApp({
      pullRequest: { findFirst: vi.fn().mockResolvedValue(mockPR('feature-conflict')) },
    });
    const res = await app.inject({ method: 'GET', url: '/repos/repo-1/pulls/1/mergeable' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.mergeable).toBe(false);
    expect(body.data.reason).toBe('CONFLICTS');
    expect(body.data.conflicts).toContain('file.txt');
    await app.close();
  });

  it('writes nothing: the check is a dry-run (no merge commit created)', async () => {
    const app = await buildApp();
    const before = (
      await execFileAsync('git', ['rev-parse', 'refs/heads/main'], {
        cwd: join(gitRoot, 'user-1', 'Quant-Ecosystem.git'),
        env: GIT_ENV,
      })
    ).stdout.trim();
    await app.inject({ method: 'GET', url: '/repos/repo-1/pulls/1/mergeable' });
    const after = (
      await execFileAsync('git', ['rev-parse', 'refs/heads/main'], {
        cwd: join(gitRoot, 'user-1', 'Quant-Ecosystem.git'),
        env: GIT_ENV,
      })
    ).stdout.trim();
    expect(after).toBe(before);
    await app.close();
  });

  it('reports an honest unknown when no local repo exists', async () => {
    const app = await buildApp();
    const saved = process.env.GIT_REPOS_PATH;
    delete process.env.GIT_REPOS_PATH;
    try {
      const res = await app.inject({ method: 'GET', url: '/repos/repo-1/pulls/1/mergeable' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.mergeable).toBeNull();
      expect(body.data.reason).toBe('CHECK_UNAVAILABLE');
      expect(body.data.conflicts).toEqual([]);
    } finally {
      process.env.GIT_REPOS_PATH = saved;
    }
    await app.close();
  });

  it('returns 404 PR_NOT_FOUND for an unknown PR number', async () => {
    const app = await buildApp({
      pullRequest: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const res = await app.inject({ method: 'GET', url: '/repos/repo-1/pulls/999/mergeable' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('requires authentication', async () => {
    const app = Fastify();
    await app.register(errorHandlerPlugin);
    app.decorate('prisma', {} as never);
    await app.register(reposRoutes, { prefix: '/repos' });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/repos/repo-1/pulls/1/mergeable' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
