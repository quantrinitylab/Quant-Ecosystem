// ============================================================================
// security-p0: image-inpainting identity-forgery regression tests
// P0-6 — ensures identity comes ONLY from verified auth (request.user).
// Run against PATCHED sources (post `git apply` of
// patches/quantai-image-inpainting-identity.patch); the extract copy mirrors
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
  createInpaintingJob: vi.fn((userId: string, _opts: Record<string, unknown>) => ({
    id: 'job-1',
    userId,
    status: 'queued',
  })),
  processInpaintingJob: vi.fn(async (id: string) => ({ id, status: 'done' })),
  getInpaintingJobStatus: vi.fn((_id: string) => null),
  calculateMaskCoverage: vi.fn(() => ({ coveragePercentage: 42 })),
}));
const { createInpaintingJob } = mocks;

vi.mock('../services/image-inpainting.service', () => ({
  createInpaintingJob: mocks.createInpaintingJob,
  processInpaintingJob: mocks.processInpaintingJob,
  getInpaintingJobStatus: mocks.getInpaintingJobStatus,
  calculateMaskCoverage: mocks.calculateMaskCoverage,
}));

// Route module under test
import imageInpaintingRoutes from '../routes/image-inpainting';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type Handler = (req: any, reply: any) => Promise<any> | any;

const handlers: Record<string, Handler> = {};

async function loadRoutes() {
  const fakeFastify = {
    post: (p: string, h: Handler) => {
      handlers['POST ' + p] = h;
    },
    get: (p: string, h: Handler) => {
      handlers['GET ' + p] = h;
    },
  };
  await (imageInpaintingRoutes as any)(fakeFastify);
}

function makeReply() {
  const reply: any = {};
  reply.status = vi.fn(() => reply);
  reply.send = vi.fn((payload: any) => payload);
  return reply;
}

const validBody = {
  originalImageUrl: 'https://example.com/img.png',
  maskBox: { x: 0, y: 0, width: 100, height: 100 },
  prompt: 'fill the sky',
};

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    body: { ...validBody },
    headers: {},
    params: {},
    query: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('image-inpainting identity hardening (P0-6)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    if (!handlers['POST /image/inpaint']) {
      await loadRoutes();
    }
  });

  it('rejects a forged x-user-id header with 401 UNAUTHORIZED (no verified user)', async () => {
    const create = handlers['POST /image/inpaint'];
    const req = makeRequest({ headers: { 'x-user-id': 'victim-user-9' } });
    const reply = makeReply();

    await expect(create(req, reply)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
    expect(createInpaintingJob).not.toHaveBeenCalled();
  });

  it('rejects requests with no identity at all (kills the user_default fallback)', async () => {
    const create = handlers['POST /image/inpaint'];
    const req = makeRequest();
    const reply = makeReply();

    await expect(create(req, reply)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
    expect(createInpaintingJob).not.toHaveBeenCalled();
  });

  it('ignores the x-user-id header: job is created under the verified identity', async () => {
    const create = handlers['POST /image/inpaint'];
    const req = makeRequest({
      user: { id: 'jwt-user-1' },
      headers: { 'x-user-id': 'attacker-impersonated-user' },
    });
    const reply = makeReply();

    const payload = await create(req, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(createInpaintingJob).toHaveBeenCalledTimes(1);
    const [createdUserId] = createInpaintingJob.mock.calls[0];
    expect(createdUserId).toBe('jwt-user-1');
    expect(createdUserId).not.toBe('attacker-impersonated-user');
    expect(payload.success).toBe(true);
    expect(payload.data.userId).toBe('jwt-user-1');
  });

  it('contains no user_default identity and no header-trusted identity in the route source', () => {
    const sourcePath = path.resolve(
      __dirname,
      '../routes/image-inpainting.ts',
    );
    const source = fs.readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('user_default');
    expect(source).not.toContain('user-default');
    expect(source).not.toContain('x-user-id');
  });
});
