import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import callsRoutes from '../routes/calls';
import { errorHandlerPlugin } from '@quant/server-core';

// QC-F-218: POST /calls/initiate and POST /calls/group used to bypass the
// QC-F-075 membership gate entirely — any logged-in user could create a
// LiveKit room "calling" any userId (never-met, blocked, non-existent),
// and the call left no durable history row. These tests pin the fix:
// both endpoints require conversationId, assert caller + every callee /
// participant is an active member of that conversation (fail-closed 503
// when membership cannot be verified), and persist the started call
// exactly like /calls/create. A rejected attempt must create NO LiveKit
// room and NO history row.
// Resume-run additions (specialist brief §5 gaps): group 404, self-call
// rejection, and the 1:1 blocked-check (callee's chatSettings.blockedUsers
// via PrivacyService.checkBlockedBy — 403 CALLER_BLOCKED, fail-closed 503
// BLOCKED_CHECK_UNAVAILABLE when block status cannot be verified).
//
// Mock pattern mirrors calls.routes.test.ts: stable module-level hoisted
// LiveKit mocks (no fresh-identity mocks), so room creation can be
// counted precisely.
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
 * Minimal faithful Prisma fake for the membership gate + call
 * persistence: conversation existence, conversationMember.findMany with
 * real `leftAt: null` (active-only) semantics, and the Call delegate used
 * by CallRecordService.recordStarted (findFirst → null, then create).
 * Same shape as calls.routes.test.ts.
 */
function createFakePrisma(input: {
  conversations: string[];
  members: FakeMemberRow[];
  // QC-F-218 blocked-check: raw User.preferences per user id (the block
  // list lives at chatSettings.blockedUsers on the CALLEE's row).
  userPreferences?: Record<string, unknown>;
  // Simulate a Prisma handle without the user delegate (blocked-check
  // must then fail closed, exactly like the membership gate does).
  omitUserDelegate?: boolean;
}) {
  const callCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'call-row-1',
    ...data,
  }));

  const prisma = {
    ...(input.omitUserDelegate
      ? {}
      : {
          user: {
            findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
              preferences: input.userPreferences?.[where.id] ?? null,
            })),
          },
        }),
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

// NOTE on describe order: the fail-closed describe must run BEFORE any
// LiveKit-configured test in this file, because routes/calls.ts caches a
// module-level shared CallService on first successful construction
// (same constraint as calls.routes.test.ts).
describe('QC-F-218: initiate/group still fail closed without LiveKit', () => {
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

  it('POST /calls/initiate returns 503 CALLS_UNAVAILABLE (LiveKit check precedes the gate)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/initiate',
      payload: { calleeId: 'user-2', conversationId: 'conv-1' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('CALLS_UNAVAILABLE');
  });

  it('POST /calls/group returns 503 CALLS_UNAVAILABLE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/group',
      payload: { participantIds: ['user-2'], conversationId: 'conv-1' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('CALLS_UNAVAILABLE');
  });
});

describe('QC-F-218: initiate/group membership gate (LiveKit configured)', () => {
  let app: FastifyInstance;
  let savedEnv: Record<string, string | undefined>;
  let fake: ReturnType<typeof createFakePrisma>;

  const members: FakeMemberRow[] = [
    { conversationId: 'conv-1', userId: 'test-user', leftAt: null },
    { conversationId: 'conv-1', userId: 'user-2', leftAt: null },
    { conversationId: 'conv-1', userId: 'user-3', leftAt: null },
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

  it('initiate: member calling a member succeeds AND persists one durable history row', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/initiate',
      payload: { calleeId: 'user-2', conversationId: 'conv-1' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.callId).toMatch(/^call_/);
    expect(body.data.participantIds).toEqual(['test-user', 'user-2']);
    expect(livekitMocks.mockCreateRoom).toHaveBeenCalledTimes(1);
    // The bypass also skipped persistence — the gated path must not.
    expect(fake.callCreate).toHaveBeenCalledTimes(1);
    const persisted = fake.callCreate.mock.calls[0]?.[0]?.data as {
      conversationId: string;
      initiatorId: string;
      participants: string[];
    };
    expect(persisted.conversationId).toBe('conv-1');
    expect(persisted.initiatorId).toBe('test-user');
    expect(persisted.participants).toEqual(['test-user', 'user-2']);
  });

  it('initiate: rejects a callee who is NOT a conversation member with 403 NOT_A_MEMBER and zero side effects', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/initiate',
      payload: { calleeId: 'ghost-user', conversationId: 'conv-1' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('initiate: rejects a non-member CALLER with 403 NOT_A_MEMBER and zero side effects', async () => {
    const outsiderApp = await buildApp({ userId: 'outsider', prisma: fake.prisma });
    try {
      const res = await outsiderApp.inject({
        method: 'POST',
        url: '/calls/initiate',
        payload: { calleeId: 'user-2', conversationId: 'conv-1' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('NOT_A_MEMBER');
      expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
      expect(fake.callCreate).not.toHaveBeenCalled();
    } finally {
      await outsiderApp.close();
    }
  });

  it('initiate: rejects a callee who LEFT the conversation (leftAt set) with 403 NOT_A_MEMBER', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/initiate',
      payload: { calleeId: 'user-left', conversationId: 'conv-1' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('initiate: returns 404 CONVERSATION_NOT_FOUND for a conversation that does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/initiate',
      payload: { calleeId: 'user-2', conversationId: 'no-such-conv' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('CONVERSATION_NOT_FOUND');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('initiate: missing conversationId is a 400 VALIDATION_ERROR — the gate cannot be skipped by omitting it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/initiate',
      payload: { calleeId: 'user-2' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('initiate: fails closed with 503 MEMBERSHIP_CHECK_UNAVAILABLE when Prisma is unavailable', async () => {
    const bareApp = await buildApp();
    try {
      const res = await bareApp.inject({
        method: 'POST',
        url: '/calls/initiate',
        payload: { calleeId: 'user-2', conversationId: 'conv-1' },
      });

      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('MEMBERSHIP_CHECK_UNAVAILABLE');
      expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    } finally {
      await bareApp.close();
    }
  });

  it('group: members-only group call succeeds AND persists one durable history row', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/group',
      payload: { participantIds: ['user-2', 'user-3'], conversationId: 'conv-1' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.participantIds).toEqual(['test-user', 'user-2', 'user-3']);
    expect(livekitMocks.mockCreateRoom).toHaveBeenCalledTimes(1);
    expect(fake.callCreate).toHaveBeenCalledTimes(1);
    const persisted = fake.callCreate.mock.calls[0]?.[0]?.data as {
      conversationId: string;
      participants: string[];
    };
    expect(persisted.conversationId).toBe('conv-1');
    expect(persisted.participants).toEqual(['test-user', 'user-2', 'user-3']);
  });

  it('group: rejects when ANY participant is not a member with 403 NOT_A_MEMBER and zero side effects', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/group',
      payload: { participantIds: ['user-2', 'ghost-user'], conversationId: 'conv-1' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('group: missing conversationId is a 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/group',
      payload: { participantIds: ['user-2'] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('group: returns 404 CONVERSATION_NOT_FOUND for a conversation that does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/group',
      payload: { participantIds: ['user-2'], conversationId: 'no-such-conv' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('CONVERSATION_NOT_FOUND');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('initiate: rejects a self-call with 400 VALIDATION_ERROR and zero side effects', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/initiate',
      payload: { calleeId: 'test-user', conversationId: 'conv-1' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('initiate: rejects with 403 CALLER_BLOCKED when the callee blocked the caller (object-form entry) and zero side effects', async () => {
    const blockedFake = createFakePrisma({
      conversations: ['conv-1'],
      members,
      userPreferences: {
        'user-2': {
          chatSettings: {
            blockedUsers: [
              { id: 'test-user', name: 'Test User', username: 'test', blockedAt: '2026-10-01T00:00:00.000Z' },
            ],
          },
        },
      },
    });
    const blockedApp = await buildApp({ prisma: blockedFake.prisma });
    try {
      const res = await blockedApp.inject({
        method: 'POST',
        url: '/calls/initiate',
        payload: { calleeId: 'user-2', conversationId: 'conv-1' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('CALLER_BLOCKED');
      expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
      expect(blockedFake.callCreate).not.toHaveBeenCalled();
    } finally {
      await blockedApp.close();
    }
  });

  it('initiate: rejects with 403 CALLER_BLOCKED when the callee blocked the caller (string-form entry)', async () => {
    const blockedFake = createFakePrisma({
      conversations: ['conv-1'],
      members,
      userPreferences: {
        'user-3': { chatSettings: { blockedUsers: ['test-user'] } },
      },
    });
    const blockedApp = await buildApp({ prisma: blockedFake.prisma });
    try {
      const res = await blockedApp.inject({
        method: 'POST',
        url: '/calls/initiate',
        payload: { calleeId: 'user-3', conversationId: 'conv-1' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('CALLER_BLOCKED');
      expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
      expect(blockedFake.callCreate).not.toHaveBeenCalled();
    } finally {
      await blockedApp.close();
    }
  });

  it('initiate: a callee who blocked SOMEONE ELSE can still be called (201 + persists)', async () => {
    const clearFake = createFakePrisma({
      conversations: ['conv-1'],
      members,
      userPreferences: {
        'user-2': { chatSettings: { blockedUsers: [{ id: 'someone-else' }] } },
      },
    });
    const clearApp = await buildApp({ prisma: clearFake.prisma });
    try {
      const res = await clearApp.inject({
        method: 'POST',
        url: '/calls/initiate',
        payload: { calleeId: 'user-2', conversationId: 'conv-1' },
      });

      expect(res.statusCode).toBe(201);
      expect(livekitMocks.mockCreateRoom).toHaveBeenCalledTimes(1);
      expect(clearFake.callCreate).toHaveBeenCalledTimes(1);
    } finally {
      await clearApp.close();
    }
  });

  it('initiate: fails closed with 503 BLOCKED_CHECK_UNAVAILABLE when the user delegate is unavailable', async () => {
    const noUserFake = createFakePrisma({
      conversations: ['conv-1'],
      members,
      omitUserDelegate: true,
    });
    const noUserApp = await buildApp({ prisma: noUserFake.prisma });
    try {
      const res = await noUserApp.inject({
        method: 'POST',
        url: '/calls/initiate',
        payload: { calleeId: 'user-2', conversationId: 'conv-1' },
      });

      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('BLOCKED_CHECK_UNAVAILABLE');
      expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
      expect(noUserFake.callCreate).not.toHaveBeenCalled();
    } finally {
      await noUserApp.close();
    }
  });

  it('group: fails closed with 503 MEMBERSHIP_CHECK_UNAVAILABLE when Prisma is unavailable', async () => {
    const bareApp = await buildApp();
    try {
      const res = await bareApp.inject({
        method: 'POST',
        url: '/calls/group',
        payload: { participantIds: ['user-2'], conversationId: 'conv-1' },
      });

      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('MEMBERSHIP_CHECK_UNAVAILABLE');
      expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    } finally {
      await bareApp.close();
    }
  });
});
