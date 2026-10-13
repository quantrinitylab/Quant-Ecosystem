// ============================================================================
// QC-F-287 (route level) — a call seeded ONLY as a durable Prisma `Call` row
// must be fully usable over HTTP by a process that never saw its initiation.
//
// This is the restart / second-replica shape end-to-end: the shared fake
// Prisma holds an ACTIVE Call row (roomId = the callId, participants in the
// Json column) and NO /calls/initiate or /calls/group request is ever made in
// this file — the routes' CallService starts with an empty in-memory
// registry, exactly like a freshly booted backend. Token / join / leave /
// end must work off the durable row (Slice 1: lazy rehydrate), ending the
// call must also close the durable row (persistEnded), and a call ended via
// last-participant leave must close its row too — otherwise the rehydrate
// would resurrect finished calls.
//
// Singleton note (same constraint as calls.routes.test.ts / QC-F-218): the
// routes module caches ONE CallService, and Slice 1 binds its durable lookup
// at that first construction. Every app in this file therefore shares ONE
// fake Prisma instance, so the bound lookup always reads the same store the
// tests seed; rows are reset between tests and each test uses distinct
// roomIds so the service-level cache can never bleed across tests.
//
// Negative-control expectations on the ORIGINAL routes/service: cases 11 and
// 12 FAIL (token/join/leave/end 404 on a seeded live call); case 13's 404
// sub-case passes on both (control).
// ============================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import callsRoutes from '../routes/calls';
import { errorHandlerPlugin } from '@quant/server-core';
import type { CallRow } from '../services/call-record.service';

// Stable module-level LiveKit mocks (pattern: qc-f-218 routes suite).
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

const LIVEKIT_ENV_KEYS = ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_WS_URL', 'LIVEKIT_URL'];

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

// ---------------------------------------------------------------------------
// ONE shared fake Prisma `call` delegate for the whole file (see header).
// Implements exactly the operations CallRecordService + persistEnded issue.
// ---------------------------------------------------------------------------
const sharedRows: CallRow[] = [];
let rowSeq = 0;

const sharedFakePrisma = {
  call: {
    async create({ data }: { data: Record<string, unknown> }) {
      const now = new Date();
      const row: CallRow = {
        id: `callrow_${(rowSeq += 1)}`,
        conversationId: String(data['conversationId']),
        initiatorId: String(data['initiatorId']),
        type: (data['type'] as CallRow['type']) ?? 'VIDEO',
        status: (data['status'] as CallRow['status']) ?? 'RINGING',
        startedAt: (data['startedAt'] as Date | undefined) ?? null,
        endedAt: (data['endedAt'] as Date | undefined) ?? null,
        duration: (data['duration'] as number | undefined) ?? null,
        participants: (data['participants'] as unknown) ?? [],
        roomId: (data['roomId'] as string | null | undefined) ?? null,
        createdAt: now,
        updatedAt: now,
      };
      sharedRows.push(row);
      return { ...row };
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const row = sharedRows.find((r) => r.id === where.id);
      if (!row) {
        throw new Error(`No Call row with id ${where.id}`);
      }
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
    async findUnique({ where }: { where: { id: string } }) {
      const row = sharedRows.find((r) => r.id === where.id);
      return row ? { ...row } : null;
    },
    async findFirst({ where }: { where: Record<string, unknown> }) {
      const row = sharedRows.find((r) => {
        if ('id' in where && r.id !== where['id']) return false;
        if ('roomId' in where && r.roomId !== where['roomId']) return false;
        return true;
      });
      return row ? { ...row } : null;
    },
    async findMany() {
      return sharedRows.map((r) => ({ ...r }));
    },
    async count() {
      return sharedRows.length;
    },
  },
};

function seedActiveCall(roomId: string, participants: string[], initiatorId: string): CallRow {
  const now = new Date();
  const row: CallRow = {
    id: `callrow_seed_${roomId}`,
    conversationId: 'conv-1',
    initiatorId,
    type: 'VIDEO',
    status: 'ACTIVE',
    startedAt: now,
    endedAt: null,
    duration: null,
    participants: [...participants],
    roomId,
    createdAt: now,
    updatedAt: now,
  };
  sharedRows.push(row);
  return row;
}

function rowByRoomId(roomId: string): CallRow | undefined {
  return sharedRows.find((r) => r.roomId === roomId);
}

async function buildApp(userId?: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  // QC-F-287: same decoration pattern as the QC-F-218 suite — the routes read
  // fastify.prisma for the record service (durable lookup + persistence).
  app.decorate('prisma', sharedFakePrisma as never);
  if (userId !== undefined) {
    app.addHook('onRequest', (request, _reply, done) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId };
      done();
    });
  }
  await app.register(callsRoutes, { prefix: '/calls' });
  await app.ready();
  return app;
}

describe('QC-F-287: seeded durable call is fully usable over HTTP (restart shape)', () => {
  let savedEnv: Record<string, string | undefined>;
  const apps: FastifyInstance[] = [];

  async function appAs(userId?: string): Promise<FastifyInstance> {
    const app = await buildApp(userId);
    apps.push(app);
    return app;
  }

  beforeEach(() => {
    savedEnv = clearLiveKitEnv();
    process.env['LIVEKIT_API_KEY'] = 'test-key';
    process.env['LIVEKIT_API_SECRET'] = 'test-secret';
    process.env['LIVEKIT_WS_URL'] = 'ws://livekit.test:7880';
    sharedRows.length = 0;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    while (apps.length > 0) {
      await apps.pop()?.close();
    }
    restoreEnv(savedEnv);
  });

  it('case 11: full lifecycle on a seeded call — token, join, leave, end', async () => {
    seedActiveCall('call_seed_life', ['user-a', 'user-b'], 'user-a');
    const asA = await appAs('user-a');
    const asB = await appAs('user-b');

    const tokenRes = await asA.inject({ method: 'GET', url: '/calls/call_seed_life/token' });
    expect(tokenRes.statusCode).toBe(200);
    expect(tokenRes.json().data.token).toBe('header.signed-jwt-token.signature');

    const joinRes = await asB.inject({ method: 'POST', url: '/calls/call_seed_life/join' });
    expect(joinRes.statusCode).toBe(200);
    expect(joinRes.json().data.token).toBe('header.signed-jwt-token.signature');

    const leaveRes = await asB.inject({ method: 'POST', url: '/calls/call_seed_life/leave' });
    expect(leaveRes.statusCode).toBe(200);
    expect(leaveRes.json().data.message).toBe('Left call');

    const endRes = await asA.inject({
      method: 'POST',
      url: '/calls/end',
      payload: { roomId: 'call_seed_life' },
    });
    expect(endRes.statusCode).toBe(200);
    expect(endRes.json().data.message).toBe('Call ended');
    expect(livekitMocks.mockDeleteRoom).toHaveBeenCalledWith('chat-call:call_seed_life');
  });

  it('case 12a: after /calls/end the durable row is ENDED and a later token is an honest 404 (no resurrection)', async () => {
    seedActiveCall('call_seed_end', ['user-a', 'user-b'], 'user-a');
    const asA = await appAs('user-a');

    const endRes = await asA.inject({
      method: 'POST',
      url: '/calls/end',
      payload: { roomId: 'call_seed_end' },
    });
    expect(endRes.statusCode).toBe(200);
    expect(rowByRoomId('call_seed_end')?.status).toBe('ENDED');

    const tokenRes = await asA.inject({ method: 'GET', url: '/calls/call_seed_end/token' });
    expect(tokenRes.statusCode).toBe(404);
    expect(tokenRes.json().error.code).toBe('CALL_NOT_FOUND');
  });

  it('case 12b: last-participant leave ends the call AND closes the durable row; later token 404s', async () => {
    seedActiveCall('call_seed_leave', ['user-a', 'user-b'], 'user-a');
    const asA = await appAs('user-a');
    const asB = await appAs('user-b');

    const leaveB = await asB.inject({ method: 'POST', url: '/calls/call_seed_leave/leave' });
    expect(leaveB.statusCode).toBe(200);
    expect(leaveB.json().data.message).toBe('Left call');
    expect(rowByRoomId('call_seed_leave')?.status).toBe('ACTIVE');

    const leaveA = await asA.inject({ method: 'POST', url: '/calls/call_seed_leave/leave' });
    expect(leaveA.statusCode).toBe(200);
    expect(leaveA.json().data.message).toBe('Call ended');
    // The leave-ended persist (Slice 1, routes) must have closed the row —
    // otherwise the next assertion's 404 could only come from the in-memory
    // cache and a restarted process would resurrect this finished call.
    expect(rowByRoomId('call_seed_leave')?.status).toBe('ENDED');

    const tokenRes = await asA.inject({ method: 'GET', url: '/calls/call_seed_leave/token' });
    expect(tokenRes.statusCode).toBe(404);
    expect(tokenRes.json().error.code).toBe('CALL_NOT_FOUND');
  });

  it('case 13: route-level authz on a seeded call — non-participant 403, anonymous 401, unknown call 404', async () => {
    seedActiveCall('call_seed_authz', ['user-a', 'user-b'], 'user-a');
    const asX = await appAs('user-x');
    const anon = await appAs(undefined);
    const asA = await appAs('user-a');

    const forbidden = await asX.inject({ method: 'GET', url: '/calls/call_seed_authz/token' });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.code).toBe('CALL_NOT_PARTICIPANT');

    const unauthenticated = await anon.inject({
      method: 'GET',
      url: '/calls/call_seed_authz/token',
    });
    expect(unauthenticated.statusCode).toBe(401);

    const unknown = await asA.inject({ method: 'GET', url: '/calls/call_seed_nope/token' });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('CALL_NOT_FOUND');
  });
});
