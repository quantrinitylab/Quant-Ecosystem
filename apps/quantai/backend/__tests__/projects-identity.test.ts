// ============================================================================
// security-p0: projects identity-forgery regression tests
// P0-9 — getAuthenticatedUserId must not trust the x-user-id header on project
// listing (and every other projects handler sharing the helper).
// Run against PATCHED sources (post `git apply` of
// patches/quantai-projects-identity.patch); the extract copy mirrors
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
  listProjects: vi.fn(async (_userId: string) => []),
}));
const { listProjects } = mocks;

vi.mock('../services/project.service', () => ({
  projectService: { listProjects: mocks.listProjects },
}));

// Route module under test
import projectsRoutes from '../routes/projects';

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
    patch: (p: string, h: Handler) => {
      handlers['PATCH ' + p] = h;
    },
    delete: (p: string, h: Handler) => {
      handlers['DELETE ' + p] = h;
    },
  };
  await (projectsRoutes as any)(fakeFastify);
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

describe('projects identity hardening (P0-9)', () => {
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
    expect(listProjects).not.toHaveBeenCalled();
  });

  it('ignores the x-user-id header: projects listed under the verified auth identity', async () => {
    const list = handlers['GET /'];
    const req = makeRequest({
      auth: { userId: 'jwt-user-1' },
      headers: { 'x-user-id': 'attacker-impersonated-user' },
    });
    const reply = makeReply();

    const payload = await list(req, reply);

    expect(listProjects).toHaveBeenCalledTimes(1);
    const [listedUserId] = listProjects.mock.calls[0];
    expect(listedUserId).toBe('jwt-user-1');
    expect(listedUserId).not.toBe('attacker-impersonated-user');
    expect(payload.success).toBe(true);
  });

  it('accepts the server-set request.user identity (verified auth, not a header)', async () => {
    const list = handlers['GET /'];
    const req = makeRequest({
      user: { id: 'session-user-7' },
      headers: { 'x-user-id': 'attacker-impersonated-user' },
    });
    const reply = makeReply();

    await list(req, reply);

    expect(listProjects).toHaveBeenCalledTimes(1);
    expect(listProjects.mock.calls[0][0]).toBe('session-user-7');
  });

  it('contains no header-trusted identity in the route source', () => {
    const sourcePath = path.resolve(
      __dirname,
      '../routes/projects.ts',
    );
    const source = fs.readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('x-user-id');
    expect(source).not.toContain('user_default');
    expect(source).not.toContain('user-default');
  });
});
