import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import meetingsRoutes from '../routes/meetings';
import type { RoomPrisma, RoomSettings } from '../services/room.service';
import type { RecordingPrisma, RecordingRow } from '../services/recording.service';
import type { SummaryPrisma } from '../services/summary.service';
import type { ActionItemsPrisma } from '../services/action-items.service';

// QC-F-061 — Meetings room/chat/reactions BOLA.
// Before the fix: GET /rooms/:id returned the full room (hostId, settings,
// every participant row) to any logged-in user; GET chat/reactions only
// checked the room exists, so any logged-in user could read a live meeting's
// chat and reactions; POST chat looked the participant up but ignored a
// miss (non-participants could inject messages) and let the request body's
// displayName win over the stored participant row (name spoofing); POST
// reactions had no gate at all; and POST /rooms/:id/leave returned the full
// room to non-participants, leaking everything GET /rooms/:id leaked.
// These tests pin the fix at the route layer: host-or-participant read gate
// (NOT_A_PARTICIPANT), participant-row write gate with the row-derived
// displayName, the identity-free preview for the join gate (name / status /
// participantCount only), and the pre-existing 401/404 behaviour.

vi.mock('livekit-server-sdk', () => {
  class AccessToken {
    addGrant() {}
    async toJwt() {
      return 'header.payload.signature';
    }
  }
  class RoomServiceClient {
    createRoom = vi.fn().mockResolvedValue({ name: 'room', sid: 'RM_test' });
    deleteRoom = vi.fn().mockResolvedValue(undefined);
    listParticipants = vi.fn().mockResolvedValue([]);
  }
  class EgressClient {
    startRoomCompositeEgress = vi.fn().mockResolvedValue({ egressId: 'EG_test' });
    stopEgress = vi.fn().mockResolvedValue({ egressId: 'EG_test' });
  }
  class WebhookReceiver {
    receive = vi.fn();
  }
  class EncodedFileOutput {
    constructor(public readonly value: unknown) {}
  }
  class S3Upload {
    constructor(public readonly value: unknown) {}
  }
  return {
    AccessToken,
    RoomServiceClient,
    EgressClient,
    WebhookReceiver,
    EncodedFileOutput,
    S3Upload,
    EncodedFileType: { MP4: 'MP4' },
  };
});

vi.mock('@quant/ai', () => ({
  AIEngine: class {
    infer = vi.fn().mockResolvedValue({ content: 'summary' });
  },
}));

type MeetingsTestPrisma = RoomPrisma & RecordingPrisma & SummaryPrisma & ActionItemsPrisma;

interface FakeState {
  rooms: Array<{
    id: string;
    name: string;
    hostId: string;
    status: string;
    settings: unknown;
    createdAt: Date;
    updatedAt: Date;
  }>;
  participants: Array<{
    id: string;
    roomId: string;
    userId: string;
    displayName: string;
    role: string;
    audioEnabled: boolean;
    videoEnabled: boolean;
    joinedAt: Date;
  }>;
  recordings: RecordingRow[];
}

function makeFakePrisma() {
  const state: FakeState = { rooms: [], participants: [], recordings: [] };
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;

  const prisma = {
    meetingRoom: {
      async create({ data }: { data: Record<string, unknown> }) {
        const now = new Date();
        const row = {
          id: nextId('room'),
          name: String(data['name']),
          hostId: String(data['hostId']),
          status: String(data['status']),
          settings: data['settings'],
          createdAt: now,
          updatedAt: now,
        };
        state.rooms.push(row);
        return row;
      },
      async findUnique({
        where,
        include,
      }: {
        where: { id: string };
        include?: { participants?: boolean };
      }) {
        const row = state.rooms.find((item) => item.id === where.id);
        if (!row) return null;
        return include?.participants
          ? { ...row, participants: state.participants.filter((p) => p.roomId === row.id) }
          : { ...row };
      },
      async update({
        where,
        data,
        include,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
        include?: { participants?: boolean };
      }) {
        const row = state.rooms.find((item) => item.id === where.id);
        if (!row) throw new Error('missing room');
        Object.assign(row, data, { updatedAt: new Date() });
        return include?.participants
          ? { ...row, participants: state.participants.filter((p) => p.roomId === row.id) }
          : { ...row };
      },
      async findMany() {
        return state.rooms.map((room) => ({
          ...room,
          participants: state.participants.filter((p) => p.roomId === room.id),
        }));
      },
    },
    roomParticipant: {
      async create({ data }: { data: Record<string, unknown> }) {
        const row = {
          id: nextId('participant'),
          roomId: String(data['roomId']),
          userId: String(data['userId']),
          displayName: String(data['displayName']),
          role: String(data['role']),
          audioEnabled: Boolean(data['audioEnabled']),
          videoEnabled: Boolean(data['videoEnabled']),
          joinedAt: new Date(),
        };
        state.participants.push(row);
        return row;
      },
      async delete({ where }: { where: { id: string } }) {
        const index = state.participants.findIndex((item) => item.id === where.id);
        if (index < 0) throw new Error('missing participant');
        return state.participants.splice(index, 1)[0]!;
      },
      async deleteMany({ where }: { where: { roomId: string } }) {
        const previous = state.participants.length;
        state.participants = state.participants.filter((item) => item.roomId !== where.roomId);
        return { count: previous - state.participants.length };
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        return state.participants.filter((item) =>
          Object.entries(where).every(([key, value]) => item[key as keyof typeof item] === value),
        );
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return state.participants.filter((item) =>
          Object.entries(where).every(([key, value]) => item[key as keyof typeof item] === value),
        ).length;
      },
    },
    recording: {
      async create({ data }: { data: Record<string, unknown> }) {
        const row: RecordingRow = {
          id: String(data['id']),
          roomId: String(data['roomId']),
          userId: String(data['userId']),
          status: String(data['status']),
          startedAt: data['startedAt'] as Date,
          stoppedAt: null,
          storageKey: String(data['storageKey']),
          duration: null,
          fileSize: null,
          egressId: (data['egressId'] as string | null) ?? null,
          createdAt: new Date(),
        };
        state.recordings.push(row);
        return row;
      },
      async findUnique({ where }: { where: { id: string } }) {
        return state.recordings.find((item) => item.id === where.id) ?? null;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = state.recordings.find((item) => item.id === where.id);
        if (!row) throw new Error('missing recording');
        Object.assign(row, data);
        return row;
      },
      async findMany({ where }: { where?: Record<string, unknown> }) {
        return state.recordings
          .filter((item) => !where?.['roomId'] || item.roomId === where['roomId'])
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return state.recordings.filter(
          (item) => item.roomId === where['roomId'] && item.status === where['status'],
        ).length;
      },
    },
    meetingSummary: {
      async upsert() {
        throw new Error('not used in QC-F-061 tests');
      },
      async findUnique() {
        return null;
      },
    },
    meetingActionItem: {
      async create() {
        throw new Error('not used in QC-F-061 tests');
      },
      async findMany() {
        return [];
      },
      async update() {
        throw new Error('not used in QC-F-061 tests');
      },
    },
  };

  return { prisma: prisma as unknown as MeetingsTestPrisma, state };
}

const HOST = 'user-host';
const PARTICIPANT = 'user-participant';
const OUTSIDER = 'user-outsider';

const SETTINGS: RoomSettings = {
  maxParticipants: 10,
  waitingRoom: false,
  muteOnEntry: false,
  allowScreenShare: true,
  enableRecording: false,
  enableTranscript: false,
};

function errorCode(res: { json: () => unknown }): string {
  return (res.json() as { error: { code: string } }).error.code;
}

interface RoomJson {
  id: string;
  name: string;
  hostId?: string;
  status: string;
  settings?: unknown;
  participantCount?: number;
  participants: Array<{ userId: string; displayName: string; role: string }>;
  createdAt: string;
}

describe('QC-F-061 meetings room/chat/reactions authorization', () => {
  let app: FastifyInstance;
  // One app per test (one MeetingChatService), with the caller switched via
  // this closure — the meetings-consolidation harness pattern. The in-memory
  // chat store lives inside a single routes registration, so all callers
  // must share one app for cross-user chat assertions to mean anything.
  let authUserId: string | null;

  beforeEach(async () => {
    authUserId = HOST;
    const { prisma } = makeFakePrisma();
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'prisma',
      prisma,
    );
    app.addHook('preHandler', async (request) => {
      if (authUserId) {
        (request as unknown as { auth: { userId: string } }).auth = { userId: authUserId };
      }
    });
    await app.register(meetingsRoutes, { prefix: '/meetings' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  async function as<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
    authUserId = userId;
    try {
      return await fn();
    } finally {
      authUserId = HOST;
    }
  }

  function inject(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) {
    return app.inject(payload === undefined ? { method, url } : { method, url, payload });
  }

  /** Host creates a room (no join). Returns the room id. Caller ends as HOST. */
  async function createRoom(name = 'QC-F-061 room'): Promise<string> {
    const res = await as(HOST, () =>
      inject('POST', '/meetings/rooms', { name, settings: SETTINGS }),
    );
    expect(res.statusCode).toBe(201);
    return (res.json() as { id: string }).id;
  }

  async function joinAs(userId: string, roomId: string, displayName: string) {
    const res = await as(userId, () =>
      inject('POST', `/meetings/rooms/${roomId}/join`, { displayName }),
    );
    expect(res.statusCode).toBe(200);
    return res;
  }

  /**
   * Host creates + joins ('Host'), participant joins ('Guest'), participant
   * posts the chat message 'roadmap secret' and the reaction '👍'.
   */
  async function seedRoom(): Promise<string> {
    const roomId = await createRoom();
    await joinAs(HOST, roomId, 'Host');
    await joinAs(PARTICIPANT, roomId, 'Guest');
    const chat = await as(PARTICIPANT, () =>
      inject('POST', `/meetings/rooms/${roomId}/chat`, { text: 'roadmap secret' }),
    );
    expect(chat.statusCode).toBe(201);
    const reaction = await as(PARTICIPANT, () =>
      inject('POST', `/meetings/rooms/${roomId}/reactions`, { emoji: '👍' }),
    );
    expect(reaction.statusCode).toBe(201);
    return roomId;
  }

  // ── GET /rooms/:id — two-tier ─────────────────────────────────────────────

  it('case 1: non-participant gets the identity-free preview, never participant rows', async () => {
    const roomId = await seedRoom();
    const res = await as(OUTSIDER, () => inject('GET', `/meetings/rooms/${roomId}`));
    expect(res.statusCode).toBe(200);
    const body = res.json() as RoomJson;
    expect(body.name).toBe('QC-F-061 room');
    expect(body.status).toBe('active');
    expect(body.participantCount).toBe(2);
    expect(body.participants).toEqual([]);
    expect(body.hostId).toBeUndefined();
    expect(body.settings).toBeUndefined();
    expect(res.body).not.toContain(HOST);
    expect(res.body).not.toContain(PARTICIPANT);
    expect(res.body).not.toContain('Guest');
  });

  it('case 2: participant gets the full room', async () => {
    const roomId = await seedRoom();
    const res = await as(PARTICIPANT, () => inject('GET', `/meetings/rooms/${roomId}`));
    expect(res.statusCode).toBe(200);
    const body = res.json() as RoomJson;
    expect(body.hostId).toBe(HOST);
    expect(body.settings).toBeDefined();
    expect(body.participants.map((p) => p.userId).sort()).toEqual([HOST, PARTICIPANT].sort());
  });

  it('case 3: host pre-join gets the full room (host-inclusive read)', async () => {
    const roomId = await createRoom();
    const res = await as(HOST, () => inject('GET', `/meetings/rooms/${roomId}`));
    expect(res.statusCode).toBe(200);
    const body = res.json() as RoomJson;
    expect(body.hostId).toBe(HOST);
    expect(body.settings).toBeDefined();
    expect(body.participants).toEqual([]);
  });

  it('case 4: unknown room is 404 ROOM_NOT_FOUND for outsider and host alike', async () => {
    for (const userId of [OUTSIDER, HOST]) {
      const res = await as(userId, () => inject('GET', '/meetings/rooms/room-missing'));
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe('ROOM_NOT_FOUND');
    }
  });

  // ── GET chat / reactions — read gate ──────────────────────────────────────

  it('case 5: non-participant chat read is 403 NOT_A_PARTICIPANT with no content leaked', async () => {
    const roomId = await seedRoom();
    const res = await as(OUTSIDER, () => inject('GET', `/meetings/rooms/${roomId}/chat`));
    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('NOT_A_PARTICIPANT');
    expect(res.body).not.toContain('roadmap secret');
    expect(res.body).not.toContain(PARTICIPANT);
  });

  it('case 6: participant and joined host read chat; host pre-join reads an empty list', async () => {
    const roomId = await seedRoom();
    const asParticipant = await as(PARTICIPANT, () =>
      inject('GET', `/meetings/rooms/${roomId}/chat`),
    );
    expect(asParticipant.statusCode).toBe(200);
    expect(asParticipant.body).toContain('roadmap secret');

    const asHost = await as(HOST, () => inject('GET', `/meetings/rooms/${roomId}/chat`));
    expect(asHost.statusCode).toBe(200);
    expect(asHost.body).toContain('roadmap secret');

    const emptyRoomId = await createRoom('QC-F-061 empty room');
    const preJoin = await as(HOST, () => inject('GET', `/meetings/rooms/${emptyRoomId}/chat`));
    expect(preJoin.statusCode).toBe(200);
    expect(preJoin.json()).toEqual([]);
  });

  it('case 7: non-participant reactions read is 403; participant reads them', async () => {
    const roomId = await seedRoom();
    const denied = await as(OUTSIDER, () =>
      inject('GET', `/meetings/rooms/${roomId}/reactions`),
    );
    expect(denied.statusCode).toBe(403);
    expect(errorCode(denied)).toBe('NOT_A_PARTICIPANT');
    expect(denied.body).not.toContain(PARTICIPANT);

    const allowed = await as(PARTICIPANT, () =>
      inject('GET', `/meetings/rooms/${roomId}/reactions`),
    );
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body).toContain('👍');
  });

  // ── POST chat — write gate + author identity ──────────────────────────────

  it('case 8: non-participant chat inject is 403 and nothing is stored', async () => {
    const roomId = await seedRoom();
    const res = await as(OUTSIDER, () =>
      inject('POST', `/meetings/rooms/${roomId}/chat`, { text: 'injected' }),
    );
    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('NOT_A_PARTICIPANT');
    const list = await as(PARTICIPANT, () => inject('GET', `/meetings/rooms/${roomId}/chat`));
    expect(list.body).not.toContain('injected');
  });

  it('case 9: non-participant inject with a spoofed displayName is still 403, store stays clean', async () => {
    const roomId = await seedRoom();
    const res = await as(OUTSIDER, () =>
      inject('POST', `/meetings/rooms/${roomId}/chat`, { text: 'hi', displayName: 'Host' }),
    );
    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('NOT_A_PARTICIPANT');
    const list = await as(PARTICIPANT, () => inject('GET', `/meetings/rooms/${roomId}/chat`));
    expect(list.body).not.toContain('"text":"hi"');
  });

  it("case 10: a participant's displayName comes from the participant row, not the body", async () => {
    const roomId = await seedRoom();
    const res = await as(PARTICIPANT, () =>
      inject('POST', `/meetings/rooms/${roomId}/chat`, { text: 'mine', displayName: 'Host' }),
    );
    expect(res.statusCode).toBe(201);
    const message = res.json() as { displayName: string; userId: string };
    expect(message.displayName).toBe('Guest');
    expect(message.userId).toBe(PARTICIPANT);
  });

  it('case 11: participant chat happy path is unchanged', async () => {
    const roomId = await seedRoom();
    const res = await as(PARTICIPANT, () =>
      inject('POST', `/meetings/rooms/${roomId}/chat`, { text: 'hello' }),
    );
    expect(res.statusCode).toBe(201);
    const message = res.json() as { displayName: string; userId: string; text: string };
    expect(message.displayName).toBe('Guest');
    expect(message.userId).toBe(PARTICIPANT);
    const list = await as(PARTICIPANT, () => inject('GET', `/meetings/rooms/${roomId}/chat`));
    expect(list.body).toContain('hello');
  });

  it('case 12: host pre-join chat write is 403; after joining it is 201', async () => {
    const roomId = await createRoom();
    const early = await as(HOST, () =>
      inject('POST', `/meetings/rooms/${roomId}/chat`, { text: 'early' }),
    );
    expect(early.statusCode).toBe(403);
    expect(errorCode(early)).toBe('NOT_A_PARTICIPANT');

    await joinAs(HOST, roomId, 'Host');
    const after = await as(HOST, () =>
      inject('POST', `/meetings/rooms/${roomId}/chat`, { text: 'early' }),
    );
    expect(after.statusCode).toBe(201);
  });

  // ── POST reactions — write gate ───────────────────────────────────────────

  it('case 13: non-participant reaction is 403 and nothing is stored', async () => {
    const roomId = await seedRoom();
    const res = await as(OUTSIDER, () =>
      inject('POST', `/meetings/rooms/${roomId}/reactions`, { emoji: '🔥' }),
    );
    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('NOT_A_PARTICIPANT');
    const list = await as(PARTICIPANT, () =>
      inject('GET', `/meetings/rooms/${roomId}/reactions`),
    );
    expect(list.body).not.toContain('🔥');
  });

  it('case 14: participant reaction happy path is unchanged', async () => {
    const roomId = await seedRoom();
    const res = await as(PARTICIPANT, () =>
      inject('POST', `/meetings/rooms/${roomId}/reactions`, { emoji: '🎉' }),
    );
    expect(res.statusCode).toBe(201);
    expect((res.json() as { userId: string }).userId).toBe(PARTICIPANT);
    const list = await as(PARTICIPANT, () =>
      inject('GET', `/meetings/rooms/${roomId}/reactions`),
    );
    expect(list.body).toContain('🎉');
  });

  // ── Leave — rights end + leak branch closed ───────────────────────────────

  it('case 15: after leaving, a participant loses chat rights and sees only the preview', async () => {
    const roomId = await seedRoom();
    const leave = await as(PARTICIPANT, () =>
      inject('POST', `/meetings/rooms/${roomId}/leave`),
    );
    expect(leave.statusCode).toBe(200);

    const chatRead = await as(PARTICIPANT, () =>
      inject('GET', `/meetings/rooms/${roomId}/chat`),
    );
    expect(chatRead.statusCode).toBe(403);
    expect(errorCode(chatRead)).toBe('NOT_A_PARTICIPANT');

    const chatWrite = await as(PARTICIPANT, () =>
      inject('POST', `/meetings/rooms/${roomId}/chat`, { text: 'still here?' }),
    );
    expect(chatWrite.statusCode).toBe(403);

    const room = await as(PARTICIPANT, () => inject('GET', `/meetings/rooms/${roomId}`));
    expect(room.statusCode).toBe(200);
    const body = room.json() as RoomJson;
    expect(body.participants).toEqual([]);
    expect(body.participantCount).toBe(1);
    expect(body.hostId).toBeUndefined();
  });

  it('case 16: non-participant leave returns only the preview and removes nobody', async () => {
    const roomId = await seedRoom();
    const res = await as(OUTSIDER, () => inject('POST', `/meetings/rooms/${roomId}/leave`));
    expect(res.statusCode).toBe(200);
    const body = res.json() as RoomJson;
    expect(body.participants).toEqual([]);
    expect(body.participantCount).toBe(2);
    expect(body.hostId).toBeUndefined();
    expect(body.settings).toBeUndefined();
    expect(res.body).not.toContain(PARTICIPANT);

    const full = await as(HOST, () => inject('GET', `/meetings/rooms/${roomId}`));
    const fullBody = full.json() as RoomJson;
    expect(fullBody.participants.map((p) => p.userId).sort()).toEqual(
      [HOST, PARTICIPANT].sort(),
    );
  });

  it('case 17: participant leave still returns the updated room and host can still close', async () => {
    const roomId = await seedRoom();
    const leave = await as(PARTICIPANT, () =>
      inject('POST', `/meetings/rooms/${roomId}/leave`),
    );
    expect(leave.statusCode).toBe(200);
    const body = leave.json() as RoomJson;
    expect(body.participants.map((p) => p.userId)).toEqual([HOST]);

    const close = await as(HOST, () => inject('POST', `/meetings/rooms/${roomId}/close`));
    expect(close.statusCode).toBe(200);
  });

  // ── Auth + existing flow + closed room ────────────────────────────────────

  it('case 18: unauthenticated callers get 401 on room, chat, reactions, and leave', async () => {
    const roomId = await seedRoom();
    const attempts: Array<['GET' | 'POST', string, Record<string, unknown>?]> = [
      ['GET', `/meetings/rooms/${roomId}`],
      ['GET', `/meetings/rooms/${roomId}/chat`],
      ['POST', `/meetings/rooms/${roomId}/chat`, { text: 'hi' }],
      ['GET', `/meetings/rooms/${roomId}/reactions`],
      ['POST', `/meetings/rooms/${roomId}/reactions`, { emoji: '👍' }],
      ['POST', `/meetings/rooms/${roomId}/leave`],
    ];
    for (const [method, url, payload] of attempts) {
      const res = await as(null, () => inject(method, url, payload));
      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe('UNAUTHORIZED');
    }
  });

  it('case 19: the single-user happy flow (create → get → join → chat → reactions → leave → close) is unchanged', async () => {
    const roomId = await createRoom('QC-F-061 solo room');
    expect((await as(HOST, () => inject('GET', `/meetings/rooms/${roomId}`))).statusCode).toBe(
      200,
    );
    await joinAs(HOST, roomId, 'Host');
    expect(
      (await as(HOST, () => inject('POST', `/meetings/rooms/${roomId}/chat`, { text: 'Hello meeting' })))
        .statusCode,
    ).toBe(201);
    expect((await as(HOST, () => inject('GET', `/meetings/rooms/${roomId}/chat`))).statusCode).toBe(
      200,
    );
    expect(
      (
        await as(HOST, () =>
          inject('POST', `/meetings/rooms/${roomId}/reactions`, { emoji: '👍' }),
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (await as(HOST, () => inject('GET', `/meetings/rooms/${roomId}/reactions`))).statusCode,
    ).toBe(200);
    expect(
      (await as(HOST, () => inject('POST', `/meetings/rooms/${roomId}/leave`))).statusCode,
    ).toBe(200);
    expect(
      (await as(HOST, () => inject('POST', `/meetings/rooms/${roomId}/close`))).statusCode,
    ).toBe(200);
  });

  it('case 20: after close, ex-participants are denied, the host keeps read access, outsiders see a closed preview', async () => {
    const roomId = await seedRoom();
    const close = await as(HOST, () => inject('POST', `/meetings/rooms/${roomId}/close`));
    expect(close.statusCode).toBe(200);

    const exParticipant = await as(PARTICIPANT, () =>
      inject('GET', `/meetings/rooms/${roomId}/chat`),
    );
    expect(exParticipant.statusCode).toBe(403);
    expect(errorCode(exParticipant)).toBe('NOT_A_PARTICIPANT');

    const hostChat = await as(HOST, () => inject('GET', `/meetings/rooms/${roomId}/chat`));
    expect(hostChat.statusCode).toBe(200);
    expect(hostChat.json()).toEqual([]);

    const hostRoom = await as(HOST, () => inject('GET', `/meetings/rooms/${roomId}`));
    expect((hostRoom.json() as RoomJson).status).toBe('closed');
    expect((hostRoom.json() as RoomJson).hostId).toBe(HOST);

    const outsiderRoom = await as(OUTSIDER, () => inject('GET', `/meetings/rooms/${roomId}`));
    const preview = outsiderRoom.json() as RoomJson;
    expect(preview.status).toBe('closed');
    expect(preview.participantCount).toBe(0);
    expect(preview.hostId).toBeUndefined();
  });
});
