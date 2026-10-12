// ===========================================================================
// QC-F-018 — identity forgery regression tests (audio-rooms / polls / receipts)
// ===========================================================================
//
// The three route modules previously resolved the acting user as
//   body.<id field> || (request as any).user?.id || <fabricated fallback>
// `request.user` is never populated by any auth code in this codebase (the
// server-core auth plugin sets `request.auth` from the verified JWT), and the
// client-supplied body/query field took precedence anyway — so any caller
// could act as ANY user: create/join/leave audio rooms, promote/mute,
// create polls, cast votes, and forge delivered/read receipts in someone
// else's name. Unauthenticated-in-route calls were attributed to fabricated
// identities ('user_host_1', 'unknown', `user_${Date.now()}`).
//
// These tests mount the REAL route plugins on a bare Fastify instance. A
// preHandler hook installs `request.auth` exactly the way the real auth
// plugin does (see packages/server-core/src/plugins/auth.ts and the
// voice-bot.routes.test.ts precedent); a minimal error handler mirrors the
// server-core error-handler's AppError mapping so thrown 401s surface as
// HTTP 401, as they do under buildApp(). The services are the real ones;
// only Prisma is a fake delegate (same shape as whoxa-receipts-and-polls).
//
// Every forgery test FAILS against the pre-fix routes (verified by negative
// control) and passes with the fix.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import audioRoomsRoutes from '../routes/audio-rooms';
import pollsRoutes from '../routes/polls';
import receiptsRoutes from '../routes/receipts';
import { AudioRoomService } from '../services/audio-room.service';

const ALICE = { userId: 'user_alice', username: 'alice' };
const BOB = { userId: 'user_bob', username: 'bob' };
// QC-F-042 amend (gap 1): the receipts scenarios presuppose real messages
// sent by SENDER in a conversation SENDER and ALICE both belong to —
// ALICE is the recipient who records receipts; SENDER is the only user
// authorized to query their status.
const SENDER = { userId: 'user_sender', username: 'sender' };

interface ReceiptRow {
  messageId: string;
  userId: string;
  deliveredAt: Date | null;
  readAt: Date | null;
}

/** In-memory MessageDelivery delegate (same fake shape as the whoxa suite). */
function makeFakePrisma() {
  const rows = new Map<string, ReceiptRow>();
  const key = (messageId: string, userId: string) => `${messageId}::${userId}`;
  const prisma = {
    messageDelivery: {
      async findUnique({ where }: any) {
        return rows.get(key(where.messageId_userId.messageId, where.messageId_userId.userId)) ?? null;
      },
      async upsert({ where, create, update }: any) {
        const k = key(where.messageId_userId.messageId, where.messageId_userId.userId);
        const existing = rows.get(k);
        const row: ReceiptRow = existing
          ? { ...existing, ...update }
          : {
              messageId: create.messageId,
              userId: create.userId,
              deliveredAt: create.deliveredAt ?? null,
              readAt: create.readAt ?? null,
            };
        rows.set(k, row);
        return row;
      },
      async findMany({ where }: any) {
        return [...rows.values()].filter((r) => r.messageId === where.messageId);
      },
    },
    // QC-F-042 amend (gap 1): ReceiptService proves object authorization
    // (message exists + active membership + recipient/sender roles), so
    // the messages under test are modelled: msg_1/msg_2/msg_3 were sent by
    // SENDER in 'conv_f018', whose active members are SENDER and ALICE.
    // conversationIdForMessage resolves from the same rows.
    message: {
      async findUnique({ where }: any) {
        return ['msg_1', 'msg_2', 'msg_3'].includes(where.id)
          ? { conversationId: 'conv_f018', senderId: SENDER.userId }
          : null;
      },
    },
    conversationMember: {
      async findFirst({ where }: any) {
        return where.conversationId === 'conv_f018' &&
          (where.userId === SENDER.userId || where.userId === ALICE.userId)
          ? { conversationId: where.conversationId, userId: where.userId, leftAt: null }
          : null;
      },
    },
  };
  return { prisma, rows };
}

async function buildRouteApp(
  auth: { userId: string; username: string } | null,
  prisma?: unknown,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Mirror of server-core error-handler's AppError branch: an error carrying
  // a numeric statusCode is rendered with that status.
  app.setErrorHandler((err, _request, reply) => {
    const e = err as Error & { statusCode?: number; code?: string };
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  if (prisma !== undefined) {
    (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate('prisma', prisma);
  }
  if (auth) {
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = {
        userId: auth.userId,
        username: auth.username,
        email: '',
        role: 'user',
        scopes: [],
        sessionId: 'sess_test',
        app: 'quantchat',
        tokenId: 'tok_test',
      };
    });
  }
  await app.register(audioRoomsRoutes, { prefix: '/audio-rooms' });
  await app.register(pollsRoutes, { prefix: '/polls' });
  await app.register(receiptsRoutes, { prefix: '/receipts' });
  await app.ready();
  return app;
}

describe('QC-F-018 audio-rooms identity', () => {
  let apps: FastifyInstance[] = [];

  beforeEach(() => {
    AudioRoomService.clearAllRoomsForTesting();
    apps = [];
  });

  afterEach(async () => {
    for (const app of apps) await app.close();
  });

  async function appFor(auth: typeof ALICE | null) {
    const app = await buildRouteApp(auth);
    apps.push(app);
    return app;
  }

  it('creates a room owned by the authenticated user, ignoring body hostId/hostProfile', async () => {
    const alice = await appFor(ALICE);
    const res = await alice.inject({
      method: 'POST',
      url: '/audio-rooms',
      payload: {
        title: 'Alice Room',
        hostId: 'user_victim',
        hostProfile: { username: 'victim', displayName: 'Victim Name' },
      },
    });
    expect(res.statusCode).toBe(201);
    const room = res.json().data;
    expect(room.hostId).toBe('user_alice');
    expect(room.participants).toHaveLength(1);
    expect(room.participants[0].userId).toBe('user_alice');
    expect(room.participants[0].username).toBe('alice');
    expect(room.participants[0].displayName).toBe('alice');
  });

  it('joins as the authenticated user, ignoring a forged body user object', async () => {
    const alice = await appFor(ALICE);
    const created = await alice.inject({
      method: 'POST',
      url: '/audio-rooms',
      payload: { title: 'Join Target' },
    });
    const roomId = created.json().data.id as string;

    const bob = await appFor(BOB);
    const res = await bob.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/join`,
      payload: {
        user: { userId: 'user_victim', username: 'victim', displayName: 'Victim Name' },
        role: 'listener',
      },
    });
    expect(res.statusCode).toBe(200);
    const participant = res.json().data.participant;
    expect(participant.userId).toBe('user_bob');
    expect(participant.username).toBe('bob');
    const room = AudioRoomService.getAudioRoom(roomId);
    expect(room?.participants.map((p) => p.userId)).toEqual(['user_alice', 'user_bob']);
  });

  it('non-host cannot promote by forging body actorId as the host', async () => {
    const alice = await appFor(ALICE);
    const created = await alice.inject({
      method: 'POST',
      url: '/audio-rooms',
      payload: { title: 'Promote Target' },
    });
    const roomId = created.json().data.id as string;

    const bob = await appFor(BOB);
    await bob.inject({ method: 'POST', url: `/audio-rooms/${roomId}/join`, payload: {} });

    const res = await bob.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/promote`,
      payload: { actorId: 'user_alice', targetUserId: 'user_bob' },
    });
    expect(res.statusCode).toBe(403);
    const room = AudioRoomService.getAudioRoom(roomId);
    expect(room?.participants.find((p) => p.userId === 'user_bob')?.role).toBe('listener');
  });

  it('leave removes only the authenticated user, ignoring body userId', async () => {
    const alice = await appFor(ALICE);
    const created = await alice.inject({
      method: 'POST',
      url: '/audio-rooms',
      payload: { title: 'Leave Target' },
    });
    const roomId = created.json().data.id as string;

    const bob = await appFor(BOB);
    await bob.inject({ method: 'POST', url: `/audio-rooms/${roomId}/join`, payload: {} });

    // Bob tries to kick Alice (the host) out by naming her in the body.
    const res = await bob.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/leave`,
      payload: { userId: 'user_alice' },
    });
    expect(res.statusCode).toBe(200);
    const room = AudioRoomService.getAudioRoom(roomId);
    expect(room?.participants.map((p) => p.userId)).toEqual(['user_alice']);
  });

  it('rejects unauthenticated create/join/leave with 401 and no side effects', async () => {
    const alice = await appFor(ALICE);
    const created = await alice.inject({
      method: 'POST',
      url: '/audio-rooms',
      payload: { title: 'Guarded Room' },
    });
    const roomId = created.json().data.id as string;

    const anon = await appFor(null);
    const createRes = await anon.inject({
      method: 'POST',
      url: '/audio-rooms',
      payload: { title: 'Anon Room', hostId: 'user_victim' },
    });
    expect(createRes.statusCode).toBe(401);

    const joinRes = await anon.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/join`,
      payload: { user: { userId: 'user_victim', username: 'v', displayName: 'V' } },
    });
    expect(joinRes.statusCode).toBe(401);

    const leaveRes = await anon.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/leave`,
      payload: { userId: 'user_alice' },
    });
    expect(leaveRes.statusCode).toBe(401);

    expect(AudioRoomService.listActiveRooms()).toHaveLength(1);
    expect(AudioRoomService.getAudioRoom(roomId)?.participants).toHaveLength(1);
  });
});

describe('QC-F-018 polls identity', () => {
  let apps: FastifyInstance[] = [];

  afterEach(async () => {
    for (const app of apps) await app.close();
    apps = [];
  });

  async function appFor(auth: typeof ALICE | null) {
    const { prisma } = makeFakePrisma();
    const app = await buildRouteApp(auth, prisma);
    apps.push(app);
    return app;
  }

  it('creates a poll owned by the authenticated user, ignoring body creatorId', async () => {
    const alice = await appFor(ALICE);
    const res = await alice.inject({
      method: 'POST',
      url: '/polls',
      payload: {
        chatId: 'chat_1',
        creatorId: 'user_victim',
        question: 'Best stack?',
        options: ['TypeScript', 'Go'],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.creatorId).toBe('user_alice');
  });

  it('records a vote for the authenticated user, ignoring body userId', async () => {
    const alice = await appFor(ALICE);
    const created = await alice.inject({
      method: 'POST',
      url: '/polls',
      payload: { chatId: 'chat_1', question: 'Ship it?', options: ['Yes', 'No'] },
    });
    const pollId = created.json().data.id as string;

    const bob = await appFor(BOB);
    const voteRes = await bob.inject({
      method: 'POST',
      url: `/polls/${pollId}/vote`,
      payload: { userId: 'user_victim', optionIndex: 0 },
    });
    expect(voteRes.statusCode).toBe(200);

    const resultsRes = await bob.inject({ method: 'GET', url: `/polls/${pollId}/results` });
    expect(resultsRes.statusCode).toBe(200);
    const results = resultsRes.json().data;
    expect(results.totalVotes).toBe(1);
    expect(results.options[0].voters).toEqual(['user_bob']);
  });

  it('rejects unauthenticated create/vote with 401', async () => {
    const anon = await appFor(null);
    const createRes = await anon.inject({
      method: 'POST',
      url: '/polls',
      payload: {
        chatId: 'chat_1',
        creatorId: 'user_victim',
        question: 'Anon poll?',
        options: ['A', 'B'],
      },
    });
    expect(createRes.statusCode).toBe(401);

    const voteRes = await anon.inject({
      method: 'POST',
      url: '/polls/poll_anything/vote',
      payload: { userId: 'user_victim', optionIndex: 0 },
    });
    expect(voteRes.statusCode).toBe(401);
  });
});

describe('QC-F-018 receipts identity', () => {
  let apps: FastifyInstance[] = [];

  afterEach(async () => {
    for (const app of apps) await app.close();
    apps = [];
  });

  async function appFor(auth: typeof ALICE | null, prisma: unknown) {
    const app = await buildRouteApp(auth, prisma);
    apps.push(app);
    return app;
  }

  it('marks delivered for the authenticated user, ignoring body recipientId', async () => {
    const { prisma, rows } = makeFakePrisma();
    const alice = await appFor(ALICE, prisma);
    const res = await alice.inject({
      method: 'POST',
      url: '/receipts/msg_1/delivered',
      payload: { recipientId: 'user_victim' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('delivered');
    expect(rows.has('msg_1::user_alice')).toBe(true);
    expect(rows.has('msg_1::user_victim')).toBe(false);
  });

  it('marks read for the authenticated user, ignoring body recipientId', async () => {
    const { prisma, rows } = makeFakePrisma();
    const alice = await appFor(ALICE, prisma);
    const res = await alice.inject({
      method: 'POST',
      url: '/receipts/msg_2/read',
      payload: { recipientId: 'user_victim' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('read');
    expect(rows.get('msg_2::user_alice')?.readAt).toBeInstanceOf(Date);
    expect(rows.has('msg_2::user_victim')).toBe(false);

    // QC-F-042 amend (gap 1): receipt status is sender-only, so the status
    // query is made by the message's SENDER (same store). The F-018 point
    // is unchanged: the forged `?senderId=user_victim` is ignored and the
    // JWT identity (user_sender) is what authorizes and shapes the answer.
    const sender = await appFor(SENDER, prisma);
    const statusRes = await sender.inject({
      method: 'GET',
      url: '/receipts/msg_2/status?senderId=user_victim',
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().data.status).toBe('read');
    expect(statusRes.json().data.receipts.map((r: any) => r.userId)).toEqual(['user_alice']);
  });

  it('rejects unauthenticated delivered/read with 401 and writes no receipt', async () => {
    const { prisma, rows } = makeFakePrisma();
    const anon = await appFor(null, prisma);

    const deliveredRes = await anon.inject({
      method: 'POST',
      url: '/receipts/msg_3/delivered',
      payload: { recipientId: 'user_victim' },
    });
    expect(deliveredRes.statusCode).toBe(401);

    const readRes = await anon.inject({
      method: 'POST',
      url: '/receipts/msg_3/read',
      payload: { recipientId: 'user_victim' },
    });
    expect(readRes.statusCode).toBe(401);

    expect(rows.size).toBe(0);
  });
});
