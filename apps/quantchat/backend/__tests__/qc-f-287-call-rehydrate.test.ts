// ============================================================================
// QC-F-287 — CallService durable rehydrate (restart / replica simulation)
//
// The shipped 1:1/group call registry was ONLY a process-memory Map inside
// CallService: generateCallToken / leaveCall / endCall / endCallInternal all
// 404'd with CALL_NOT_FOUND when the call was not in THIS process's Map, even
// though a durable Prisma `Call` row (status ACTIVE) existed. After a backend
// restart (or on a second replica) a call that is still live in its LiveKit
// room could not be rejoined, left, or ended.
//
// "Restart" here is simulated exactly the way production experiences it: ONE
// shared durable store (an in-memory fake of the Prisma `call` delegate, the
// same fake pattern as call-record.service.test.ts) and TWO CallService
// instances. Instance A creates the call and the routes' persistStarted
// equivalent (CallRecordService.recordStarted) writes the durable row; A is
// then discarded. Instance B — empty Map, same store — must serve token /
// leave / end from the row, with the SAME 404-then-403 ordering as before.
//
// Negative-control expectations on the ORIGINAL code (no lookup parameter):
// cases 1, 2, 4, 8 FAIL (404 where 200/403/503 belong); cases 5, 6 PASS on
// both (they pin behaviour that must not change).
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CallService, type CallRegistryLookup } from '../services/call.service';
import {
  CallRecordService,
  type CallRecordPrisma,
  type CallRow,
} from '../services/call-record.service';

// ---------------------------------------------------------------------------
// Stable module-level LiveKit mocks (hoisted; no fresh-identity mocks).
// ---------------------------------------------------------------------------
const livekitMocks = vi.hoisted(() => {
  const mockCreateRoom = vi.fn().mockResolvedValue({
    name: 'chat-call:test-call',
    sid: 'RM_call123',
    numParticipants: 0,
    maxParticipants: 8,
    creationTime: BigInt(1700000000),
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

const config = {
  apiKey: 'test-key',
  apiSecret: 'test-secret',
  wsUrl: 'ws://localhost:7880',
};

// ---------------------------------------------------------------------------
// In-memory fake of the Prisma `call` delegate (pattern: call-record tests).
// ---------------------------------------------------------------------------
function createFakeCallPrisma(): CallRecordPrisma & { __rows: CallRow[] } {
  const rows: CallRow[] = [];
  let idSeq = 0;
  let clock = 1_700_000_000_000;
  const tick = (): Date => new Date((clock += 1000));

  const matches = (row: CallRow, where: Record<string, unknown>): boolean => {
    if ('id' in where && row.id !== where['id']) {
      return false;
    }
    if ('roomId' in where && row.roomId !== where['roomId']) {
      return false;
    }
    if ('OR' in where && Array.isArray(where['OR'])) {
      const clauses = where['OR'] as Array<Record<string, unknown>>;
      return clauses.some((clause) => {
        if ('initiatorId' in clause) {
          return row.initiatorId === clause['initiatorId'];
        }
        if ('participants' in clause) {
          const p = clause['participants'] as { array_contains?: string };
          const list = Array.isArray(row.participants) ? (row.participants as string[]) : [];
          return p.array_contains !== undefined && list.includes(p.array_contains);
        }
        return false;
      });
    }
    return true;
  };

  return {
    __rows: rows,
    call: {
      async create({ data }) {
        const now = tick();
        const row: CallRow = {
          id: `callrow_${(idSeq += 1)}`,
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
        rows.push(row);
        return { ...row };
      },
      async update({ where, data }) {
        const row = rows.find((r) => r.id === where.id);
        if (!row) {
          throw new Error(`No Call row with id ${where.id}`);
        }
        Object.assign(row, data, { updatedAt: tick() });
        return { ...row };
      },
      async findUnique({ where }) {
        const row = rows.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      },
      async findFirst({ where }) {
        const row = rows.find((r) => matches(r, where));
        return row ? { ...row } : null;
      },
      async findMany({ where }) {
        return rows.filter((r) => matches(r, where)).map((r) => ({ ...r }));
      },
      async count({ where }) {
        return rows.filter((r) => matches(r, where)).length;
      },
    },
  };
}

/** Push a raw durable row directly (states recordStarted never produces). */
function seedRawRow(
  fake: ReturnType<typeof createFakeCallPrisma>,
  overrides: Partial<CallRow>,
): CallRow {
  const now = new Date('2026-10-13T00:00:00.000Z');
  const row: CallRow = {
    id: `callrow_seed_${fake.__rows.length + 1}`,
    conversationId: 'conv-1',
    initiatorId: 'user-a',
    type: 'VIDEO',
    status: 'ACTIVE',
    startedAt: now,
    endedAt: null,
    duration: null,
    participants: ['user-a', 'user-b'],
    roomId: 'call_seed',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  fake.__rows.push(row);
  return row;
}

/**
 * Create a call on instance A and persist its durable row exactly like
 * routes/calls.ts does (persistStarted → recordStarted with roomId = callId).
 * Returns everything instance B (the "restarted" process) needs.
 */
async function seedViaInstanceA(participants: string[]) {
  const fake = createFakeCallPrisma();
  const records = new CallRecordService(fake);
  const a = new CallService(config, records);
  const initiator = participants[0] as string;
  const call =
    participants.length <= 2
      ? await a.initiate1v1Call(initiator, participants[1] as string)
      : await a.initiateGroupCall(initiator, participants.slice(1));
  await records.recordStarted({
    conversationId: 'conv-1',
    initiatorId: call.initiatorId,
    roomId: call.callId,
    participants: call.participantIds,
  });
  return { fake, records, call };
}

describe('QC-F-287: CallService rehydrates a live call from its durable row after restart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('case 1: token after restart — JWT minted against the DERIVED room name (chat-call:<callId>)', async () => {
    const { records, call } = await seedViaInstanceA(['user-a', 'user-b']);
    const b = new CallService(config, records);

    const token = await b.generateCallToken(call.callId, 'user-a');

    expect(token).toBe('header.signed-jwt-token.signature');
    expect(livekitMocks.AccessToken).toHaveBeenCalledWith(
      'test-key',
      'test-secret',
      expect.objectContaining({ identity: 'user-a' }),
    );
    // The grant's room MUST be the derived roomName — that string is the only
    // link between the durable row and the real LiveKit room.
    expect(livekitMocks.mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({ room: `chat-call:${call.callId}`, roomJoin: true }),
    );
  });

  it('case 2: group token + leave after restart — roster shrinks, last leave ends the room', async () => {
    const { records, call } = await seedViaInstanceA(['user-a', 'user-b', 'user-c']);
    const b = new CallService(config, records);

    await expect(b.generateCallToken(call.callId, 'user-c')).resolves.toBe(
      'header.signed-jwt-token.signature',
    );

    await expect(b.leaveCall(call.callId, 'user-c')).resolves.toEqual({ ended: false });
    expect(livekitMocks.mockRemoveParticipant).toHaveBeenCalledWith(
      `chat-call:${call.callId}`,
      'user-c',
    );

    await expect(b.leaveCall(call.callId, 'user-b')).resolves.toEqual({ ended: false });
    await expect(b.leaveCall(call.callId, 'user-a')).resolves.toEqual({ ended: true });
    expect(livekitMocks.mockDeleteRoom).toHaveBeenCalledWith(`chat-call:${call.callId}`);
  });

  it('case 3: end after restart — room destroyed via derived name, cache entry dropped', async () => {
    const { records, call } = await seedViaInstanceA(['user-a', 'user-b']);
    const b = new CallService(config, records);

    await expect(b.endCall(call.callId, 'user-a')).resolves.toBeUndefined();
    expect(livekitMocks.mockDeleteRoom).toHaveBeenCalledWith(`chat-call:${call.callId}`);
    expect(b.getCall(call.callId)).toBeUndefined();
  });

  it('case 3b: endCallInternal after restart resolves through the same durable lookup', async () => {
    const { records, call } = await seedViaInstanceA(['user-a', 'user-b']);
    const b = new CallService(config, records);

    await expect(b.endCallInternal(call.callId)).resolves.toBeUndefined();
    expect(livekitMocks.mockDeleteRoom).toHaveBeenCalledWith(`chat-call:${call.callId}`);
  });

  it('case 4: non-participant still gets 403 (not 404) after rehydrate — for token, leave and end', async () => {
    const { records, call } = await seedViaInstanceA(['user-a', 'user-b']);
    const b = new CallService(config, records);

    await expect(b.generateCallToken(call.callId, 'user-x')).rejects.toMatchObject({
      statusCode: 403,
      code: 'CALL_NOT_PARTICIPANT',
    });
    await expect(b.leaveCall(call.callId, 'user-x')).rejects.toMatchObject({
      statusCode: 403,
      code: 'CALL_NOT_PARTICIPANT',
    });
    await expect(b.endCall(call.callId, 'user-x')).rejects.toMatchObject({
      statusCode: 403,
      code: 'CALL_NOT_PARTICIPANT',
    });

    // The 403 path must never mint a token or touch the room.
    expect(livekitMocks.mockToJwt).not.toHaveBeenCalled();
    expect(livekitMocks.mockDeleteRoom).not.toHaveBeenCalled();
    expect(livekitMocks.mockRemoveParticipant).not.toHaveBeenCalled();
  });

  it('case 5: a call whose row is terminal (ENDED / MISSED / DECLINED / endedAt set) is never resurrected', async () => {
    const { fake, records, call } = await seedViaInstanceA(['user-a', 'user-b']);
    const row = fake.__rows[0] as CallRow;
    await records.recordEnded(row.id);
    const b = new CallService(config, records);

    await expect(b.generateCallToken(call.callId, 'user-a')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CALL_NOT_FOUND',
    });
    await expect(b.leaveCall(call.callId, 'user-a')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CALL_NOT_FOUND',
    });
    await expect(b.endCall(call.callId, 'user-a')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CALL_NOT_FOUND',
    });

    // MISSED / DECLINED / ACTIVE-but-endedAt rows seeded directly.
    for (const [idx, status] of ['MISSED', 'DECLINED'].entries()) {
      const roomId = `call_dead_${idx}`;
      seedRawRow(fake, { roomId, status: status as CallRow['status'] });
      await expect(b.generateCallToken(roomId, 'user-a')).rejects.toMatchObject({
        statusCode: 404,
        code: 'CALL_NOT_FOUND',
      });
    }
    seedRawRow(fake, { roomId: 'call_dead_endedat', endedAt: new Date() });
    await expect(b.generateCallToken('call_dead_endedat', 'user-a')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CALL_NOT_FOUND',
    });
  });

  it('case 6 (control): no durable row at all — the honest 404 is unchanged', async () => {
    const fake = createFakeCallPrisma();
    const records = new CallRecordService(fake);
    const b = new CallService(config, records);

    await expect(b.generateCallToken('call_missing', 'user-a')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CALL_NOT_FOUND',
    });
    await expect(b.leaveCall('call_missing', 'user-a')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CALL_NOT_FOUND',
    });
    await expect(b.endCall('call_missing', 'user-a')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CALL_NOT_FOUND',
    });
    await expect(b.endCallInternal('call_missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CALL_NOT_FOUND',
    });
  });

  it('case 7: a store-less instance (voice-bot / legacy construction) keeps the old behaviour exactly', async () => {
    const { call } = await seedViaInstanceA(['user-a', 'user-b']);
    const storeless = new CallService(config);

    await expect(storeless.generateCallToken(call.callId, 'user-a')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CALL_NOT_FOUND',
    });
    await expect(storeless.leaveCall(call.callId, 'user-a')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CALL_NOT_FOUND',
    });
    await expect(storeless.endCall(call.callId, 'user-a')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CALL_NOT_FOUND',
    });
  });

  it('case 8: durable lookup failure fails CLOSED with 503 CALL_LOOKUP_UNAVAILABLE (no token, no room op)', async () => {
    const failingLookup: CallRegistryLookup = {
      findCallRowByRoomId: vi.fn(async () => {
        throw new Error('database unreachable');
      }),
    };
    const b = new CallService(config, failingLookup);

    await expect(b.generateCallToken('call_any', 'user-a')).rejects.toMatchObject({
      statusCode: 503,
      code: 'CALL_LOOKUP_UNAVAILABLE',
    });
    await expect(b.endCall('call_any', 'user-a')).rejects.toMatchObject({
      statusCode: 503,
      code: 'CALL_LOOKUP_UNAVAILABLE',
    });

    expect(livekitMocks.mockToJwt).not.toHaveBeenCalled();
    expect(livekitMocks.mockDeleteRoom).not.toHaveBeenCalled();
  });

  it('case 9: malformed rows never mint tokens — empty / non-array participants and RINGING rows are honest 404s', async () => {
    const fake = createFakeCallPrisma();
    const records = new CallRecordService(fake);
    const b = new CallService(config, records);

    seedRawRow(fake, { roomId: 'call_bad_empty', participants: [] });
    seedRawRow(fake, { roomId: 'call_bad_string', participants: 'user-a' });
    seedRawRow(fake, { roomId: 'call_bad_null', participants: null });
    seedRawRow(fake, { roomId: 'call_bad_ringing', status: 'RINGING' });

    for (const roomId of ['call_bad_empty', 'call_bad_string', 'call_bad_null', 'call_bad_ringing']) {
      await expect(b.generateCallToken(roomId, 'user-a')).rejects.toMatchObject({
        statusCode: 404,
        code: 'CALL_NOT_FOUND',
      });
    }
    expect(livekitMocks.mockToJwt).not.toHaveBeenCalled();
  });

  it('case 10: rehydrated entry is cached (one lookup for two token calls) and exposes the derived type', async () => {
    const { records, call } = await seedViaInstanceA(['user-a', 'user-b']);
    let lookups = 0;
    const countingLookup: CallRegistryLookup = {
      findCallRowByRoomId: async (roomId: string) => {
        lookups += 1;
        return records.findCallRowByRoomId(roomId);
      },
    };
    const b = new CallService(config, countingLookup);

    await b.generateCallToken(call.callId, 'user-a');
    await b.generateCallToken(call.callId, 'user-b');
    expect(lookups).toBe(1);

    const cached = b.getCall(call.callId);
    expect(cached?.initiatorId).toBe('user-a');
    expect(cached?.participantIds).toEqual(['user-a', 'user-b']);
    expect(cached?.roomName).toBe(`chat-call:${call.callId}`);
    // Type derivation (the row's media `type` cannot express cardinality):
    // 2 participants → one-to-one; a 3-participant row → group.
    expect(cached?.type).toBe('one-to-one');

    const group = await seedViaInstanceA(['user-a', 'user-b', 'user-c']);
    const b2 = new CallService(config, group.records);
    await b2.generateCallToken(group.call.callId, 'user-a');
    expect(b2.getCall(group.call.callId)?.type).toBe('group');
  });
});

describe('QC-F-287: CallRecordService.findCallRowByRoomId (the durable lookup)', () => {
  it('returns the row for a known roomId, null for unknown and blank roomIds', async () => {
    const fake = createFakeCallPrisma();
    const records = new CallRecordService(fake);
    const started = await records.recordStarted({
      conversationId: 'conv-1',
      initiatorId: 'user-a',
      roomId: 'call_known',
      participants: ['user-a', 'user-b'],
    });

    const found = await records.findCallRowByRoomId('call_known');
    expect(found?.id).toBe(started.id);
    expect(found?.roomId).toBe('call_known');
    expect(found?.status).toBe('ACTIVE');

    await expect(records.findCallRowByRoomId('call_unknown')).resolves.toBeNull();
    await expect(records.findCallRowByRoomId('')).resolves.toBeNull();
    await expect(records.findCallRowByRoomId('   ')).resolves.toBeNull();
  });
});
