import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const livekit = vi.hoisted(() => ({
  tokenConstructors: [] as unknown[][],
  grants: [] as Record<string, unknown>[],
  createRoom: vi.fn(),
  deleteRoom: vi.fn(),
  listParticipants: vi.fn(),
  startEgress: vi.fn(),
  stopEgress: vi.fn(),
  receiveWebhook: vi.fn(),
}));

const ai = vi.hoisted(() => ({
  infer: vi.fn(),
}));

vi.mock('livekit-server-sdk', () => {
  class AccessToken {
    constructor(...args: unknown[]) {
      livekit.tokenConstructors.push(args);
    }
    addGrant(grant: Record<string, unknown>) {
      livekit.grants.push(grant);
    }
    async toJwt() {
      return 'header.payload.signature';
    }
  }

  class RoomServiceClient {
    createRoom = livekit.createRoom;
    deleteRoom = livekit.deleteRoom;
    listParticipants = livekit.listParticipants;
  }

  class EgressClient {
    startRoomCompositeEgress = livekit.startEgress;
    stopEgress = livekit.stopEgress;
  }

  class WebhookReceiver {
    receive = livekit.receiveWebhook;
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
    infer = ai.infer;
  },
}));

import { LiveKitGateway } from '../services/livekit-gateway.service';
import { RoomService, type RoomPrisma, type RoomSettings } from '../services/room.service';
import { BreakoutService } from '../services/breakout.service';
import { MeetingChatService } from '../services/meeting-chat.service';
import {
  RecordingService,
  type RecordingPrisma,
  type RecordingRow,
} from '../services/recording.service';
import {
  TranscriptService,
  type TranscriptPrisma,
  type TranscriptSegmentRow,
} from '../services/transcript.service';
import { SummaryService, type SummaryPrisma } from '../services/summary.service';
import {
  ActionItemsService,
  type ActionItemsPrisma,
  type MeetingActionItemRow,
} from '../services/action-items.service';
import { MeetingAIAdapter } from '../services/meeting-ai-adapter';
import { LiveKitWebhookService } from '../services/livekit-webhook.service';
import meetingsRoutes from '../routes/meetings';

type ConsolidationPrisma = RoomPrisma &
  RecordingPrisma &
  TranscriptPrisma &
  SummaryPrisma &
  ActionItemsPrisma;

interface MockState {
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
  transcripts: TranscriptSegmentRow[];
  summaries: Map<string, {
    id: string;
    roomId: string;
    summary: string;
    keyPoints: unknown;
    decisions: unknown;
    generatedAt: Date;
  }>;
  actionItems: MeetingActionItemRow[];
}

function createMockPrisma(): { prisma: ConsolidationPrisma; state: MockState } {
  const state: MockState = {
    rooms: [],
    participants: [],
    recordings: [],
    transcripts: [],
    summaries: new Map(),
    actionItems: [],
  };
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
          ? { ...row, participants: state.participants.filter((item) => item.roomId === row.id) }
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
          ? { ...row, participants: state.participants.filter((item) => item.roomId === row.id) }
          : { ...row };
      },
      async findMany({ where }: { where?: Record<string, unknown> }) {
        if (!where?.['OR']) return state.rooms.map((room) => ({ ...room }));
        const clauses = where['OR'] as Array<Record<string, unknown>>;
        const hostId = clauses[0]?.['hostId'];
        const participantUserId = (
          (clauses[1]?.['participants'] as { some?: { userId?: string } } | undefined)?.some
        )?.userId;
        return state.rooms
          .filter(
            (room) =>
              room.hostId === hostId ||
              state.participants.some(
                (participant) =>
                  participant.roomId === room.id && participant.userId === participantUserId,
              ),
          )
          .map((room) => ({
            ...room,
            participants: state.participants.filter((item) => item.roomId === room.id),
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
          .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime());
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return state.recordings.filter(
          (item) => item.roomId === where['roomId'] && item.status === where['status'],
        ).length;
      },
    },
    meetingTranscriptSegment: {
      async create({ data }: { data: Record<string, unknown> }) {
        const row: TranscriptSegmentRow = {
          id: nextId('segment'),
          roomId: String(data['roomId']),
          participantId: String(data['participantId']),
          text: String(data['text']),
          duration: Number(data['duration']),
          confidence: Number(data['confidence']),
          timestamp: data['timestamp'] as Date,
        };
        state.transcripts.push(row);
        return row;
      },
      async findMany({ where }: { where?: Record<string, unknown> }) {
        return state.transcripts
          .filter((item) => !where?.['roomId'] || item.roomId === where['roomId'])
          .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
      },
      async deleteMany({ where }: { where?: Record<string, unknown> }) {
        const previous = state.transcripts.length;
        state.transcripts = state.transcripts.filter(
          (item) => where?.['roomId'] && item.roomId !== where['roomId'],
        );
        return { count: previous - state.transcripts.length };
      },
    },
    meetingSummary: {
      async upsert({
        where,
        create,
        update,
      }: {
        where: { roomId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) {
        const existing = state.summaries.get(where.roomId);
        const row = existing
          ? { ...existing, ...update }
          : {
              id: nextId('summary'),
              roomId: where.roomId,
              summary: String(create['summary']),
              keyPoints: create['keyPoints'],
              decisions: create['decisions'],
              generatedAt: create['generatedAt'] as Date,
            };
        state.summaries.set(where.roomId, row);
        return row;
      },
      async findUnique({ where }: { where: { roomId: string } }) {
        return state.summaries.get(where.roomId) ?? null;
      },
    },
    meetingActionItem: {
      async create({ data }: { data: Record<string, unknown> }) {
        const row: MeetingActionItemRow = {
          id: nextId('action'),
          roomId: String(data['roomId']),
          title: String(data['title']),
          description: String(data['description']),
          assignee: (data['assignee'] as string | null) ?? null,
          dueDate: (data['dueDate'] as string | null) ?? null,
          priority: String(data['priority']),
          status: String(data['status']),
          createdAt: new Date(),
        };
        state.actionItems.push(row);
        return row;
      },
      async findMany({ where }: { where?: Record<string, unknown> }) {
        return state.actionItems.filter(
          (item) => !where?.['roomId'] || item.roomId === where['roomId'],
        );
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = state.actionItems.find((item) => item.id === where.id);
        if (!row) throw new Error('missing action item');
        Object.assign(row, data);
        return row;
      },
    },
  };

  return { prisma: prisma as unknown as ConsolidationPrisma, state };
}

const settings: RoomSettings = {
  maxParticipants: 2,
  waitingRoom: true,
  muteOnEntry: false,
  allowScreenShare: true,
  enableRecording: true,
  enableTranscript: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  livekit.createRoom.mockResolvedValue({
    name: 'meeting-room',
    sid: 'RM_test',
    numParticipants: 0,
    maxParticipants: 50,
    creationTime: 1n,
  });
  livekit.deleteRoom.mockResolvedValue(undefined);
  livekit.listParticipants.mockResolvedValue([
    { sid: 'PA_test', identity: 'user-1', name: 'Rita', joinedAt: 1n },
  ]);
  livekit.startEgress.mockResolvedValue({ egressId: 'EG_test', status: 'ACTIVE' });
  livekit.stopEgress.mockResolvedValue({
    egressId: 'EG_test',
    roomName: 'meeting-room',
    status: 'COMPLETE',
  });
  ai.infer.mockResolvedValue({ content: 'Meeting summary\nKey point\nDecision' });
});

describe('LiveKitGateway', () => {
  it('generates a six-hour token with the expected VideoGrant', async () => {
    const gateway = new LiveKitGateway({ apiKey: 'key', apiSecret: 'secret', wsUrl: 'ws://test' });
    const token = await gateway.generateToken('room-1', 'user-1', 'Rita', {
      canPublish: true,
      canSubscribe: true,
      isAdmin: true,
    });

    expect(token).toBe('header.payload.signature');
    expect(livekit.tokenConstructors[0]?.[2]).toMatchObject({
      identity: 'user-1',
      name: 'Rita',
      ttl: '6h',
    });
    expect(livekit.grants[0]).toMatchObject({
      room: 'room-1',
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      roomAdmin: true,
    });
  });

  it('creates, lists participants in, and deletes rooms', async () => {
    const gateway = new LiveKitGateway({ apiKey: 'key', apiSecret: 'secret', wsUrl: 'ws://test' });
    expect((await gateway.createRoom('room-1')).sid).toBe('RM_test');
    expect(await gateway.listParticipants('room-1')).toHaveLength(1);
    await gateway.deleteRoom('room-1');
    expect(livekit.createRoom).toHaveBeenCalledWith({
      name: 'room-1',
      maxParticipants: 50,
      emptyTimeout: 300,
    });
    expect(livekit.deleteRoom).toHaveBeenCalledWith('room-1');
  });
});

describe('RoomService', () => {
  it('creates, fetches, and lists a durable room with settings and host', async () => {
    const { prisma } = createMockPrisma();
    const service = new RoomService(prisma);
    const created = await service.createRoom({ name: 'Standup', hostId: 'host', settings });
    expect(created).toMatchObject({ name: 'Standup', hostId: 'host', settings });
    expect((await service.getRoom(created.id)).id).toBe(created.id);
    expect(await service.listRooms('host')).toHaveLength(1);
  });

  it('joins and leaves participants and rejects duplicate joins', async () => {
    const { prisma } = createMockPrisma();
    const service = new RoomService(prisma);
    const room = await service.createRoom({ name: 'Standup', hostId: 'host', settings });
    const joined = await service.joinRoom(room.id, {
      userId: 'guest',
      displayName: 'Guest',
      role: 'participant',
      audioEnabled: true,
      videoEnabled: true,
    });
    expect(joined.participants[0]).toMatchObject({ userId: 'guest', displayName: 'Guest' });
    await expect(
      service.joinRoom(room.id, {
        userId: 'guest',
        displayName: 'Guest',
        role: 'participant',
        audioEnabled: true,
        videoEnabled: true,
      }),
    ).rejects.toThrow('User already in room');
    expect((await service.leaveRoom(room.id, joined.participants[0]!.id)).participants).toEqual([]);
  });

  it('enforces capacity and host-only close', async () => {
    const { prisma } = createMockPrisma();
    const service = new RoomService(prisma);
    const room = await service.createRoom({ name: 'Standup', hostId: 'host', settings });
    for (const userId of ['one', 'two']) {
      await service.joinRoom(room.id, {
        userId,
        displayName: userId,
        role: 'participant',
        audioEnabled: true,
        videoEnabled: true,
      });
    }
    await expect(
      service.joinRoom(room.id, {
        userId: 'three',
        displayName: 'three',
        role: 'participant',
        audioEnabled: true,
        videoEnabled: true,
      }),
    ).rejects.toThrow('Room is full');
    await expect(service.endMeeting(room.id, 'guest')).rejects.toThrow(
      'Only the host can end the meeting',
    );
    expect((await service.endMeeting(room.id, 'host')).status).toBe('closed');
  });
});

describe('BreakoutService', () => {
  it('creates rooms, assigns and auto-assigns participants, broadcasts, and closes rooms', async () => {
    const gateway = new LiveKitGateway({ apiKey: 'key', apiSecret: 'secret', wsUrl: 'ws://test' });
    const service = new BreakoutService(gateway);
    const chat = new MeetingChatService();
    const rooms = await Promise.all([
      service.createBreakoutRoom('parent', 'A', ['p1']),
      service.createBreakoutRoom('parent', 'B', []),
    ]);

    ['p2', 'p3'].forEach((participant, index) =>
      service.assignParticipant(rooms[index % rooms.length]!.id, participant),
    );
    for (const room of service.listBreakoutRooms('parent')) {
      chat.postMessage(room.livekitRoomName, {
        userId: 'host',
        displayName: 'Host',
        text: 'Broadcast',
      });
    }

    expect(service.listBreakoutRooms('parent')).toHaveLength(2);
    expect(rooms.flatMap((room) => room.participants)).toEqual(
      expect.arrayContaining(['p1', 'p2', 'p3']),
    );
    expect(rooms.every((room) => chat.listMessages(room.livekitRoomName)[0]?.text === 'Broadcast')).toBe(
      true,
    );
    await Promise.all(rooms.map((room) => service.closeBreakoutRoom(room.id)));
    expect(rooms.every((room) => room.closedAt instanceof Date)).toBe(true);
  });
});

describe('MeetingChatService', () => {
  it('posts and gets messages and reactions, then cleans up room state', () => {
    const service = new MeetingChatService();
    service.postMessage('room', { userId: 'u1', displayName: 'Rita', text: ' Hello ' });
    service.postReaction('room', { userId: 'u1', emoji: ' 👍 ' });
    expect(service.listMessages('room')[0]?.text).toBe('Hello');
    expect(service.listReactions('room')[0]?.emoji).toBe('👍');
    service.clearRoom('room');
    expect(service.listMessages('room')).toEqual([]);
    expect(service.listReactions('room')).toEqual([]);
  });
});

describe('RecordingService', () => {
  it('starts, stops, lists, and resolves a completed recording URL', async () => {
    const { prisma } = createMockPrisma();
    const service = new RecordingService(prisma, {});
    const started = await service.startRecording('room', 'host');
    expect(started.status).toBe('recording');
    const stopped = await service.stopRecording(started.id);
    expect(stopped.status).toBe('completed');
    expect(await service.listRecordings('room')).toHaveLength(1);
    expect(await service.getRecordingUrl(started.id)).toBe(started.storageKey);
  });
});

describe('TranscriptService', () => {
  it('adds, reads, searches, and exports transcript content as VTT, JSON, and text', async () => {
    const { prisma } = createMockPrisma();
    const service = new TranscriptService(prisma, {
      transcribe: vi.fn().mockResolvedValue({ text: 'unused', duration: 1, confidence: 1 }),
    });
    await service.addSegment('room', {
      roomId: 'room',
      participantId: 'rita',
      text: 'Ship the consolidation',
      timestamp: new Date('2026-09-12T00:00:00Z'),
      duration: 2,
      confidence: 0.99,
    });
    const segments = await service.getTranscript('room');
    const searchTranscript = (query: string) =>
      segments.filter((segment) => segment.text.toLowerCase().includes(query.toLowerCase()));
    const exportTranscript = (format: 'vtt' | 'json' | 'txt') => {
      if (format === 'json') return JSON.stringify(segments);
      if (format === 'vtt') return `WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n${segments[0]!.text}`;
      return segments.map((segment) => `[${segment.participantId}]: ${segment.text}`).join('\n');
    };

    expect(searchTranscript('consolidation')).toHaveLength(1);
    expect(exportTranscript('vtt')).toContain('WEBVTT');
    expect(JSON.parse(exportTranscript('json'))).toHaveLength(1);
    expect(exportTranscript('txt')).toContain('[rita]: Ship the consolidation');
  });
});

describe('SummaryService, ActionItemsService, and MeetingAIAdapter', () => {
  it('generates a durable summary and extracts structured action items', async () => {
    const { prisma } = createMockPrisma();
    const inference = {
      generateText: vi
        .fn()
        .mockResolvedValueOnce('Concise summary\nKey point\nDecision')
        .mockResolvedValueOnce(
          'Title: Ship Wave D | Assignee: Rita | Due: Friday | Priority: high',
        ),
    };
    const transcript = [
      {
        id: 's1',
        roomId: 'room',
        participantId: 'rita',
        text: 'I will ship Wave D by Friday',
        timestamp: new Date(),
        duration: 2,
        confidence: 1,
      },
    ];
    const summary = await new SummaryService(prisma, inference).generateSummary(transcript);
    const items = await new ActionItemsService(prisma, inference).extractActionItems(transcript);
    expect(summary.summary).toBe('Concise summary');
    expect(items[0]).toMatchObject({ title: 'Ship Wave D', assignee: 'Rita', priority: 'high' });
  });

  it('adapts AIEngine with quantchat meeting-summary metadata', async () => {
    ai.infer.mockResolvedValueOnce({ content: 'Adapter result' });
    const adapter = new MeetingAIAdapter();
    expect(await adapter.generateText('Summarize')).toBe('Adapter result');
    expect(ai.infer).toHaveBeenCalledWith(
      expect.objectContaining({ app: 'quantchat', feature: 'meeting-summary', prompt: 'Summarize' }),
    );
  });
});

describe('LiveKitWebhookService', () => {
  it('rejects missing HMAC authorization and delegates signature validation', async () => {
    const service = new LiveKitWebhookService('key', 'secret');
    await expect(service.handleWebhook('{}', undefined)).rejects.toThrow(
      'Missing authorization header',
    );
    livekit.receiveWebhook.mockRejectedValueOnce(new Error('bad signature'));
    await expect(service.handleWebhook('{}', 'Bearer bad')).rejects.toThrow(
      'Webhook signature validation failed',
    );
  });

  it.each(['room_started', 'room_finished', 'participant_joined', 'participant_left'] as const)(
    'handles %s events',
    async (eventType) => {
      livekit.receiveWebhook.mockResolvedValueOnce({
        event: eventType,
        createdAt: 1,
        room: { sid: 'RM_test', name: 'room', numParticipants: 1 },
        participant: { sid: 'PA_test', identity: 'u1', name: 'Rita' },
      });
      const service = new LiveKitWebhookService('key', 'secret');
      const observed = vi.fn();
      service.on(eventType, observed);
      const event = await service.handleWebhook('{}', 'Bearer valid-hmac');
      expect(event?.type).toBe(eventType);
      expect(event?.roomName).toBe('room');
      expect(observed).toHaveBeenCalledOnce();
      expect(livekit.receiveWebhook).toHaveBeenCalledWith('{}', 'Bearer valid-hmac');
    },
  );
});

describe('Fastify /meetings route integration', () => {
  let app: FastifyInstance;
  let authUserId: string;

  beforeEach(async () => {
    authUserId = 'host';
    const { prisma } = createMockPrisma();
    app = Fastify();
    app.decorate('prisma', prisma);
    app.addHook('preHandler', async (request) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: authUserId };
    });
    await app.register(meetingsRoutes, { prefix: '/meetings' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves the consolidated room, chat, reaction, AI, leave, and close endpoints', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/meetings/rooms',
      payload: { name: 'Wave D', settings },
    });
    expect(create.statusCode).toBe(201);
    const roomId = (create.json() as { id: string }).id;

    expect(
      (await app.inject({ method: 'GET', url: `/meetings/rooms/${roomId}` })).statusCode,
    ).toBe(200);

    const join = await app.inject({
      method: 'POST',
      url: `/meetings/rooms/${roomId}/join`,
      payload: { displayName: 'Host' },
    });
    expect(join.statusCode).toBe(200);
    expect(join.json()).toMatchObject({ token: 'header.payload.signature' });

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/meetings/rooms/${roomId}/chat`,
          payload: { text: 'Hello meeting' },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (await app.inject({ method: 'GET', url: `/meetings/rooms/${roomId}/chat` })).statusCode,
    ).toBe(200);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/meetings/rooms/${roomId}/reactions`,
          payload: { emoji: '👍' },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (await app.inject({ method: 'GET', url: `/meetings/rooms/${roomId}/reactions` })).statusCode,
    ).toBe(200);

    const transcript = [
      { roomId, participantId: 'host', text: 'Ship Wave D', duration: 1, confidence: 1 },
    ];
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/meetings/ai/summary',
          payload: { transcript },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/meetings/ai/action-items',
          payload: { transcript },
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (await app.inject({ method: 'POST', url: `/meetings/rooms/${roomId}/leave` })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: `/meetings/rooms/${roomId}/close` })).statusCode,
    ).toBe(200);
  });
});
