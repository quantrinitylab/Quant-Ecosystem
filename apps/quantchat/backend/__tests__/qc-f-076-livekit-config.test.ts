// ===========================================================================
// QC-F-076 — LiveKit credentials fail closed (no public dev fallback)
// ===========================================================================
//
// Before this fix, meetings (LiveKitGateway + LiveKitWebhookService) and the
// voice-bot factory + VoiceBotAgentService fell back to the public source
// strings 'devkey'/'devsecret' whenever LIVEKIT_API_KEY / LIVEKIT_API_SECRET
// were unset, so anyone could forge meeting/bot tokens and LiveKit webhooks
// on any deployment missing that env. These tests pin the fail-closed
// behaviour (brief: hidden_files/loop/specialist-qc-f-076.md §8):
// unconfigured surfaces answer an honest 503 (MEETINGS_UNAVAILABLE /
// VOICE_BOT_UNAVAILABLE), non-LiveKit surfaces keep working, configured
// surfaces keep minting with the configured values only.

import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import meetingsRoutes from '../routes/meetings';
import voiceBotRoutes, { createVoiceBotServices } from '../routes/voice-bot';
import { VoiceBotAgentService } from '../services/voice-bot-agent.service';

const livekit = vi.hoisted(() => ({
  accessTokenArgs: [] as unknown[][],
  roomServiceClientArgs: [] as unknown[][],
  webhookReceiverArgs: [] as unknown[][],
  receiveCalls: [] as unknown[][],
  receiveImpl: null as null | ((body: string, authHeader: string) => Promise<unknown>),
}));

vi.mock('livekit-server-sdk', () => {
  class AccessToken {
    constructor(...args: unknown[]) {
      livekit.accessTokenArgs.push(args);
    }
    addGrant() {}
    async toJwt() {
      return 'mock.jwt.token';
    }
  }

  class RoomServiceClient {
    constructor(...args: unknown[]) {
      livekit.roomServiceClientArgs.push(args);
    }
    createRoom = vi.fn().mockResolvedValue({
      name: 'chat-call:test',
      sid: 'RM_test',
      numParticipants: 0,
      maxParticipants: 2,
      creationTime: BigInt(1700000000),
    });
    deleteRoom = vi.fn().mockResolvedValue(undefined);
    removeParticipant = vi.fn().mockResolvedValue(undefined);
    listParticipants = vi.fn().mockResolvedValue([]);
  }

  class EgressClient {
    startRoomCompositeEgress = vi.fn();
    stopEgress = vi.fn();
  }

  class WebhookReceiver {
    constructor(...args: unknown[]) {
      livekit.webhookReceiverArgs.push(args);
    }
    receive = (body: string, authHeader: string) => {
      livekit.receiveCalls.push([body, authHeader]);
      if (!livekit.receiveImpl) throw new Error('WebhookReceiver.receive not stubbed');
      return livekit.receiveImpl(body, authHeader);
    };
  }

  class EncodedFileOutput {
    constructor(public readonly value: unknown) {}
  }

  class S3Upload {
    constructor(public readonly value: unknown) {}
  }

  return { AccessToken, RoomServiceClient, EgressClient, WebhookReceiver, EncodedFileOutput, S3Upload };
});

// ---------------------------------------------------------------------------
// Env helpers (calls.routes.test.ts pattern)
// ---------------------------------------------------------------------------

const LIVEKIT_ENV_KEYS = [
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'LIVEKIT_WS_URL',
  'LIVEKIT_URL',
  'NEXT_PUBLIC_LIVEKIT_URL',
] as const;

function clearLiveKitEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of LIVEKIT_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return saved;
}

function setLiveKitTestEnv(): void {
  process.env['LIVEKIT_API_KEY'] = 'test-livekit-key';
  process.env['LIVEKIT_API_SECRET'] = 'test-livekit-secret';
  process.env['LIVEKIT_WS_URL'] = 'ws://livekit.test:7880';
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

function capturedArgsContain(value: string): boolean {
  const all = [...livekit.accessTokenArgs, ...livekit.roomServiceClientArgs, ...livekit.webhookReceiverArgs];
  return JSON.stringify(all).includes(value);
}

// ---------------------------------------------------------------------------
// Minimal in-memory prisma for the meetings RoomService paths under test
// ---------------------------------------------------------------------------

interface FakeParticipant {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  role: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  joinedAt: Date;
}

interface FakeRoom {
  id: string;
  name: string;
  hostId: string;
  status: string;
  settings: Record<string, unknown>;
  createdAt: Date;
}

function createFakeMeetingsPrisma() {
  const rooms = new Map<string, FakeRoom>();
  const participants = new Map<string, FakeParticipant>();
  let roomSeq = 0;
  let participantSeq = 0;

  const withParticipants = (room: FakeRoom) => ({
    ...room,
    participants: [...participants.values()].filter((p) => p.roomId === room.id),
  });

  return {
    meetingRoom: {
      async create({ data }: { data: Record<string, unknown> }) {
        const room: FakeRoom = {
          id: `room-${++roomSeq}`,
          name: data['name'] as string,
          hostId: data['hostId'] as string,
          status: data['status'] as string,
          settings: data['settings'] as Record<string, unknown>,
          createdAt: new Date(),
        };
        rooms.set(room.id, room);
        return room;
      },
      async findUnique({ where }: { where: { id: string } }) {
        const room = rooms.get(where.id);
        return room ? withParticipants(room) : null;
      },
      async findMany() {
        return [...rooms.values()].map(withParticipants);
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const room = rooms.get(where.id);
        if (!room) throw new Error('Room not found');
        Object.assign(room, data);
        return withParticipants(room);
      },
    },
    roomParticipant: {
      async create({ data }: { data: Record<string, unknown> }) {
        const participant: FakeParticipant = {
          id: `participant-${++participantSeq}`,
          roomId: data['roomId'] as string,
          userId: data['userId'] as string,
          displayName: data['displayName'] as string,
          role: data['role'] as string,
          audioEnabled: data['audioEnabled'] as boolean,
          videoEnabled: data['videoEnabled'] as boolean,
          joinedAt: new Date(),
        };
        participants.set(participant.id, participant);
        return participant;
      },
      async delete({ where }: { where: { id: string } }) {
        const participant = participants.get(where.id);
        participants.delete(where.id);
        return participant;
      },
      async deleteMany({ where }: { where: { roomId: string } }) {
        let count = 0;
        for (const [id, p] of participants) {
          if (p.roomId === where.roomId) {
            participants.delete(id);
            count++;
          }
        }
        return { count };
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        return [...participants.values()].filter((p) => p.roomId === where['roomId']);
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return [...participants.values()].filter((p) => p.roomId === where['roomId']).length;
      },
    },
  };
}

const ROOM_SETTINGS = {
  maxParticipants: 10,
  waitingRoom: false,
  muteOnEntry: false,
  allowScreenShare: true,
  enableRecording: false,
  enableTranscript: false,
};

async function buildMeetingsApp(userId = 'host-1'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  const prisma = createFakeMeetingsPrisma();
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate('prisma', prisma);
  app.addHook('preHandler', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(meetingsRoutes, { prefix: '/meetings' });
  await app.ready();
  return app;
}

async function createRoom(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/meetings/rooms',
    payload: { name: 'QC-F-076 room', settings: ROOM_SETTINGS },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { id: string }).id;
}

async function buildVoiceBotApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(voiceBotRoutes, { prefix: '/voice-bot' });
  await app.ready();
  return app;
}

const ALERT_PAYLOAD = {
  userId: 'usr-076',
  meetingId: 'mtg-076',
  title: 'Design Review',
  organizer: 'Raj',
  startTime: '2026-10-12T10:00:00.000Z',
  minutesUntilStart: 5,
};

function signAlert(secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(JSON.stringify(ALERT_PAYLOAD)).digest('hex');
}

beforeEach(() => {
  livekit.accessTokenArgs.length = 0;
  livekit.roomServiceClientArgs.length = 0;
  livekit.webhookReceiverArgs.length = 0;
  livekit.receiveCalls.length = 0;
  livekit.receiveImpl = null;
});

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

describe('QC-F-076 meetings — LiveKit not configured', () => {
  let app: FastifyInstance;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    savedEnv = clearLiveKitEnv();
    app = await buildMeetingsApp();
  });

  afterEach(async () => {
    await app.close();
    restoreEnv(savedEnv);
  });

  it('case 1+2: join fails closed 503 MEETINGS_UNAVAILABLE and mints nothing, while non-LiveKit meetings routes keep working', async () => {
    const roomId = await createRoom(app);

    const list = await app.inject({ method: 'GET', url: '/meetings/rooms' });
    expect(list.statusCode).toBe(200);

    const join = await app.inject({
      method: 'POST',
      url: `/meetings/rooms/${roomId}/join`,
      payload: { displayName: 'Host' },
    });
    expect(join.statusCode).toBe(503);
    const body = join.json() as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('MEETINGS_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('token');
    expect(livekit.accessTokenArgs).toEqual([]);
  });

  it('case 3: webhook fails closed 503 (never 200 received) and the receiver is never built', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/meetings/webhooks/livekit',
      headers: { authorization: 'Bearer forged-webhook' },
      payload: { event: 'room_started' },
    });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { error: { code: string } }).error.code).toBe('MEETINGS_UNAVAILABLE');
    expect(livekit.webhookReceiverArgs).toEqual([]);
    expect(livekit.receiveCalls).toEqual([]);
  });

  it('case 12 (meetings half): empty-string env counts as missing — join still 503', async () => {
    process.env['LIVEKIT_API_KEY'] = '';
    process.env['LIVEKIT_API_SECRET'] = '';
    process.env['LIVEKIT_WS_URL'] = 'ws://livekit.test:7880';

    const roomId = await createRoom(app);
    const join = await app.inject({
      method: 'POST',
      url: `/meetings/rooms/${roomId}/join`,
      payload: { displayName: 'Host' },
    });
    expect(join.statusCode).toBe(503);
    expect((join.json() as { error: { code: string } }).error.code).toBe('MEETINGS_UNAVAILABLE');
    expect(livekit.accessTokenArgs).toEqual([]);
  });
});

describe('QC-F-076 meetings — LiveKit configured', () => {
  let app: FastifyInstance;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    savedEnv = clearLiveKitEnv();
    setLiveKitTestEnv();
    app = await buildMeetingsApp();
  });

  afterEach(async () => {
    await app.close();
    restoreEnv(savedEnv);
  });

  it('case 5: join mints with the configured values and returns the configured serverUrl', async () => {
    const roomId = await createRoom(app);
    const join = await app.inject({
      method: 'POST',
      url: `/meetings/rooms/${roomId}/join`,
      payload: { displayName: 'Host' },
    });
    expect(join.statusCode).toBe(200);
    const body = join.json() as { token: string; serverUrl: string };
    expect(body.token).toBe('mock.jwt.token');
    expect(body.serverUrl).toBe('ws://livekit.test:7880');
    expect(capturedArgsContain('test-livekit-key')).toBe(true);
    expect(capturedArgsContain('test-livekit-secret')).toBe(true);
    expect(capturedArgsContain('devkey')).toBe(false);
    expect(capturedArgsContain('devsecret')).toBe(false);
  });

  it('case 4: a webhook signed with the public fallback secret is rejected 401; a valid one is received 200', async () => {
    livekit.receiveImpl = async (_body, authHeader) => {
      if (authHeader === 'valid-test-signature') {
        return { event: 'room_started', createdAt: 1, room: { sid: 'RM_1', name: 'room-1' } };
      }
      throw new Error('invalid signature');
    };

    const forged = await app.inject({
      method: 'POST',
      url: '/meetings/webhooks/livekit',
      headers: { authorization: 'forged-with-public-secret' },
      payload: { event: 'room_started' },
    });
    expect(forged.statusCode).toBe(401);
    expect((forged.json() as { error: { code: string } }).error.code).toBe(
      'WEBHOOK_SIGNATURE_INVALID',
    );
    // The receiver was built from the configured secret, never the fallback.
    expect(JSON.stringify(livekit.webhookReceiverArgs)).toContain('test-livekit-secret');
    expect(capturedArgsContain('devsecret')).toBe(false);

    const valid = await app.inject({
      method: 'POST',
      url: '/meetings/webhooks/livekit',
      headers: { authorization: 'valid-test-signature' },
      payload: { event: 'room_started' },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toEqual({ received: true });
  });
});

// ---------------------------------------------------------------------------
// Voice-bot factory + routes
// ---------------------------------------------------------------------------

describe('QC-F-076 voice-bot factory', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = clearLiveKitEnv();
  });

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  it('case 8: unconfigured factory builds no token-minting service; configured factory uses only the configured values', () => {
    const fakeFastify = { log: { info: () => {} } } as unknown as FastifyInstance;

    const unconfigured = createVoiceBotServices(fakeFastify);
    expect(unconfigured.liveKitConfigured).toBe(false);
    expect(unconfigured.ringGenerator).toBeNull();
    expect(unconfigured.callService).toBeNull();
    expect(unconfigured.voiceBot).toBeDefined();
    expect(livekit.roomServiceClientArgs).toEqual([]);
    expect(capturedArgsContain('devkey')).toBe(false);
    expect(capturedArgsContain('devsecret')).toBe(false);

    setLiveKitTestEnv();
    const configured = createVoiceBotServices(fakeFastify);
    expect(configured.liveKitConfigured).toBe(true);
    expect(configured.ringGenerator).not.toBeNull();
    expect(configured.callService).not.toBeNull();
    expect(capturedArgsContain('test-livekit-key')).toBe(true);
    expect(capturedArgsContain('test-livekit-secret')).toBe(true);
    expect(capturedArgsContain('devkey')).toBe(false);
    expect(capturedArgsContain('devsecret')).toBe(false);
  });
});

describe('QC-F-076 voice-bot routes — LiveKit not configured', () => {
  let app: FastifyInstance;
  let savedEnv: Record<string, string | undefined>;
  let savedVoiceBotSecret: string | undefined;
  let savedNodeEnv: string | undefined;

  beforeEach(async () => {
    savedEnv = clearLiveKitEnv();
    savedVoiceBotSecret = process.env['VOICE_BOT_SECRET'];
    savedNodeEnv = process.env['NODE_ENV'];
    // HMAC secret resolvable via VOICE_BOT_SECRET so the request passes the
    // HMAC gate and reaches the LiveKit gate (brief §8 case 6 setup).
    process.env['VOICE_BOT_SECRET'] = 'test-internal-secret';
    process.env['NODE_ENV'] = 'test';
    app = await buildVoiceBotApp();
  });

  afterEach(async () => {
    await app.close();
    restoreEnv(savedEnv);
    if (savedVoiceBotSecret === undefined) delete process.env['VOICE_BOT_SECRET'];
    else process.env['VOICE_BOT_SECRET'] = savedVoiceBotSecret;
    if (savedNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = savedNodeEnv;
  });

  it('case 6: POST /alert with a valid HMAC signature fails closed 503 VOICE_BOT_UNAVAILABLE and rings nothing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/voice-bot/alert',
      headers: { 'x-quant-signature': signAlert('test-internal-secret') },
      payload: ALERT_PAYLOAD,
    });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VOICE_BOT_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('ringing');
    expect(livekit.accessTokenArgs).toEqual([]);
  });

  it('case 9: POST /calls/:callId/answer fails closed 503, not a misleading 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/voice-bot/calls/call_missing/answer',
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { error: { code: string } }).error.code).toBe('VOICE_BOT_UNAVAILABLE');
  });
});

describe('QC-F-076 voice-bot routes — LiveKit configured', () => {
  let app: FastifyInstance;
  let savedEnv: Record<string, string | undefined>;
  let savedVoiceBotSecret: string | undefined;

  beforeEach(async () => {
    savedEnv = clearLiveKitEnv();
    setLiveKitTestEnv();
    savedVoiceBotSecret = process.env['VOICE_BOT_SECRET'];
    process.env['VOICE_BOT_SECRET'] = 'test-internal-secret';
    app = await buildVoiceBotApp();
  });

  afterEach(async () => {
    await app.close();
    restoreEnv(savedEnv);
    if (savedVoiceBotSecret === undefined) delete process.env['VOICE_BOT_SECRET'];
    else process.env['VOICE_BOT_SECRET'] = savedVoiceBotSecret;
  });

  it('case 7: POST /alert happy path still rings, minting only with configured values', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/voice-bot/alert',
      headers: { 'x-quant-signature': signAlert('test-internal-secret') },
      payload: ALERT_PAYLOAD,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { success: boolean; data: { state: string; callId: string } };
    expect(body.success).toBe(true);
    expect(body.data.state).toBe('ringing');
    expect(body.data.callId).toBeTruthy();
    expect(capturedArgsContain('devkey')).toBe(false);
    expect(capturedArgsContain('devsecret')).toBe(false);
  });

  it('case 9 (configured half): answering an unknown call is still 404 CALL_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/voice-bot/calls/call_missing/answer',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe('CALL_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// VoiceBotAgentService unit behaviour
// ---------------------------------------------------------------------------

describe('QC-F-076 VoiceBotAgentService', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = clearLiveKitEnv();
  });

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  it('case 10+12: no config and no env — generateBotToken rejects 503 and no room client is ever built', async () => {
    const service = new VoiceBotAgentService({});
    expect(livekit.roomServiceClientArgs).toEqual([]);
    await expect(service.generateBotToken('room-1')).rejects.toMatchObject({
      statusCode: 503,
      code: 'VOICE_BOT_UNAVAILABLE',
    });

    process.env['LIVEKIT_API_KEY'] = '';
    process.env['LIVEKIT_API_SECRET'] = '';
    const emptyEnvService = new VoiceBotAgentService({});
    await expect(emptyEnvService.generateBotToken('room-1')).rejects.toMatchObject({
      statusCode: 503,
      code: 'VOICE_BOT_UNAVAILABLE',
    });
    expect(livekit.roomServiceClientArgs).toEqual([]);
  });

  it('case 11: non-LiveKit work stays alive unconfigured, and explicit config still mints', async () => {
    const ttsProvider = {
      providerName: 'test-tts',
      synthesize: async () => ({
        audioBuffer: Buffer.from('audio'),
        durationMs: 10,
        format: 'wav' as const,
        sampleRate: 16000,
      }),
    };
    const sttProvider = {
      providerName: 'test-stt',
      transcribe: async () => ({ text: 'hello', confidence: 0.99 }),
    };

    const unconfigured = new VoiceBotAgentService({ ttsProvider, sttProvider });
    const session = unconfigured.createSession('room-1', 'user-1');
    expect(session.status).toBe('active');
    const spoken = await unconfigured.speak(session.sessionId, 'Namaste');
    expect(spoken.turn.text).toBe('Namaste');

    const configured = new VoiceBotAgentService({
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      wsUrl: 'ws://livekit.test:7880',
    });
    await expect(configured.generateBotToken('room-1')).resolves.toBe('mock.jwt.token');
    const lastTokenArgs = livekit.accessTokenArgs[livekit.accessTokenArgs.length - 1];
    expect(lastTokenArgs?.[0]).toBe('test-key');
    expect(lastTokenArgs?.[1]).toBe('test-secret');
  });
});

// ---------------------------------------------------------------------------
// Static pin (brief §8 case 13)
// ---------------------------------------------------------------------------

describe('QC-F-076 static pin — no fallback strings in production sources', () => {
  const readSource = (relative: string) =>
    readFileSync(new URL(relative, import.meta.url), 'utf8');
  const count = (source: string, needle: string) => source.split(needle).length - 1;

  it('case 13: meetings.ts and voice-bot-agent.service.ts contain no dev fallback strings; voice-bot.ts keeps exactly the one gated HMAC occurrence', () => {
    const meetings = readSource('../routes/meetings.ts');
    const service = readSource('../services/voice-bot-agent.service.ts');
    const voiceBot = readSource('../routes/voice-bot.ts');

    expect(count(meetings, 'devsecret')).toBe(0);
    expect(count(meetings, 'devkey')).toBe(0);
    expect(count(service, 'devsecret')).toBe(0);
    expect(count(service, 'devkey')).toBe(0);

    expect(count(voiceBot, 'devkey')).toBe(0);
    expect(count(voiceBot, 'devsecret')).toBe(1);
    // …and that single occurrence is the NODE_ENV-gated HMAC ternary
    // (test/development only), not a LiveKit credential fallback.
    expect(voiceBot).toContain(
      "process.env['NODE_ENV'] === 'test' || process.env['NODE_ENV'] === 'development'",
    );
  });
});
