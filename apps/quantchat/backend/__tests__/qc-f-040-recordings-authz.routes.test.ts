import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import meetingsRoutes from '../routes/meetings';
import type { RoomPrisma, RoomSettings } from '../services/room.service';
import type { RecordingPrisma, RecordingRow } from '../services/recording.service';
import type { SummaryPrisma } from '../services/summary.service';
import type { ActionItemsPrisma } from '../services/action-items.service';

// QC-F-040 — Meetings recordings BOLA + self-assigned host role.
// Before the fix: POST /rooms/:roomId/recordings/start only checked that the
// room exists (any logged-in user could covertly start a recording of anyone
// else's meeting, even with enableRecording off), stop/list/url discarded the
// caller's userId entirely (anyone could stop, list, or resolve the
// storageKey of any recording), and POST /rooms/:id/join stored whatever
// `role` the client sent — joiners could self-assign 'host'/'co-host'.
// These tests pin the service-layer gates at the route layer: host-only
// start (+ RECORDING_DISABLED), host-or-recorder stop, participant-gated
// list/url, server-derived join role, and the pre-existing 401/404/409/400
// behaviour for legitimate callers.

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

  const recordingCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
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
  });
  const recordingUpdate = vi.fn(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = state.recordings.find((item) => item.id === where.id);
      if (!row) throw new Error('missing recording');
      Object.assign(row, data);
      return row;
    },
  );

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
      create: recordingCreate,
      async findUnique({ where }: { where: { id: string } }) {
        return state.recordings.find((item) => item.id === where.id) ?? null;
      },
      update: recordingUpdate,
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
        throw new Error('not used in QC-F-040 tests');
      },
      async findUnique() {
        return null;
      },
    },
    meetingActionItem: {
      async create() {
        throw new Error('not used in QC-F-040 tests');
      },
      async findMany() {
        return [];
      },
      async update() {
        throw new Error('not used in QC-F-040 tests');
      },
    },
  };

  return {
    prisma: prisma as unknown as MeetingsTestPrisma,
    state,
    recordingCreate,
    recordingUpdate,
  };
}

const HOST = 'user-host';
const PARTICIPANT = 'user-participant';
const OUTSIDER = 'user-outsider';

function settingsWith(enableRecording: boolean): RoomSettings {
  return {
    maxParticipants: 10,
    waitingRoom: false,
    muteOnEntry: false,
    allowScreenShare: true,
    enableRecording,
    enableTranscript: false,
  };
}

function errorCode(res: { json: () => unknown }): string {
  return (res.json() as { error: { code: string } }).error.code;
}

describe('QC-F-040 meetings recordings authorization', () => {
  let apps: FastifyInstance[] = [];

  async function openApp(
    authUserId: string | null,
    prisma: MeetingsTestPrisma,
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
    await app.register(meetingsRoutes, { prefix: '/meetings' });
    await app.ready();
    apps.push(app);
    return app;
  }

  afterEach(async () => {
    for (const app of apps) {
      await app.close();
    }
    apps = [];
  });

  /** Host creates a room; PARTICIPANT joins it. Returns the room id. */
  async function setupRoom(
    fake: ReturnType<typeof makeFakePrisma>,
    enableRecording = true,
  ): Promise<{ roomId: string; hostApp: FastifyInstance; participantApp: FastifyInstance }> {
    const hostApp = await openApp(HOST, fake.prisma);
    const create = await hostApp.inject({
      method: 'POST',
      url: '/meetings/rooms',
      payload: { name: 'QC-F-040 room', settings: settingsWith(enableRecording) },
    });
    expect(create.statusCode).toBe(201);
    const roomId = (create.json() as { id: string }).id;

    const participantApp = await openApp(PARTICIPANT, fake.prisma);
    const join = await participantApp.inject({
      method: 'POST',
      url: `/meetings/rooms/${roomId}/join`,
      payload: { displayName: 'Participant' },
    });
    expect(join.statusCode).toBe(200);
    return { roomId, hostApp, participantApp };
  }

  async function startAsHost(hostApp: FastifyInstance, roomId: string) {
    const res = await hostApp.inject({
      method: 'POST',
      url: `/meetings/rooms/${roomId}/recordings/start`,
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; storageKey: string; userId: string; status: string };
  }

  function seedRecording(
    fake: ReturnType<typeof makeFakePrisma>,
    roomId: string,
    userId: string,
    status = 'recording',
  ): RecordingRow {
    const row: RecordingRow = {
      id: `seeded-${fake.state.recordings.length + 1}`,
      roomId,
      userId,
      status,
      startedAt: new Date(Date.now() - 60_000),
      stoppedAt: status === 'completed' ? new Date() : null,
      storageKey: `recordings/${roomId}/seeded.webm`,
      duration: status === 'completed' ? 60 : null,
      fileSize: null,
      egressId: null,
      createdAt: new Date(),
    };
    fake.state.recordings.push(row);
    return row;
  }

  it('start: non-participant is denied 403 NOT_MEETING_HOST and no recording row is created', async () => {
    const fake = makeFakePrisma();
    const { roomId } = await setupRoom(fake);
    const outsiderApp = await openApp(OUTSIDER, fake.prisma);

    const res = await outsiderApp.inject({
      method: 'POST',
      url: `/meetings/rooms/${roomId}/recordings/start`,
    });

    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('NOT_MEETING_HOST');
    expect(fake.recordingCreate).not.toHaveBeenCalled();
    expect(fake.state.recordings).toHaveLength(0);
  });

  it('start: participant who is not the host is denied 403 NOT_MEETING_HOST', async () => {
    const fake = makeFakePrisma();
    const { roomId, participantApp } = await setupRoom(fake);

    const res = await participantApp.inject({
      method: 'POST',
      url: `/meetings/rooms/${roomId}/recordings/start`,
    });

    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('NOT_MEETING_HOST');
    expect(fake.recordingCreate).not.toHaveBeenCalled();
  });

  it('start: host succeeds 201 when recording is enabled, and a second start is 409', async () => {
    const fake = makeFakePrisma();
    const { roomId, hostApp } = await setupRoom(fake);

    const started = await startAsHost(hostApp, roomId);
    expect(started).toMatchObject({ userId: HOST, status: 'recording' });
    expect(fake.state.recordings).toHaveLength(1);

    const again = await hostApp.inject({
      method: 'POST',
      url: `/meetings/rooms/${roomId}/recordings/start`,
    });
    expect(again.statusCode).toBe(409);
    expect(errorCode(again)).toBe('RECORDING_ALREADY_ACTIVE');
    expect(fake.state.recordings).toHaveLength(1);
  });

  it('start: host is denied 403 RECORDING_DISABLED when the room disabled recording', async () => {
    const fake = makeFakePrisma();
    const { roomId, hostApp } = await setupRoom(fake, false);

    const res = await hostApp.inject({
      method: 'POST',
      url: `/meetings/rooms/${roomId}/recordings/start`,
    });

    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('RECORDING_DISABLED');
    expect(fake.recordingCreate).not.toHaveBeenCalled();
  });

  it('start: unknown room is 404 ROOM_NOT_FOUND for outsider and host alike', async () => {
    const fake = makeFakePrisma();
    await setupRoom(fake);
    const outsiderApp = await openApp(OUTSIDER, fake.prisma);
    const hostApp = await openApp(HOST, fake.prisma);

    for (const app of [outsiderApp, hostApp]) {
      const res = await app.inject({
        method: 'POST',
        url: '/meetings/rooms/no-such-room/recordings/start',
      });
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe('ROOM_NOT_FOUND');
    }
    expect(fake.recordingCreate).not.toHaveBeenCalled();
  });

  it('stop: non-participant and non-recorder participant are denied 403, recording stays active', async () => {
    const fake = makeFakePrisma();
    const { roomId, hostApp, participantApp } = await setupRoom(fake);
    const started = await startAsHost(hostApp, roomId);
    const outsiderApp = await openApp(OUTSIDER, fake.prisma);

    for (const app of [outsiderApp, participantApp]) {
      const res = await app.inject({
        method: 'POST',
        url: `/meetings/recordings/${started.id}/stop`,
      });
      expect(res.statusCode).toBe(403);
      expect(errorCode(res)).toBe('NOT_MEETING_HOST');
    }
    expect(fake.recordingUpdate).not.toHaveBeenCalled();
    expect(fake.state.recordings[0]?.status).toBe('recording');
  });

  it('stop: the recorder may stop their own recording, and the host may stop a participant recording', async () => {
    const fake = makeFakePrisma();
    const { roomId, hostApp, participantApp } = await setupRoom(fake);

    const own = seedRecording(fake, roomId, PARTICIPANT);
    const stoppedOwn = await participantApp.inject({
      method: 'POST',
      url: `/meetings/recordings/${own.id}/stop`,
    });
    expect(stoppedOwn.statusCode).toBe(200);
    expect((stoppedOwn.json() as { status: string }).status).toBe('completed');

    const other = seedRecording(fake, roomId, PARTICIPANT);
    const stoppedByHost = await hostApp.inject({
      method: 'POST',
      url: `/meetings/recordings/${other.id}/stop`,
    });
    expect(stoppedByHost.statusCode).toBe(200);
    expect((stoppedByHost.json() as { status: string }).status).toBe('completed');
  });

  it('stop: unknown recording is 404 and a completed recording is 400 for the host', async () => {
    const fake = makeFakePrisma();
    const { roomId, hostApp } = await setupRoom(fake);

    const missing = await hostApp.inject({
      method: 'POST',
      url: '/meetings/recordings/no-such-recording/stop',
    });
    expect(missing.statusCode).toBe(404);
    expect(errorCode(missing)).toBe('RECORDING_NOT_FOUND');

    const done = seedRecording(fake, roomId, HOST, 'completed');
    const res = await hostApp.inject({
      method: 'POST',
      url: `/meetings/recordings/${done.id}/stop`,
    });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('RECORDING_NOT_ACTIVE');
  });

  it('list: non-participant is denied 403 NOT_A_PARTICIPANT with no metadata leaked', async () => {
    const fake = makeFakePrisma();
    const { roomId, hostApp } = await setupRoom(fake);
    const started = await startAsHost(hostApp, roomId);
    const outsiderApp = await openApp(OUTSIDER, fake.prisma);

    const res = await outsiderApp.inject({
      method: 'GET',
      url: `/meetings/rooms/${roomId}/recordings`,
    });

    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('NOT_A_PARTICIPANT');
    expect(res.body).not.toContain(started.storageKey);
  });

  it('list: participant and host both get the recordings; unknown room is 404', async () => {
    const fake = makeFakePrisma();
    const { roomId, hostApp, participantApp } = await setupRoom(fake);
    await startAsHost(hostApp, roomId);

    for (const app of [participantApp, hostApp]) {
      const res = await app.inject({
        method: 'GET',
        url: `/meetings/rooms/${roomId}/recordings`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json() as unknown[]).toHaveLength(1);
    }

    const missing = await hostApp.inject({
      method: 'GET',
      url: '/meetings/rooms/no-such-room/recordings',
    });
    expect(missing.statusCode).toBe(404);
    expect(errorCode(missing)).toBe('ROOM_NOT_FOUND');
  });

  it('url: non-participant is denied 403 and never sees the storageKey', async () => {
    const fake = makeFakePrisma();
    const { roomId, hostApp } = await setupRoom(fake);
    const started = await startAsHost(hostApp, roomId);
    const stop = await hostApp.inject({
      method: 'POST',
      url: `/meetings/recordings/${started.id}/stop`,
    });
    expect(stop.statusCode).toBe(200);
    const outsiderApp = await openApp(OUTSIDER, fake.prisma);

    const res = await outsiderApp.inject({
      method: 'GET',
      url: `/meetings/recordings/${started.id}/url`,
    });

    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('NOT_A_PARTICIPANT');
    expect(res.body).not.toContain(started.storageKey);
  });

  it('url: participant resolves a completed recording; an active one is 400 RECORDING_NOT_READY', async () => {
    const fake = makeFakePrisma();
    const { roomId, hostApp, participantApp } = await setupRoom(fake);
    const started = await startAsHost(hostApp, roomId);

    const notReady = await participantApp.inject({
      method: 'GET',
      url: `/meetings/recordings/${started.id}/url`,
    });
    expect(notReady.statusCode).toBe(400);
    expect(errorCode(notReady)).toBe('RECORDING_NOT_READY');

    const stop = await hostApp.inject({
      method: 'POST',
      url: `/meetings/recordings/${started.id}/stop`,
    });
    expect(stop.statusCode).toBe(200);

    const res = await participantApp.inject({
      method: 'GET',
      url: `/meetings/recordings/${started.id}/url`,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { url: string }).url).toBe(started.storageKey);
  });

  it('join: a client-sent role never escalates — host/co-host bodies store participant', async () => {
    const fake = makeFakePrisma();
    const hostApp = await openApp(HOST, fake.prisma);
    const create = await hostApp.inject({
      method: 'POST',
      url: '/meetings/rooms',
      payload: { name: 'Join role room', settings: settingsWith(true) },
    });
    const roomId = (create.json() as { id: string }).id;

    for (const [userId, sentRole] of [
      ['user-x1', 'host'],
      ['user-x2', 'co-host'],
    ] as const) {
      const app = await openApp(userId, fake.prisma);
      const join = await app.inject({
        method: 'POST',
        url: `/meetings/rooms/${roomId}/join`,
        payload: { displayName: userId, role: sentRole },
      });
      // Legacy clients sending `role` are stripped, not rejected.
      expect(join.statusCode).toBe(200);
      const body = join.json() as {
        participant: { userId: string; role: string };
        room: { participants: Array<{ userId: string; role: string }> };
      };
      expect(body.participant).toMatchObject({ userId, role: 'participant' });
      expect(
        body.room.participants.find((item) => item.userId === userId)?.role,
      ).toBe('participant');
    }
    expect(
      fake.state.participants.every((item) => item.role === 'participant'),
    ).toBe(true);
  });

  it('join: the real host still derives the host role even when sending role participant', async () => {
    const fake = makeFakePrisma();
    const hostApp = await openApp(HOST, fake.prisma);
    const create = await hostApp.inject({
      method: 'POST',
      url: '/meetings/rooms',
      payload: { name: 'Host join room', settings: settingsWith(true) },
    });
    const roomId = (create.json() as { id: string }).id;

    const join = await hostApp.inject({
      method: 'POST',
      url: `/meetings/rooms/${roomId}/join`,
      payload: { displayName: 'Host', role: 'participant' },
    });
    expect(join.statusCode).toBe(200);
    expect((join.json() as { participant: { role: string } }).participant.role).toBe('host');
  });

  it('unauthenticated: recordings start/stop/list/url and join all fail closed with 401', async () => {
    const fake = makeFakePrisma();
    const { roomId, hostApp } = await setupRoom(fake);
    const started = await startAsHost(hostApp, roomId);
    const anon = await openApp(null, fake.prisma);

    const attempts: Array<{ method: 'GET' | 'POST'; url: string }> = [
      { method: 'POST', url: `/meetings/rooms/${roomId}/recordings/start` },
      { method: 'POST', url: `/meetings/recordings/${started.id}/stop` },
      { method: 'GET', url: `/meetings/rooms/${roomId}/recordings` },
      { method: 'GET', url: `/meetings/recordings/${started.id}/url` },
      { method: 'POST', url: `/meetings/rooms/${roomId}/join` },
    ];
    for (const attempt of attempts) {
      const res = await anon.inject(attempt);
      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe('UNAUTHORIZED');
    }
    expect(fake.state.recordings[0]?.status).toBe('recording');
  });
});
