// @vitest-environment node

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { evaluatePreReceive, GitHookServer } from '../modules/code/services/git-transport';

const ZERO = '0'.repeat(40);
let root = '';
let bare = '';
let first = '';
let second = '';

function git(args: string[], cwd = root): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Hook Test',
      GIT_AUTHOR_EMAIL: 'hook@example.test',
      GIT_COMMITTER_NAME: 'Hook Test',
      GIT_COMMITTER_EMAIL: 'hook@example.test',
    },
  }).trim();
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'quantcode-hooks-'));
  bare = join(root, 'repo.git');
  git(['init', '--bare', bare]);
  const work = join(root, 'work');
  git(['init', work]);
  git(['commit', '--allow-empty', '-m', 'first'], work);
  first = git(['rev-parse', 'HEAD'], work);
  git(['commit', '--allow-empty', '-m', 'second'], work);
  second = git(['rev-parse', 'HEAD'], work);
  git(['push', bare, 'HEAD:refs/heads/main'], work);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function prismaWithRules(rules: Array<Record<string, unknown>>) {
  return {
    branchProtection: { findMany: vi.fn(async () => rules) },
    branch: { upsert: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  } as never;
}

function payload(oldSha: string, newSha: string, ref = 'refs/heads/main') {
  return {
    pushId: '9f876e4d-d443-4c8c-88de-5fb366b8aff5',
    repoId: 'repo-1',
    userId: 'user-1',
    quarantinePath: null,
    gitDir: bare,
    commands: [{ oldSha, newSha, ref }],
  };
}

describe('ADR-CH-002 pre-receive policy', () => {
  const rule = {
    id: 'rule-1',
    repoId: 'repo-1',
    branchPattern: 'main',
    requiredApprovals: 1,
    requireStatusChecks: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('allows an unprotected branch', async () => {
    await expect(
      evaluatePreReceive(prismaWithRules([]), payload(first, second, 'refs/heads/feature')),
    ).resolves.toEqual({ allowed: true, reasons: [] });
  });

  it('rejects a direct push to a protected branch', async () => {
    const result = await evaluatePreReceive(prismaWithRules([rule]), payload(first, second));
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('Direct push to protected branch is not allowed');
  });

  it('rejects deletion of a protected branch', async () => {
    const result = await evaluatePreReceive(prismaWithRules([rule]), payload(second, ZERO));
    expect(result.reasons[0]).toContain("Deletion of protected branch 'main'");
  });

  it('rejects force-push of a protected branch', async () => {
    const result = await evaluatePreReceive(prismaWithRules([rule]), payload(second, first));
    expect(result.reasons[0]).toContain("Force push to protected branch 'main'");
  });

  it('binds the policy callback to loopback and rejects unsigned calls', async () => {
    const server = new GitHookServer(prismaWithRules([]));
    await server.start();
    try {
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/internal\/git$/);
      const response = await fetch(`${server.url}/pre-receive`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload(first, second)),
      });
      expect(response.status).toBe(401);
    } finally {
      await server.close();
    }
  });

  it('fails closed when the policy callback is unreachable', () => {
    const hook = resolve(
      fileURLToPath(new URL('../modules/code/git-hooks/pre-receive', import.meta.url)),
    );
    const result = spawnSync(process.execPath, [hook], {
      input: `${first} ${second} refs/heads/main\n`,
      encoding: 'utf8',
      env: {
        ...process.env,
        QUANTCODE_HOOK_URL: 'http://127.0.0.1:1/internal/git',
        QUANTCODE_HOOK_SECRET: 'test-secret',
        QUANTCODE_REPO_ID: 'repo-1',
        QUANTCODE_PUSHER_ID: 'user-1',
        QUANTCODE_PUSH_ID: '9f876e4d-d443-4c8c-88de-5fb366b8aff5',
        GIT_DIR: bare,
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('QuantCode:');
  });
});
