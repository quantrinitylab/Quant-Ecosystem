import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import callsRoutes from '../routes/calls';
import { errorHandlerPlugin } from '@quant/server-core';
import type { CallRecordPrisma, CallRow } from '../services/call-record.service';

// QC-F-039 — POST /calls/end must not let a non-participant kill someone
// else's call. Before the fix the route extracted the caller's userId only
// for the 401 check and then called `endCall(roomId)` without it, so ANY
// logged-in user could destroy ANY call (and poison its history row to
// ENDED via persistEnded). These tests pin the participant gate at the
// route layer: 403 CALL_NOT_PARTICIPANT for outsiders, no history write on
// a denied end, 401 without auth, and the pre-existing 200
// 'Call already ended' idempotency for unknown / already-ended roomIds.

// Stable module-level LiveKit mock (same pattern as calls.routes.test.ts):
// real route + service logic, no network.
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
  const prisma: CallRecordPrisma = {
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

describe('QC-F-039 POST /calls/end participant gate', () => {
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

  it('rejects a non-participant with 403 CALL_NOT_PARTICIPANT and does not poison call history', async () => {
    const fake = makeFakePrisma();
    const appA = await openApp('user-a', fake.prisma);
    const roomId = await createCall(appA, ['user-b']);
    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0]?.status).toBe('ACTIVE');

    const appX = await openApp('user-x', fake.prisma);
    const denied = await appX.inject({
      method: 'POST',
      url: '/calls/end',
      payload: { roomId },
    });

    expect(denied.statusCode).toBe(403);
    const body = denied.json() as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CALL_NOT_PARTICIPANT');

    // The denied end must not have written ENDED into the durable history,
    // and the call must still be alive for a real participant to end.
    expect(fake.update).not.toHaveBeenCalled();
    expect(fake.rows[0]?.status).toBe('ACTIVE');

    const appB = await openApp('user-b', fake.prisma);
    const ended = await appB.inject({
      method: 'POST',
      url: '/calls/end',
      payload: { roomId },
    });
    expect(ended.statusCode).toBe(200);
    expect((ended.json() as { data: { message: string } }).data.message).toBe('Call ended');
    expect(fake.rows[0]?.status).toBe('ENDED');
  });

  it('returns 401 UNAUTHORIZED without auth and leaves the call alive', async () => {
    const fake = makeFakePrisma();
    const appA = await openApp('user-a', fake.prisma);
    const roomId = await createCall(appA, ['user-b']);

    const anon = await openApp(null, fake.prisma);
    const res = await anon.inject({
      method: 'POST',
      url: '/calls/end',
      payload: { roomId },
    });

    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
    expect(fake.update).not.toHaveBeenCalled();

    const appB = await openApp('user-b', fake.prisma);
    const ended = await appB.inject({
      method: 'POST',
      url: '/calls/end',
      payload: { roomId },
    });
    expect(ended.statusCode).toBe(200);
  });

  it('keeps the 200 "Call already ended" idempotency for already-ended and unknown roomIds', async () => {
    const fake = makeFakePrisma();
    const appA = await openApp('user-a', fake.prisma);
    const roomId = await createCall(appA, ['user-b']);

    const first = await appA.inject({
      method: 'POST',
      url: '/calls/end',
      payload: { roomId },
    });
    expect(first.statusCode).toBe(200);

    const appB = await openApp('user-b', fake.prisma);
    const again = await appB.inject({
      method: 'POST',
      url: '/calls/end',
      payload: { roomId },
    });
    expect(again.statusCode).toBe(200);
    expect((again.json() as { data: { message: string } }).data.message).toBe(
      'Call already ended',
    );

    const appX = await openApp('user-x', fake.prisma);
    const unknown = await appX.inject({
      method: 'POST',
      url: '/calls/end',
      payload: { roomId: 'call_never_existed' },
    });
    expect(unknown.statusCode).toBe(200);
    expect((unknown.json() as { data: { message: string } }).data.message).toBe(
      'Call already ended',
    );
  });

  it('denies a participant who already left the call', async () => {
    const fake = makeFakePrisma();
    const appA = await openApp('user-a', fake.prisma);
    const roomId = await createCall(appA, ['user-b', 'user-c']);

    const appB = await openApp('user-b', fake.prisma);
    const left = await appB.inject({ method: 'POST', url: `/calls/${roomId}/leave` });
    expect(left.statusCode).toBe(200);

    const denied = await appB.inject({
      method: 'POST',
      url: '/calls/end',
      payload: { roomId },
    });
    expect(denied.statusCode).toBe(403);
    expect((denied.json() as { error: { code: string } }).error.code).toBe(
      'CALL_NOT_PARTICIPANT',
    );

    // A remaining participant can still end it.
    const appC = await openApp('user-c', fake.prisma);
    const ended = await appC.inject({
      method: 'POST',
      url: '/calls/end',
      payload: { roomId },
    });
    expect(ended.statusCode).toBe(200);
  });
});
