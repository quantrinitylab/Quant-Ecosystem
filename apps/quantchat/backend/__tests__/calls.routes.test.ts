import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import callsRoutes from '../routes/calls';
import { errorHandlerPlugin } from '@quant/server-core';

// Mock the LiveKit SDK so the positive-path test exercises real route logic
// (room creation + signed token issuance) without network access.
vi.mock('livekit-server-sdk', () => {
  const mockCreateRoom = vi.fn().mockResolvedValue({
    name: 'chat-call:test-call',
    sid: 'RM_call123',
    numParticipants: 0,
    maxParticipants: 8,
  });

  const RoomServiceClient = vi.fn().mockImplementation(function () {
    return {
      createRoom: mockCreateRoom,
      deleteRoom: vi.fn().mockResolvedValue(undefined),
      removeParticipant: vi.fn().mockResolvedValue(undefined),
    };
  });

  const mockToJwt = vi.fn().mockResolvedValue('header.signed-jwt-token.signature');
  const mockAddGrant = vi.fn();

  const AccessToken = vi.fn().mockImplementation(function () {
    return {
      addGrant: mockAddGrant,
      toJwt: mockToJwt,
    };
  });

  return {
    RoomServiceClient,
    AccessToken,
  };
});

const LIVEKIT_ENV_KEYS = [
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'LIVEKIT_WS_URL',
  'LIVEKIT_URL',
];

function clearLiveKitEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of LIVEKIT_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const key of LIVEKIT_ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  // callsRoutes reads request.auth.userId (set by the auth plugin in prod);
  // stub it for these route tests.
  app.addHook('onRequest', (request, _reply, done) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: 'test-user' };
    done();
  });
  await app.register(callsRoutes, { prefix: '/calls' });
  await app.ready();
  return app;
}

describe('calls routes fail closed without LiveKit configuration', () => {
  let app: FastifyInstance;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    savedEnv = clearLiveKitEnv();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    restoreEnv(savedEnv);
  });

  it('POST /calls/create returns 503 CALLS_UNAVAILABLE instead of unsigned mock tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-1', participantIds: ['user-2'] },
    });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CALLS_UNAVAILABLE');
    expect(body.error.message).toContain('LiveKit is not configured');
    expect(JSON.stringify(body)).not.toContain('mock_token_');
  });

  it('POST /calls/end returns 503 CALLS_UNAVAILABLE instead of a fake "Call ended (mock)" ack', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/end',
      payload: { roomId: 'room_abc123' },
    });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CALLS_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('Call ended (mock)');
  });

  it('GET /calls/:id/token fails closed without LIVEKIT_API_SECRET', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/calls/call_123/token',
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('CALLS_UNAVAILABLE');
  });

  it('POST /calls/initiate fails closed without LiveKit configuration', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/initiate',
      payload: { calleeId: 'user-2' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('CALLS_UNAVAILABLE');
  });
});

describe('calls routes issue real signed tokens when LiveKit is configured', () => {
  let app: FastifyInstance;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    savedEnv = clearLiveKitEnv();
    process.env['LIVEKIT_API_KEY'] = 'test-key';
    process.env['LIVEKIT_API_SECRET'] = 'test-secret';
    process.env['LIVEKIT_WS_URL'] = 'ws://livekit.test:7880';
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    restoreEnv(savedEnv);
  });

  it('POST /calls/create returns a real room id and signed (non-mock) tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-1', participantIds: ['user-2'] },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.roomId).toMatch(/^call_/);
    expect(body.data.tokens['test-user']).toBe('header.signed-jwt-token.signature');
    expect(body.data.tokens['user-2']).toBe('header.signed-jwt-token.signature');
    expect(JSON.stringify(body)).not.toContain('mock_token_');
  });
});
