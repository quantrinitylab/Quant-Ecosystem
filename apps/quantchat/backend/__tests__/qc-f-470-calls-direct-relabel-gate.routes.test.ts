import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import callsRoutes from '../routes/calls';
import { errorHandlerPlugin } from '@quant/server-core';

// QC-F-470: POST /calls/create and POST /calls/group used to bypass the
// QC-F-218 1:1 blocked gate by RELABELLING: the gate lived only on
// /calls/initiate, and neither sibling route ever read the conversation's
// type — so a caller whom the other party had blocked could post the very
// same DIRECT conversation to /create or /group and still get a real
// LiveKit room, a durable call-history row, and participant eligibility.
// The fix binds the gate to the call SHAPE: when the conversation ROW is
// DIRECT, ConversationService.assertDirectCallNotBlocked runs the same
// fail-closed one-directional check against the conversation's other
// ACTIVE member(s) (peer set from membership, never from participantIds).
// Real GROUP / CHANNEL conversations keep QC-F-218's recorded exemption.
// A rejected attempt must create NO LiveKit room and NO history row.
//
// Mock pattern mirrors qc-f-218-…: stable module-level hoisted LiveKit
// mocks (no fresh-identity mocks), so room creation can be counted.
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

const MEMBERS: FakeMemberRow[] = [
  { conversationId: 'conv-direct', userId: 'test-user', leftAt: null },
  { conversationId: 'conv-direct', userId: 'user-2', leftAt: null },
  { conversationId: 'conv-group', userId: 'test-user', leftAt: null },
  { conversationId: 'conv-group', userId: 'user-2', leftAt: null },
  { conversationId: 'conv-group', userId: 'user-3', leftAt: null },
  { conversationId: 'conv-channel', userId: 'test-user', leftAt: null },
  { conversationId: 'conv-channel', userId: 'user-2', leftAt: null },
];

const CONVERSATION_TYPES: Record<string, string> = {
  'conv-direct': 'DIRECT',
  'conv-group': 'GROUP',
  'conv-channel': 'CHANNEL',
};

/** user-2 has blocked the caller (object-form entry, the shipped shape). */
const BLOCKED_BY_USER2: Record<string, unknown> = {
  'user-2': {
    chatSettings: {
      blockedUsers: [
        { id: 'test-user', name: 'Test User', username: 'test', blockedAt: '2026-10-01T00:00:00.000Z' },
      ],
    },
  },
};

/**
 * Minimal faithful Prisma fake for the membership gate + the QC-F-470
 * direct-call gate + call persistence. Extensions over the QC-F-218 fake:
 * conversation.findUnique also serves the ROW's `type`, and
 * conversationMember.findMany honestly serves BOTH query shapes — the
 * `userId: { in: [...] }` form (assertAllMembers) and the no-`in`
 * all-active-members form (assertDirectCallNotBlocked).
 */
function createFakePrisma(input: {
  userPreferences?: Record<string, unknown>;
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
        where.id in CONVERSATION_TYPES
          ? { id: where.id, type: CONVERSATION_TYPES[where.id] }
          : null,
      ),
    },
    conversationMember: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            conversationId: string;
            userId?: { in: string[] };
            leftAt: Date | null;
          };
        }) =>
          MEMBERS.filter(
            (m) =>
              m.conversationId === where.conversationId &&
              (where.userId?.in === undefined || where.userId.in.includes(m.userId)) &&
              (where.leftAt !== null || m.leftAt === null),
          ).map((m) => ({ userId: m.userId })),
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
  if (options.prisma) {
    app.decorate('prisma', options.prisma as never);
  }
  const userId = options.userId ?? 'test-user';
  app.addHook('onRequest', (request, _reply, done) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId };
    done();
  });
  await app.register(callsRoutes, { prefix: '/calls' });
  await app.ready();
  return app;
}

describe('QC-F-470: DIRECT-relabel blocked gate on /create + /group (LiveKit configured)', () => {
  let savedEnv: Record<string, string | undefined>;
  const openApps: FastifyInstance[] = [];

  async function appWith(fake: ReturnType<typeof createFakePrisma>): Promise<FastifyInstance> {
    const app = await buildApp({ prisma: fake.prisma });
    openApps.push(app);
    return app;
  }

  beforeEach(() => {
    savedEnv = clearLiveKitEnv();
    process.env['LIVEKIT_API_KEY'] = 'test-key';
    process.env['LIVEKIT_API_SECRET'] = 'test-secret';
    process.env['LIVEKIT_WS_URL'] = 'ws://livekit.test:7880';
    livekitMocks.mockCreateRoom.mockClear();
    livekitMocks.AccessToken.mockClear();
  });

  afterEach(async () => {
    while (openApps.length > 0) {
      await openApps.pop()!.close();
    }
    restoreEnv(savedEnv);
  });

  // ---- Hamla-band: DIRECT + blocked, teeno raaste ----

  it('1. /create on a DIRECT conversation: 403 CALLER_BLOCKED when the other member blocked the caller; no room, no row', async () => {
    const fake = createFakePrisma({ userPreferences: BLOCKED_BY_USER2 });
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-direct', participantIds: ['user-2'] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CALLER_BLOCKED');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('2. /group on a DIRECT conversation: 403 CALLER_BLOCKED with the same body; no room, no row', async () => {
    const fake = createFakePrisma({ userPreferences: BLOCKED_BY_USER2 });
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/group',
      payload: { conversationId: 'conv-direct', participantIds: ['user-2'] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CALLER_BLOCKED');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('3. /initiate on the same DIRECT pair stays 403 CALLER_BLOCKED (parity control)', async () => {
    const fake = createFakePrisma({ userPreferences: BLOCKED_BY_USER2 });
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/initiate',
      payload: { calleeId: 'user-2', conversationId: 'conv-direct' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CALLER_BLOCKED');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('4. /create DIRECT with a SELF-ONLY payload still 403: the peer comes from membership, not participantIds', async () => {
    const fake = createFakePrisma({ userPreferences: BLOCKED_BY_USER2 });
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-direct', participantIds: ['test-user'] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CALLER_BLOCKED');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('5. /group DIRECT with a SELF-ONLY payload still 403 CALLER_BLOCKED', async () => {
    const fake = createFakePrisma({ userPreferences: BLOCKED_BY_USER2 });
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/group',
      payload: { conversationId: 'conv-direct', participantIds: ['test-user'] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CALLER_BLOCKED');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  // ---- Fail-closed: DIRECT + jaanch ho hi na sake ----

  it('6. /create DIRECT fails closed 503 BLOCKED_CHECK_UNAVAILABLE when the user delegate is unavailable', async () => {
    const fake = createFakePrisma({ omitUserDelegate: true });
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-direct', participantIds: ['user-2'] },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('BLOCKED_CHECK_UNAVAILABLE');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('7. /group DIRECT fails closed 503 BLOCKED_CHECK_UNAVAILABLE when the user delegate is unavailable', async () => {
    const fake = createFakePrisma({ omitUserDelegate: true });
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/group',
      payload: { conversationId: 'conv-direct', participantIds: ['user-2'] },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('BLOCKED_CHECK_UNAVAILABLE');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  it('8. /create DIRECT fails closed 503 when the peer stored preferences are malformed', async () => {
    const fake = createFakePrisma({
      userPreferences: { 'user-2': 'malformed-not-an-object' },
    });
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-direct', participantIds: ['user-2'] },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('BLOCKED_CHECK_UNAVAILABLE');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });

  // ---- Chalna chahiye: DIRECT + unblocked ----

  it('9. /create DIRECT unblocked: 201 with only {roomId}, one room, one row for [caller, peer]', async () => {
    const fake = createFakePrisma({});
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-direct', participantIds: ['user-2'] },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Object.keys(body.data)).toEqual(['roomId']);
    expect(livekitMocks.mockCreateRoom).toHaveBeenCalledTimes(1);
    expect(fake.callCreate).toHaveBeenCalledTimes(1);
    const persisted = fake.callCreate.mock.calls[0]?.[0]?.data as {
      conversationId: string;
      participants: string[];
    };
    expect(persisted.conversationId).toBe('conv-direct');
    expect(persisted.participants).toEqual(['test-user', 'user-2']);
  });

  it('10. /group DIRECT unblocked: 201, one room, one row', async () => {
    const fake = createFakePrisma({});
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/group',
      payload: { conversationId: 'conv-direct', participantIds: ['user-2'] },
    });
    expect(res.statusCode).toBe(201);
    expect(livekitMocks.mockCreateRoom).toHaveBeenCalledTimes(1);
    expect(fake.callCreate).toHaveBeenCalledTimes(1);
  });

  it('11. /initiate DIRECT unblocked: 201 (control)', async () => {
    const fake = createFakePrisma({});
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/initiate',
      payload: { calleeId: 'user-2', conversationId: 'conv-direct' },
    });
    expect(res.statusCode).toBe(201);
    expect(livekitMocks.mockCreateRoom).toHaveBeenCalledTimes(1);
    expect(fake.callCreate).toHaveBeenCalledTimes(1);
  });

  // ---- GROUP / CHANNEL aparivartit (QC-F-218 faisla) ----

  it('12. /group on a real GROUP conversation: a member blocking the caller does NOT gate the call (201)', async () => {
    const fake = createFakePrisma({ userPreferences: BLOCKED_BY_USER2 });
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/group',
      payload: { conversationId: 'conv-group', participantIds: ['user-2', 'user-3'] },
    });
    expect(res.statusCode).toBe(201);
    expect(livekitMocks.mockCreateRoom).toHaveBeenCalledTimes(1);
    expect(fake.callCreate).toHaveBeenCalledTimes(1);
  });

  it('13. /create on a real GROUP conversation: blocked member does NOT gate (201)', async () => {
    const fake = createFakePrisma({ userPreferences: BLOCKED_BY_USER2 });
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-group', participantIds: ['user-2', 'user-3'] },
    });
    expect(res.statusCode).toBe(201);
    expect(livekitMocks.mockCreateRoom).toHaveBeenCalledTimes(1);
    expect(fake.callCreate).toHaveBeenCalledTimes(1);
  });

  it('14. /create on a CHANNEL conversation: blocked member does NOT gate (201)', async () => {
    const fake = createFakePrisma({ userPreferences: BLOCKED_BY_USER2 });
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-channel', participantIds: ['user-2'] },
    });
    expect(res.statusCode).toBe(201);
    expect(livekitMocks.mockCreateRoom).toHaveBeenCalledTimes(1);
    expect(fake.callCreate).toHaveBeenCalledTimes(1);
  });

  // ---- Disha + kram pins ----

  it('15. reverse-block only (caller blocked the peer, peer did not block caller): /create AND /group DIRECT both 201 — the gate is one-directional like /initiate', async () => {
    const fake = createFakePrisma({
      userPreferences: {
        'test-user': { chatSettings: { blockedUsers: [{ id: 'user-2' }] } },
      },
    });
    const app = await appWith(fake);
    const createRes = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-direct', participantIds: ['user-2'] },
    });
    expect(createRes.statusCode).toBe(201);
    const groupRes = await app.inject({
      method: 'POST',
      url: '/calls/group',
      payload: { conversationId: 'conv-direct', participantIds: ['user-2'] },
    });
    expect(groupRes.statusCode).toBe(201);
    expect(livekitMocks.mockCreateRoom).toHaveBeenCalledTimes(2);
    expect(fake.callCreate).toHaveBeenCalledTimes(2);
  });

  it('16. ordering: membership speaks first — DIRECT + blocked peer + a ghost participant answers 403 NOT_A_MEMBER, not CALLER_BLOCKED', async () => {
    const fake = createFakePrisma({ userPreferences: BLOCKED_BY_USER2 });
    const app = await appWith(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/calls/group',
      payload: { conversationId: 'conv-direct', participantIds: ['user-2', 'ghost-user'] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(livekitMocks.mockCreateRoom).not.toHaveBeenCalled();
    expect(fake.callCreate).not.toHaveBeenCalled();
  });
});
