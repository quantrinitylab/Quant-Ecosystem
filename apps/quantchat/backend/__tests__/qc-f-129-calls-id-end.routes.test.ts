import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import callsRoutes from '../routes/calls';
import { errorHandlerPlugin } from '@quant/server-core';
import type { CallRecordPrisma, CallRow } from '../services/call-record.service';

// QC-F-129 — POST /calls/:id/end: the frontend's endCall() contract.
//
// Before this route existed, apiClient.endCall(callId) posted to
// POST /calls/:id/end — a phantom path with no Next proxy and no backend
// route — while the call page claimed 'Call ended' unconditionally. The
// server-side call (registry entry, participant list, history row) stayed
// alive. These tests pin the new route: it shares the /end teardown via
// endCallAndPersist (participant gate + durable ENDED + idempotency), so the
// two spellings can never diverge. Negative control: on the pre-fix tree
// every /:id/end case 404s (route absent) instead of ending anything.
//
// Harness pattern mirrors qc-f-039-calls-end-participant.routes.test.ts:
// real route + service logic, LiveKit SDK mocked at module level (hoisted
// so deleteRoom/removeParticipant are assertable), fake prisma for the
// QC-F-075 membership gate + call rows.

// Stable module-level LiveKit mock — hoisted object identity lets tests
// assert that the room was really destroyed (and NOT destroyed on denials).
const livekitMocks = vi.hoisted(() => {
  const mockCreateRoom = vi.fn().mockResolvedValue({
    name: 'chat-call:test-call',
    sid: 'RM_call123',
    numParticipants: 0,
    maxParticipants: 8,
  });
  const mockDeleteRoom = vi.fn().mockResolvedValue(undefined);
  const mockRemoveParticipant = vi.fn().mockResolvedValue(undefined);

  const RoomServiceClient = vi.fn().mockImplementation(function () {
    return {
      createRoom: mockCreateRoom,
      deleteRoom: mockDeleteRoom,
      removeParticipant: mockRemoveParticipant,
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
    mockCreateRoom,
    mockDeleteRoom,
    mockRemoveParticipant,
    RoomServiceClient,
    AccessToken,
    mockToJwt,
    mockAddGrant,
  };
});

vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: livekitMocks.RoomServiceClient,
  AccessToken: livekitMocks.AccessToken,
}));

function makeFakePrisma() {
  const rows: CallRow[] = [];
  let seq = 0;
  const update = vi.fn(
    async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = rows.find((r) => r.id === args.where.id);
      if (!row) {
        throw new Error('Call record not found');
      }
      Object.assign(row, args.data);
      return row;
    },
  );
  // QC-F-075: POST /calls/create is conversation-membership gated; the fake
  // serves the gate's delegates — conv-1 exists (GROUP) and user-a / user-b /
  // user-c are its active members. user-x is deliberately NOT a member.
  const memberIds = ['user-a', 'user-b', 'user-c'];
  const prisma: CallRecordPrisma & {
    conversation: {
      findUnique: (args: {
        where: { id: string };
      }) => Promise<{ id: string; type: string } | null>;
    };
    conversationMember: {
      findMany: (args: {
        where: { conversationId: string; userId: { in: string[] }; leftAt: Date | null };
      }) => Promise<{ userId: string }[]>;
    };
  } = {
    conversation: {
      findUnique: async ({ where }) =>
        where.id === 'conv-1' ? { id: 'conv-1', type: 'GROUP' } : null,
    },
    conversationMember: {
      findMany: async ({ where }) =>
        where.conversationId === 'conv-1' && where.leftAt === null
          ? memberIds
              .filter((id) => where.userId.in.includes(id))
              .map((userId) => ({ userId }))
          : [],
    },
    call: {
      create: async ({ data }) => {
        const row: CallRow = {
          id: `row-${++seq}`,
          conversationId: String(data['conversationId'] ?? ''),
          initiatorId: String(data['initiatorId'] ?? ''),
          type: (data['type'] as CallRow['type'] | undefined) ?? 'VIDEO',
          status: (data['status'] as CallRow['status'] | undefined) ?? 'ACTIVE',
          startedAt: (data['startedAt'] as Date | undefined) ?? null,
          endedAt: null,
          duration: null,
          participants: data['participants'] ?? [],
          roomId: (data['roomId'] as string | undefined) ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rows.push(row);
        return row;
      },
      update,
      findUnique: async ({ where }) => rows.find((r) => r.id === where.id) ?? null,
      findFirst: async ({ where }) =>
        rows.find((r) => where['roomId'] === undefined || r.roomId === where['roomId']) ?? null,
      findMany: async () => rows,
      count: async () => rows.length,
    },
  };
  return { prisma, rows, update };
}

const LIVEKIT_ENV_KEYS = ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_WS_URL', 'LIVEKIT_URL'];

describe('QC-F-129 POST /calls/:id/end', () => {
  let apps: FastifyInstance[] = [];
  let savedEnv: Record<string, string | undefined> = {};

  async function openApp(
    authUserId: string | null,
    prisma: CallRecordPrisma,
  ): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'prisma',
      prisma,
    );
    if (authUserId) {
      app.addHook('onRequest', (request, _reply, done) => {
        (request as unknown as { auth: { userId: string } }).auth = { userId: authUserId };
        done();
      });
    }
    await app.register(callsRoutes, { prefix: '/calls' });
    await app.ready();
    apps.push(app);
    return app;
  }

  async function createCall(app: FastifyInstance, participantIds: string[]): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/calls/create',
      payload: { conversationId: 'conv-1', participantIds },
    });
    expect(res.statusCode).toBe(201);
    return (res.json() as { data: { roomId: string } }).data.roomId;
  }

  beforeEach(() => {
    apps = [];
    savedEnv = {};
    for (const key of LIVEKIT_ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    process.env['LIVEKIT_API_KEY'] = 'test-key';
    process.env['LIVEKIT_API_SECRET'] = 'test-secret';
    process.env['LIVEKIT_WS_URL'] = 'ws://livekit.test:7880';
    livekitMocks.mockDeleteRoom.mockClear();
    livekitMocks.mockRemoveParticipant.mockClear();
  });

  afterEach(async () => {
    for (const app of apps) {
      await app.close();
    }
    for (const key of LIVEKIT_ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('ends a live call: participant gets 200, the LiveKit room is destroyed, the history row goes ENDED, and rejoin 404s', async () => {
    const fake = makeFakePrisma();
    const appA = await openApp('user-a', fake.prisma);
    const callId = await createCall(appA, ['user-b']);
    expect(fake.rows[0]?.status).toBe('ACTIVE');

    const appB = await openApp('user-b', fake.prisma);
    const ended = await appB.inject({
      method: 'POST',
      url: `/calls/${callId}/end`,
      payload: {},
    });

    expect(ended.statusCode).toBe(200);
    expect((ended.json() as { data: { message: string } }).data.message).toBe('Call ended');
    // The real teardown happened — not a phantom ack.
    expect(livekitMocks.mockDeleteRoom).toHaveBeenCalledTimes(1);
    expect(livekitMocks.mockDeleteRoom).toHaveBeenCalledWith(`chat-call:${callId}`);
    expect(fake.rows[0]?.status).toBe('ENDED');

    // The rejoin-after-end guard: the registry entry is gone.
    const rejoin = await appB.inject({
      method: 'POST',
      url: `/calls/${callId}/join`,
      payload: {},
    });
    expect(rejoin.statusCode).toBe(404);
    expect((rejoin.json() as { error: { code: string } }).error.code).toBe('CALL_NOT_FOUND');
  });

  it('rejects a non-participant with 403 CALL_NOT_PARTICIPANT, destroys nothing, and leaves history ACTIVE', async () => {
    const fake = makeFakePrisma();
    const appA = await openApp('user-a', fake.prisma);
    const callId = await createCall(appA, ['user-b']);

    const appX = await openApp('user-x', fake.prisma);
    const denied = await appX.inject({
      method: 'POST',
      url: `/calls/${callId}/end`,
      payload: {},
    });

    expect(denied.statusCode).toBe(403);
    const body = denied.json() as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CALL_NOT_PARTICIPANT');
    expect(livekitMocks.mockDeleteRoom).not.toHaveBeenCalled();
    expect(fake.update).not.toHaveBeenCalled();
    expect(fake.rows[0]?.status).toBe('ACTIVE');

    // A real participant can still end it afterwards.
    const appB = await openApp('user-b', fake.prisma);
    const ended = await appB.inject({
      method: 'POST',
      url: `/calls/${callId}/end`,
      payload: {},
    });
    expect(ended.statusCode).toBe(200);
    expect(fake.rows[0]?.status).toBe('ENDED');
  });

  it('returns 401 UNAUTHORIZED without auth and leaves the call alive', async () => {
    const fake = makeFakePrisma();
    const appA = await openApp('user-a', fake.prisma);
    const callId = await createCall(appA, ['user-b']);

    const anon = await openApp(null, fake.prisma);
    const res = await anon.inject({
      method: 'POST',
      url: `/calls/${callId}/end`,
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
    expect(livekitMocks.mockDeleteRoom).not.toHaveBeenCalled();
    expect(fake.update).not.toHaveBeenCalled();
  });

  it('keeps the 200 "Call already ended" idempotency and matches POST /end exactly (parity table)', async () => {
    const fake = makeFakePrisma();
    const appA = await openApp('user-a', fake.prisma);
    const callId = await createCall(appA, ['user-b']);

    // The two spellings of "end this call", driven by the same table.
    const spellings: Array<{
      label: string;
      inject: (
        app: FastifyInstance,
        id: string,
      ) => Promise<{ statusCode: number; json: () => unknown }>;
    }> = [
      {
        label: 'POST /calls/end {roomId}',
        inject: (app, id) => app.inject({ method: 'POST', url: '/calls/end', payload: { roomId: id } }),
      },
      {
        label: 'POST /calls/:id/end',
        inject: (app, id) => app.inject({ method: 'POST', url: `/calls/${id}/end`, payload: {} }),
      },
    ];

    const appB = await openApp('user-b', fake.prisma);
    // End once via the new spelling.
    const first = await appB.inject({
      method: 'POST',
      url: `/calls/${callId}/end`,
      payload: {},
    });
    expect(first.statusCode).toBe(200);

    for (const { label, inject } of spellings) {
      // Already-ended callId -> 200 'Call already ended' on BOTH spellings.
      const again = await inject(appB, callId);
      expect(again.statusCode, `${label} on ended call`).toBe(200);
      expect((again.json() as { data: { message: string } }).data.message).toBe(
        'Call already ended',
      );
      // Unknown callId -> 200 'Call already ended' on BOTH spellings.
      const unknown = await inject(appB, 'call_never_existed');
      expect(unknown.statusCode, `${label} on unknown call`).toBe(200);
      expect((unknown.json() as { data: { message: string } }).data.message).toBe(
        'Call already ended',
      );
    }
  });

  it('denies a participant who already left the call (leave-then-end is 403)', async () => {
    const fake = makeFakePrisma();
    const appA = await openApp('user-a', fake.prisma);
    const callId = await createCall(appA, ['user-b', 'user-c']);

    const appB = await openApp('user-b', fake.prisma);
    const left = await appB.inject({ method: 'POST', url: `/calls/${callId}/leave` });
    expect(left.statusCode).toBe(200);

    const denied = await appB.inject({
      method: 'POST',
      url: `/calls/${callId}/end`,
      payload: {},
    });
    expect(denied.statusCode).toBe(403);
    expect((denied.json() as { error: { code: string } }).error.code).toBe(
      'CALL_NOT_PARTICIPANT',
    );

    // A remaining participant can still end it.
    const appC = await openApp('user-c', fake.prisma);
    const ended = await appC.inject({
      method: 'POST',
      url: `/calls/${callId}/end`,
      payload: {},
    });
    expect(ended.statusCode).toBe(200);
  });

  it('lets any remaining participant end a group call (current semantics pin)', async () => {
    const fake = makeFakePrisma();
    const appA = await openApp('user-a', fake.prisma);
    const callId = await createCall(appA, ['user-b', 'user-c']);

    const appC = await openApp('user-c', fake.prisma);
    const ended = await appC.inject({
      method: 'POST',
      url: `/calls/${callId}/end`,
      payload: {},
    });
    expect(ended.statusCode).toBe(200);
    expect((ended.json() as { data: { message: string } }).data.message).toBe('Call ended');
    expect(livekitMocks.mockDeleteRoom).toHaveBeenCalledTimes(1);
  });

  it('ignores the request body — params.id is the authority (no roomId trap)', async () => {
    const fake = makeFakePrisma();
    const appA = await openApp('user-a', fake.prisma);
    const callId = await createCall(appA, ['user-b']);

    const appB = await openApp('user-b', fake.prisma);
    // A misleading body must NOT divert the teardown: the URL's callId wins.
    const ended = await appB.inject({
      method: 'POST',
      url: `/calls/${callId}/end`,
      payload: { roomId: 'call_never_existed' },
    });
    expect(ended.statusCode).toBe(200);
    expect((ended.json() as { data: { message: string } }).data.message).toBe('Call ended');
    expect(fake.rows[0]?.status).toBe('ENDED');
  });
});
