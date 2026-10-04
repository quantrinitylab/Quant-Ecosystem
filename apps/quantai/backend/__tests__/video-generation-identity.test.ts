// ============================================================================
// security-p0: video-generation identity-impersonation regression tests
// P0-1 — ensures identity comes ONLY from verified auth (request.user).
// These tests are written for merge-time execution (not run in staging).
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

const {
  createVideoGenerationJob,
  processVideoJob,
  getVideoJobStatus,
  interpolatePromptFrames,
  validateCameraMotion,
} = vi.hoisted(() => {
  // vi.hoisted runs before vitest hoists the vi.mock factories below, so the
  // factory can safely close over these mocks (otherwise: "Cannot access
  // before initialization").
  return {
    createVideoGenerationJob: vi.fn((userId: string, _opts: Record<string, unknown>) => ({
      id: 'job-1',
      userId,
      status: 'queued',
    })),
    processVideoJob: vi.fn(async (id: string) => ({ id, status: 'done' })),
    getVideoJobStatus: vi.fn((_id: string) => null),
    interpolatePromptFrames: vi.fn((a: string, b: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${a}->${b}#${i}`),
    ),
    validateCameraMotion: vi.fn((_m: string) => true),
  };
});

vi.mock('../services/ai-video-generation.service', () => ({
  createVideoGenerationJob,
  processVideoJob,
  getVideoJobStatus,
  interpolatePromptFrames,
  validateCameraMotion,
  VALID_CAMERA_MOTIONS: ['static'],
  VALID_ASPECT_RATIOS: ['16:9'],
  CAMERA_MOTION_VECTORS: {},
}));

// Route module under test
import videoGenerationRoutes from '../routes/video-generation';

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
  await (videoGenerationRoutes as any)(fakeFastify);
}

function makeReply() {
  const reply: any = {};
  reply.status = vi.fn(() => reply);
  reply.send = vi.fn((payload: any) => payload);
  return reply;
}

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    body: { prompt: 'a test video prompt' },
    headers: {},
    params: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('video-generation identity hardening (P0-1)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    if (!handlers['POST /video/generate']) {
      await loadRoutes();
    }
  });

  it('rejects requests with no verified user with 401 UNAUTHORIZED', async () => {
    const generate = handlers['POST /video/generate'];
    const req = makeRequest(); // no request.user at all
    const reply = makeReply();

    await expect(generate(req, reply)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
    expect(createVideoGenerationJob).not.toHaveBeenCalled();
  });

  it('ignores the x-user-id header: job is created under the JWT identity, never the header', async () => {
    const generate = handlers['POST /video/generate'];
    const req = makeRequest({
      user: { id: 'jwt-user-1' },
      headers: { 'x-user-id': 'attacker-impersonated-user' },
    });
    const reply = makeReply();

    const payload = await generate(req, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(createVideoGenerationJob).toHaveBeenCalledTimes(1);
    const [createdUserId] = createVideoGenerationJob.mock.calls[0];
    expect(createdUserId).toBe('jwt-user-1');
    expect(createdUserId).not.toBe('attacker-impersonated-user');
    expect(payload.success).toBe(true);
    expect(payload.data.userId).toBe('jwt-user-1');
  });

  it('contains no user_default identity and no header-trusted identity in the route source', () => {
    const sourcePath = path.resolve(
      __dirname,
      '../routes/video-generation.ts',
    );
    const source = fs.readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('user_default');
    expect(source).not.toContain('user-default');
    expect(source).not.toContain('x-user-id');
  });

  it('creates the job under a valid JWT identity', async () => {
    const generate = handlers['POST /api/ai/video/generate'];
    const req = makeRequest({ user: { id: 'user-abc-123' } });
    const reply = makeReply();

    await generate(req, reply);

    expect(createVideoGenerationJob).toHaveBeenCalledTimes(1);
    expect(createVideoGenerationJob.mock.calls[0][0]).toBe('user-abc-123');
    expect(reply.status).toHaveBeenCalledWith(201);
  });
});
