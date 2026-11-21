import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import callsRoutes from '../routes/calls';
import { errorHandlerPlugin } from '@quant/server-core';

// QC-F-129 — POST /calls/:id/end fails closed without LiveKit.
//
// Separate file from qc-f-129-calls-id-end.routes.test.ts ON PURPOSE: the
// route plugin caches the CallService in a module-level singleton, so any
// positive-path test in the same file would construct it and this 503
// assertion could never fire (module state persists across describes in one
// file; vitest isolates modules per FILE). Here the env is always clear,
// the singleton is never built, and getCallService must throw
// CALLS_UNAVAILABLE instead of a fake 'Call ended'.

vi.mock('livekit-server-sdk', () => {
  const RoomServiceClient = vi.fn().mockImplementation(function () {
    return {
      createRoom: vi.fn().mockResolvedValue({}),
      deleteRoom: vi.fn().mockResolvedValue(undefined),
      removeParticipant: vi.fn().mockResolvedValue(undefined),
    };
  });
  const AccessToken = vi.fn().mockImplementation(function () {
    return { addGrant: vi.fn(), toJwt: vi.fn().mockResolvedValue('x') };
  });
  return { RoomServiceClient, AccessToken };
});

const LIVEKIT_ENV_KEYS = ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_WS_URL', 'LIVEKIT_URL'];

describe('QC-F-129 POST /calls/:id/end fail-closed without LiveKit', () => {
  let app: FastifyInstance;
  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    savedEnv = {};
    for (const key of LIVEKIT_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    app.addHook('onRequest', (request, _reply, done) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-a' };
      done();
    });
    await app.register(callsRoutes, { prefix: '/calls' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    for (const key of LIVEKIT_ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('returns 503 CALLS_UNAVAILABLE — never a fake "Call ended"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/some-call-id/end',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CALLS_UNAVAILABLE');
  });
});
