import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import callsRoutes from '../routes/calls';
import { errorHandlerPlugin } from '@quant/server-core';

// Mock the LiveKit SDK so the positive-path tests exercise real route logic
// (room creation + signed token issuance) without network access. The mocks
// are stable module-level objects (hoisted) so tests can assert call counts
// — e.g. that /calls/create never constructs an AccessToken at all.
const livekitMocks = vi.hoisted(() => {
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

  return { mockCreateRoom, RoomServiceClient, AccessToken, mockToJwt, mockAddGrant };
});

vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: livekitMocks.RoomServiceClient,
  AccessToken: livekitMocks.AccessToken,
}));

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

interface FakeMemberRow {
  conversationId: string;
  userId: string;
  leftAt: Date | null;
}

/**
 * Minimal faithful Prisma fake for the QC-F-075 membership gate + call
 * persistence: conversation existence, conversationMember.findMany with
 * real `leftAt: null` (active-only) semantics, and the Call delegate used
 * by CallRecordService.recordStarted (findFirst → null, then create).
 */
function createFakePrisma(input: { conversations: string[]; members: FakeMemberRow[] }) {
  const callCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'call-row-1',
    ...data,
  }));

  const prisma = {
    conversation: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        input.conversations.includes(where.id) ? { id: where.id } : null,
      ),
    },
    conversationMember: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { conversationId: string; userId: { in: string[] }; leftAt: Date | null };
        }) =>
          input.members
            .filter(
              (m) =>
                m.conversationId === where.conversationId &&
                where.userId.in.includes(m.userId) &&
                (where.leftAt !== null || m.leftAt === null),
            )
            .map((m) => ({ userId: m.userId })),
      ),
    },
    call: {
      findFirst: vi.fn(async () => null),
      create: callCreate,
    },
  };

  return { prisma: prisma as unknown as PrismaClient, callCreate };
}

async function buildApp(
  options: { userId?: string; prisma?: PrismaClient } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  // callsRoutes reads fastify.prisma (the production decorator) for the
  // membership gate and call-history persistence; decorate BEFORE register
  // because the routes capture the record service at registration time.
  if (options.prisma) {
    app.decorate('prisma', options.prisma as never);
  }
  // callsRoutes reads request.auth.userId (set by the auth plugin in prod);
  // stub it for these route tests.
  const userId = options.userId ?? 'test-user';
  app.addHook('onRequest', (request, _reply, done) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId };
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
      // QC-F-218: conversationId is now a required field (membership gate);
      // the fail-closed assertion below is unchanged.
      payload: { calleeId: 'user-2', conversationId: 'conv-1' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('CALLS_UNAVAILABLE');
  });
});

describe('calls routes when LiveKit is configured (QC-F-075 membership gate)', () => {
  let app: FastifyInstance;
  let savedEnv: Record<string, string | undefined>;
  let fake: ReturnType<typeof createFakePrisma>;

  const members: FakeMemberRow[] = [
    { conversationId: 'conv-1', userId: 'test-user', leftAt: null },
    { conversationId: 'conv-1', userId: 'user-2', leftAt: null },
    { conversationId: 'conv-1', userId: 'user-left', leftAt: new Date('2026-10-01T00:00:00Z') },
  ];

  beforeEach(async () => {
    savedEnv = clearLiveKitEnv();
    process.env['LIVEKIT_API_KEY'] = 'test-key';
    process.env['LIVEKIT_API_SECRET'] = 'test-secret';
    process.env['LIVEKIT_WS_URL'] = 'ws://livekit.test:7880';
    livekitMocks.mockCreateRoom.mockClear();
    livekitMocks.AccessToken.mockClear();
    fake = createFakePrisma({ conversations: ['conv-1'], members });
    app = await buildApp({ prisma: fake.prisma });
  });

  afterEach(async () => {
    await app.close();
    restoreEnv(savedEnv);
  });

  it('POST /calls/create returns ONLY a room id — no token for any participant', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-1', participantIds: ['user-2'] },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.roomId).toMatch(/^call_/);
    // The impersonation map is gone: data carries exactly one key, no
    // token-shaped string appears anywhere in the response, and the route
    // never even constructed an AccessToken.
    expect(Object.keys(body.data)).toEqual(['roomId']);
    expect(body.data.tokens).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('signed-jwt-token');
    expect(JSON.stringify(body)).not.toContain('mock_token_');
    expect(livekitMocks.AccessToken).not.toHaveBeenCalled();
    // Authorized create still persists exactly one durable history row.
    expect(fake.callCreate).toHaveBeenCalledTimes(1);
    const persisted = fake.callCreate.mock.calls[0]?.[0]?.data as {
      conversationId: string;
      participants: string[];
    };
    expect(persisted.conversationId).toBe('conv-1');
    expect(persisted.participants).toEqual(['test-user', 'user-2']);
  });

  it('rejects a non-member initiator with 403 NOT_A_MEMBER and zero side effects', async () => {
    const outsiderApp = await buildApp({ userId: 'outsider', prisma: fake.prisma });
    try {
      const res = await outsiderApp.inject({
        method: 'POST',
        url: '/calls/create',
        payload: { conversationId: 'conv-1', participantIds: ['user-2'] },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('NOT_A_MEMBER');
      // No orphan LiveKit room, no token, no durable history row.
      expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
      expect(livekitMocks.AccessToken).not.toHaveBeenCalled();
      expect(fake.callCreate).not.toHaveBeenCalled();
    } finally {
      await outsiderApp.close();
    }
  });

  it('rejects a member initiator adding a non-member participant with 403 NOT_A_MEMBER', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-1', participantIds: ['user-2', 'ghost-user'] },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(livekitMocks.AccessToken).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('rejects a participant who left the conversation (leftAt set) with 403 NOT_A_MEMBER', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-1', participantIds: ['user-left'] },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('returns 404 CONVERSATION_NOT_FOUND for a conversation that does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'no-such-conv', participantIds: ['user-2'] },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('CONVERSATION_NOT_FOUND');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('fails closed with 503 MEMBERSHIP_CHECK_UNAVAILABLE when Prisma is unavailable', async () => {
    const bareApp = await buildApp();
    try {
      const res = await bareApp.inject({
        method: 'POST',
        url: '/calls/create',
        payload: { conversationId: 'conv-1', participantIds: ['user-2'] },
      });

      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('MEMBERSHIP_CHECK_UNAVAILABLE');
      expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
      expect(livekitMocks.AccessToken).not.toHaveBeenCalled();
    } finally {
      await bareApp.close();
    }
  });

  it('participants still get their OWN token via join/token; non-participants stay locked out', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-1', participantIds: ['user-2'] },
    });
    expect(createRes.statusCode).toBe(201);
    const roomId = (createRes.json().data as { roomId: string }).roomId;

    const memberApp = await buildApp({ userId: 'user-2', prisma: fake.prisma });
    const outsiderApp = await buildApp({ userId: 'outsider', prisma: fake.prisma });
    try {
      const joinRes = await memberApp.inject({
        method: 'POST',
        url: `/calls/${roomId}/join`,
      });
      expect(joinRes.statusCode).toBe(200);
      expect(joinRes.json().data.token).toBe('header.signed-jwt-token.signature');
      expect(joinRes.json().data.serverUrl).toBe('ws://livekit.test:7880');

      const tokenRes = await memberApp.inject({
        method: 'GET',
        url: `/calls/${roomId}/token`,
      });
      expect(tokenRes.statusCode).toBe(200);
      expect(tokenRes.json().data.token).toBe('header.signed-jwt-token.signature');

      const outsiderJoin = await outsiderApp.inject({
        method: 'POST',
        url: `/calls/${roomId}/join`,
      });
      expect(outsiderJoin.statusCode).toBe(403);
      expect(outsiderJoin.json().error.code).toBe('CALL_NOT_PARTICIPANT');
    } finally {
      await memberApp.close();
      await outsiderApp.close();
    }
  });
});
