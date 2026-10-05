// ============================================================================
// security-p0: mcp-connectors identity-forgery regression tests
// P0-8 — getAuthenticatedUserId must not trust the x-user-id header and must
// not fall back to the shared 'user-default' identity (cross-user connector
// state leak).
// Run against PATCHED sources (post `git apply` of
// patches/quantai-mcp-connectors-identity.patch); the extract copy mirrors
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
  listConnectors: vi.fn((_userId: string) => []),
}));
const { listConnectors } = mocks;

vi.mock('../services/mcp-connectors.service', () => ({
  McpConnectorsService: class {
    listConnectors = mocks.listConnectors;
  },
}));

// Route module under test
import mcpConnectorsRoutes from '../routes/mcp-connectors';

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
  await (mcpConnectorsRoutes as any)(fakeFastify);
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

describe('mcp-connectors identity hardening (P0-8)', () => {
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
    expect(listConnectors).not.toHaveBeenCalled();
  });

  it('rejects requests with no identity at all (kills the user-default fallback)', async () => {
    const list = handlers['GET /'];
    const req = makeRequest();
    const reply = makeReply();

    await expect(list(req, reply)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
    expect(listConnectors).not.toHaveBeenCalled();
  });

  it('ignores the x-user-id header: connectors listed under the verified auth identity', async () => {
    const list = handlers['GET /'];
    const req = makeRequest({
      auth: { userId: 'jwt-user-1' },
      headers: { 'x-user-id': 'attacker-impersonated-user' },
    });
    const reply = makeReply();

    await list(req, reply);

    expect(listConnectors).toHaveBeenCalledTimes(1);
    const [listedUserId] = listConnectors.mock.calls[0];
    expect(listedUserId).toBe('jwt-user-1');
    expect(listedUserId).not.toBe('attacker-impersonated-user');
    expect(listedUserId).not.toBe('user-default');
  });

  it('contains no user-default identity and no header-trusted identity in the route source', () => {
    const sourcePath = path.resolve(
      __dirname,
      '../routes/mcp-connectors.ts',
    );
    const source = fs.readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('user-default');
    expect(source).not.toContain('user_default');
    expect(source).not.toContain('x-user-id');
  });
});
