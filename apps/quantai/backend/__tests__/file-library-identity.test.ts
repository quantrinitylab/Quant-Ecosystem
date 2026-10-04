// ============================================================================
// security-p0: file-library identity-forgery regression tests
// P0-7 — getAuthenticatedUserId must not trust the x-user-id header.
// Run against PATCHED sources (post `git apply` of
// patches/quantai-file-library-identity.patch); the extract copy mirrors
// the repo file at origin/main 4df8d64.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@quant/server-core', () => ({
  createAppError: (message: string, statusCode: number, code: string) => {
    const err = new Error(message) as Error & { statusCode: number; code: string };
    err.statusCode = statusCode;
    err.code = code;
    return err;
  },
}));

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn(
    (_userId: string, _opts: unknown): Array<{ id: string; name: string }> => [],
  ),
  searchFiles: vi.fn((_userId: string, _q: string, _opts: unknown) => []),
  getFileStats: vi.fn((_userId: string) => ({ totalFiles: 0 })),
  getStorageUsage: vi.fn((_userId: string) => ({ usedBytes: 0 })),
}));
const { listFiles, searchFiles } = mocks;

vi.mock('../services/file-library.service', () => ({
  FileLibraryService: class {
    listFiles = mocks.listFiles;
    searchFiles = mocks.searchFiles;
    getFileStats = mocks.getFileStats;
    getStorageUsage = mocks.getStorageUsage;
  },
}));

// Route module under test
import fileLibraryRoutes from '../routes/file-library';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type Handler = (req: any, reply: any) => Promise<any> | any;

const handlers: Record<string, Handler> = {};

async function loadRoutes() {
  const fakeFastify = {
    get: (p: string, h: Handler) => {
      handlers['GET ' + p] = h;
    },
    post: (p: string, h: Handler) => {
      handlers['POST ' + p] = h;
    },
    delete: (p: string, h: Handler) => {
      handlers['DELETE ' + p] = h;
    },
  };
  await (fileLibraryRoutes as any)(fakeFastify);
}

function makeReply() {
  const reply: any = {};
  reply.status = vi.fn(() => reply);
  reply.send = vi.fn((payload: any) => payload);
  return reply;
}

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    body: {},
    headers: {},
    params: {},
    query: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('file-library identity hardening (P0-7)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    if (!handlers['GET /']) {
      await loadRoutes();
    }
  });

  it('rejects a forged x-user-id header with 401 UNAUTHORIZED (no verified auth)', async () => {
    const list = handlers['GET /'];
    const req = makeRequest({ headers: { 'x-user-id': 'victim-user-9' } });
    const reply = makeReply();

    await expect(list(req, reply)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
    expect(listFiles).not.toHaveBeenCalled();
    expect(searchFiles).not.toHaveBeenCalled();
  });

  it('ignores the x-user-id header: files are listed under the verified auth identity', async () => {
    const list = handlers['GET /'];
    const req = makeRequest({
      auth: { userId: 'jwt-user-1' },
      headers: { 'x-user-id': 'attacker-impersonated-user' },
    });
    const reply = makeReply();

    await list(req, reply);

    expect(listFiles).toHaveBeenCalledTimes(1);
    const [listedUserId] = listFiles.mock.calls[0];
    expect(listedUserId).toBe('jwt-user-1');
    expect(listedUserId).not.toBe('attacker-impersonated-user');
  });

  it('lists files for a verified auth identity (happy path)', async () => {
    const list = handlers['GET /'];
    listFiles.mockReturnValueOnce([{ id: 'f1', name: 'a.txt' }]);
    const req = makeRequest({ auth: { userId: 'user-abc-123' } });
    const reply = makeReply();

    const payload = await list(req, reply);

    expect(listFiles).toHaveBeenCalledTimes(1);
    expect(listFiles.mock.calls[0][0]).toBe('user-abc-123');
    expect(payload.success).toBe(true);
  });

  it('contains no header-trusted identity in the route source', () => {
    const sourcePath = path.resolve(
      __dirname,
      '../routes/file-library.ts',
    );
    const source = fs.readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('x-user-id');
    expect(source).not.toContain('user_default');
    expect(source).not.toContain('user-default');
  });
});
