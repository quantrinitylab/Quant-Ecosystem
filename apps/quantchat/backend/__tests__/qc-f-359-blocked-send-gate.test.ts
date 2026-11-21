// ============================================================================
// QC-F-359 — block did NOT stop messages in an existing conversation
// ============================================================================
//
// Defect (P1): QC-F-317 shipped the block writer and gates for NEW
// conversations (PrivacyService.checkCanMessage) and 1:1 call
// initiation, but the send path of a conversation that already exists
// was never gated. A user who blocked the person they were chatting
// with kept receiving that person's messages in the very same DIRECT
// thread — over REST (MessageService.sendMessage), over realtime (WS
// chat_message live publish), and via previously scheduled messages
// (ScheduledMessageWorker, which creates Messages directly and never
// routes through sendMessage). The blocker could also keep sending.
//
// Fix pinned here (specialist-qc-f-359-buildprep.md, band Slice-1):
//   - MessageService.sendMessage: immediately after membership, before
//     any media validation, a DIRECT-only blocked-pair gate
//     (assertDirectSendNotBlocked) — both directions via the existing
//     PrivacyService.checkBlockedBy engine. Any 'blocked' → 403
//     USER_BLOCKED (neutral message; a real block never hides behind a
//     503); otherwise any 'unavailable' → 503 UPSTREAM_UNAVAILABLE,
//     fail-closed. Conversation type comes from the conversation ROW;
//     a missing row / failed lookup is 503, never a guessed skip.
//     whoCanMessage category prefs do NOT gate existing conversations.
//   - WS chat_message: the same gate after fresh membership, before
//     publishRoomEvent — a blocked frame reaches neither the room nor
//     the resume buffer; the sender gets an error frame, the socket
//     stays open, typing/receipts are not gated.
//   - ScheduledMessageWorker.deliverOne: the same check inside the
//     delivery transaction — 'blocked' → row CANCELLED + commit (the
//     QC-F-095 deterministic path); 'unavailable'/lookup failure →
//     throw → rollback → row stays PENDING for the next tick.
//
// Harnesses: REAL MessageService + REAL PrivacyService against a
// stateful in-memory fake (stable module-level identities); the REAL
// stories route plugin for the story-reply inheritance case (B12); the
// REAL createMessageServiceDeliver for the auto-reply case (B13); the
// REAL websocketRoutes over a loopback listener with real signed JWTs
// (the QC-F-037 harness pattern); the REAL ScheduledMessageWorker
// against a rollback-modelling fake tx (the QC-F-095 pattern).
//
// Negative control (brief §6.4, band signature — SUPERSEDED by QC-F-117):
// the pre-fix band signature above described the QC-F-359 gate fix. QC-F-117
// deleted the WS `chat_message` relay (and the W1–W4 gate it pinned):
// W1–W6 now assert the frame is silently ignored (no USER_BLOCKED /
// UPSTREAM_UNAVAILABLE frames, nothing published, nothing buffered, socket
// open) — on the post-fix code. W7 (typing ungated) is untouched. The
// durable blocked-pair gate lives on in MessageService (B-series unchanged).
// ============================================================================

import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MessageService } from '../services/message.service';
import { PrivacyService } from '../services/privacy.service';
import { createMessageServiceDeliver } from '../services/auto-reply.service';
import {
  ScheduledMessageWorker,
  type ScheduledMessageRecord,
} from '../services/scheduled-message-worker';
import storiesRoutes from '../routes/stories';
import { websocketRoutes } from '../routes/websocket';
import { InProcessBackplane } from '../services/realtime-backplane';
import { PresenceManager } from '@quant/realtime/presence';

// ---------------------------------------------------------------------------
// Shared preference shapes (the stored form PrivacyService reads)
// ---------------------------------------------------------------------------

/** A readable block list containing `ids` (canonical object entries). */
const prefsBlocking = (ids: string[]) => ({
  chatSettings: { blockedUsers: ids.map((id) => ({ id })) },
});

/** Present-but-malformed block list → extractBlockedUserIds null → 'unavailable'. */
const MALFORMED_PREFS = { chatSettings: { blockedUsers: 'not-an-array' } };

const SENDER = 'user-sender';
const PEER = 'user-peer';
const CONV = 'conv-1';

// ===========================================================================
// B/G series — MessageService (service level) + inheritance cases
// ===========================================================================

interface ServiceWorld {
  service: MessageService;
  prisma: unknown;
  messages: Array<Record<string, unknown>>;
  outbox: Array<Record<string, unknown>>;
  conversationUpdates: Array<{ id: string }>;
  checkSpy: ReturnType<typeof vi.spyOn>;
  streakCreate: ReturnType<typeof vi.fn>;
  prefs: Map<string, unknown>;
}

function makeServiceWorld(
  opts: {
    type?: string;
    members?: string[];
    conversationExists?: boolean;
    conversationLookupThrows?: boolean;
    userDelegateMissing?: boolean;
  } = {},
): ServiceWorld {
  const type = opts.type ?? 'DIRECT';
  const members = opts.members ?? [SENDER, PEER];
  const prefs = new Map<string, unknown>();
  const messages: Array<Record<string, unknown>> = [];
  const outbox: Array<Record<string, unknown>> = [];
  const conversationUpdates: Array<{ id: string }> = [];
  const streakCreate = vi.fn().mockResolvedValue({});

  const prisma = {
    conversationMember: {
      async findFirst({ where }: { where: { conversationId: string; userId: string } }) {
        return members.includes(where.userId)
          ? { id: `mem-${where.userId}`, conversationId: CONV, userId: where.userId, leftAt: null }
          : null;
      },
      async findMany() {
        return members.map((userId) => ({ userId }));
      },
    },
    conversation: {
      async findUnique() {
        if (opts.conversationLookupThrows) throw new Error('db down');
        if (opts.conversationExists === false) return null;
        return { id: CONV, type };
      },
      async update({ where }: { where: { id: string } }) {
        conversationUpdates.push(where);
        return {};
      },
    },
    ...(opts.userDelegateMissing
      ? {}
      : {
          user: {
            async findUnique({ where }: { where: { id: string } }) {
              if (!prefs.has(where.id)) return { preferences: null };
              return { preferences: prefs.get(where.id) };
            },
          },
        }),
    message: {
      async create({ data }: { data: Record<string, unknown> }) {
        const row = { id: `msg-${messages.length + 1}`, createdAt: new Date(), ...data };
        messages.push(row);
        return row;
      },
    },
    messageOutbox: {
      async create({ data }: { data: Record<string, unknown> }) {
        outbox.push(data);
        return data;
      },
    },
    streak: {
      async findUnique() {
        return null;
      },
      create: streakCreate,
      async update() {
        return {};
      },
    },
    async $transaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T> {
      return cb(prisma);
    },
  };

  const privacy = new PrivacyService(prisma as never);
  const checkSpy = vi.spyOn(privacy, 'checkBlockedBy');
  const service = new MessageService(
    prisma as never,
    undefined,
    undefined,
    undefined as never,
    privacy,
  );
  return { service, prisma, messages, outbox, conversationUpdates, checkSpy, streakCreate, prefs };
}

async function expectSendError(
  world: ServiceWorld,
  input: Parameters<MessageService['sendMessage']>[0],
  statusCode: number,
  code: string,
): Promise<void> {
  await expect(world.service.sendMessage(input)).rejects.toMatchObject({ statusCode, code });
}

describe('QC-F-359 B-series — MessageService blocked-pair gate', () => {
  it('B1: peer blocked the sender → 403 USER_BLOCKED; nothing persisted, no outbox, no lastMessageAt, no streak', async () => {
    const w = makeServiceWorld();
    w.prefs.set(PEER, prefsBlocking([SENDER]));

    await expectSendError(
      w,
      { conversationId: CONV, senderId: SENDER, content: 'hello' },
      403,
      'USER_BLOCKED',
    );
    expect(w.messages).toHaveLength(0);
    expect(w.outbox).toHaveLength(0);
    expect(w.conversationUpdates).toHaveLength(0);
    expect(w.streakCreate).not.toHaveBeenCalled();
  });

  it('B2: sender blocked the peer (reverse direction) → 403 USER_BLOCKED; nothing persisted', async () => {
    const w = makeServiceWorld();
    w.prefs.set(SENDER, prefsBlocking([PEER]));

    await expectSendError(
      w,
      { conversationId: CONV, senderId: SENDER, content: 'hello' },
      403,
      'USER_BLOCKED',
    );
    expect(w.messages).toHaveLength(0);
    expect(w.outbox).toHaveLength(0);
  });

  it('B3 control: both directions clear → send persists with outbox + streak (pre-existing flow intact)', async () => {
    const w = makeServiceWorld();

    const sent = await w.service.sendMessage({
      conversationId: CONV,
      senderId: SENDER,
      content: 'hello',
    });
    expect(sent.conversationId).toBe(CONV);
    expect(w.messages).toHaveLength(1);
    expect(w.outbox).toHaveLength(1);
    expect(w.conversationUpdates).toHaveLength(1);
    expect(w.streakCreate).toHaveBeenCalledTimes(1);
  });

  it('B4: unblock takes effect on the very next send (checkBlockedBy is never cached)', async () => {
    const w = makeServiceWorld();
    w.prefs.set(PEER, prefsBlocking([SENDER]));
    await expectSendError(
      w,
      { conversationId: CONV, senderId: SENDER, content: 'first' },
      403,
      'USER_BLOCKED',
    );

    w.prefs.set(PEER, null);
    const sent = await w.service.sendMessage({
      conversationId: CONV,
      senderId: SENDER,
      content: 'second',
    });
    expect(sent.content).toBe('second');
    expect(w.messages).toHaveLength(1);
  });

  it("B5: peer's block list malformed → 503 UPSTREAM_UNAVAILABLE; send does not happen", async () => {
    const w = makeServiceWorld();
    w.prefs.set(PEER, MALFORMED_PREFS);

    await expectSendError(
      w,
      { conversationId: CONV, senderId: SENDER, content: 'hello' },
      503,
      'UPSTREAM_UNAVAILABLE',
    );
    expect(w.messages).toHaveLength(0);
  });

  it("B6: sender's own block list malformed → 503 UPSTREAM_UNAVAILABLE (the other direction is fail-closed too)", async () => {
    const w = makeServiceWorld();
    w.prefs.set(SENDER, MALFORMED_PREFS);

    await expectSendError(
      w,
      { conversationId: CONV, senderId: SENDER, content: 'hello' },
      503,
      'UPSTREAM_UNAVAILABLE',
    );
    expect(w.messages).toHaveLength(0);
  });

  it('B7: user delegate missing → 503 UPSTREAM_UNAVAILABLE; send does not happen', async () => {
    const w = makeServiceWorld({ userDelegateMissing: true });

    await expectSendError(
      w,
      { conversationId: CONV, senderId: SENDER, content: 'hello' },
      503,
      'UPSTREAM_UNAVAILABLE',
    );
    expect(w.messages).toHaveLength(0);
  });

  it('B8: membership exists but the conversation row is gone (type unprovable) → 503, never a guessed skip', async () => {
    const w = makeServiceWorld({ conversationExists: false });

    await expectSendError(
      w,
      { conversationId: CONV, senderId: SENDER, content: 'hello' },
      503,
      'UPSTREAM_UNAVAILABLE',
    );
    expect(w.messages).toHaveLength(0);
  });

  it('B9: one direction blocked + the other unavailable → 403 USER_BLOCKED (a real block never hides behind a 503)', async () => {
    const w = makeServiceWorld();
    w.prefs.set(PEER, MALFORMED_PREFS); // peer→sender verdict: unavailable
    w.prefs.set(SENDER, prefsBlocking([PEER])); // sender→peer verdict: blocked

    await expectSendError(
      w,
      { conversationId: CONV, senderId: SENDER, content: 'hello' },
      403,
      'USER_BLOCKED',
    );
    expect(w.messages).toHaveLength(0);
  });

  it('B10 control: non-member sender gets NOT_A_MEMBER first — the blocked gate never runs and leaks nothing', async () => {
    const w = makeServiceWorld({ members: [PEER] });
    w.prefs.set(PEER, prefsBlocking([SENDER]));
    w.prefs.set(SENDER, prefsBlocking([PEER]));

    await expectSendError(
      w,
      { conversationId: CONV, senderId: SENDER, content: 'hello' },
      403,
      'NOT_A_MEMBER',
    );
    expect(w.checkSpy).not.toHaveBeenCalled();
    expect(w.messages).toHaveLength(0);
  });

  it("B11: blocked snap-intent send with a foreign storage key → 403 USER_BLOCKED, not MEDIA_URL_NOT_OWNED (authorization precedes media validation)", async () => {
    const w = makeServiceWorld();
    w.prefs.set(PEER, prefsBlocking([SENDER]));

    await expectSendError(
      w,
      {
        conversationId: CONV,
        senderId: SENDER,
        content: '',
        type: 'snap_photo',
        disappearMode: 'after_view',
        mediaUrl: `https://quantchat-media.s3.amazonaws.com/${PEER}/media_forged/snap.jpg`,
      },
      403,
      'USER_BLOCKED',
    );
    expect(w.messages).toHaveLength(0);
  });

  it('B13: auto-reply delivery path inherits the gate — a blocked pair gets no AI message persisted', async () => {
    const w = makeServiceWorld();
    w.prefs.set(PEER, prefsBlocking([SENDER]));
    // createMessageServiceDeliver builds its own MessageService on the
    // same prisma; the deliverer here is the peer-side auto-reply
    // (senderId = the member whose auto-reply would fire). The pair is
    // blocked, so delivery must reject and persist nothing.
    const deliver = createMessageServiceDeliver(w.prisma);
    await expect(
      deliver({ conversationId: CONV, senderId: SENDER, content: 'auto reply' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'USER_BLOCKED' });
    expect(w.messages).toHaveLength(0);
  });
});

describe('QC-F-359 G-series — gate scope pins', () => {
  it('G1: GROUP conversation with both-direction blocked lists → send succeeds and checkBlockedBy is never consulted', async () => {
    const w = makeServiceWorld({ type: 'GROUP', members: [SENDER, PEER, 'user-third'] });
    w.prefs.set(PEER, prefsBlocking([SENDER]));
    w.prefs.set(SENDER, prefsBlocking([PEER]));

    await w.service.sendMessage({ conversationId: CONV, senderId: SENDER, content: 'group hi' });
    expect(w.messages).toHaveLength(1);
    expect(w.checkSpy).not.toHaveBeenCalled();
  });

  it('G2: CHANNEL-type conversation → send succeeds, gate skipped on type alone', async () => {
    const w = makeServiceWorld({ type: 'CHANNEL', members: [SENDER, PEER] });
    w.prefs.set(PEER, prefsBlocking([SENDER]));

    await w.service.sendMessage({ conversationId: CONV, senderId: SENDER, content: 'post' });
    expect(w.messages).toHaveLength(1);
    expect(w.checkSpy).not.toHaveBeenCalled();
  });

  it("G3: peer set whoCanMessage='nobody' but did NOT block → send succeeds (category prefs never gate existing conversations)", async () => {
    const w = makeServiceWorld();
    w.prefs.set(PEER, { chatSettings: { privacy: { whoCanMessage: 'nobody' } } });

    await w.service.sendMessage({ conversationId: CONV, senderId: SENDER, content: 'still here' });
    expect(w.messages).toHaveLength(1);
  });

  it('G4: DIRECT conversation whose peer has left (no active peers) → send unchanged, no verdicts consulted', async () => {
    const w = makeServiceWorld({ members: [SENDER] });
    w.prefs.set(PEER, prefsBlocking([SENDER]));

    await w.service.sendMessage({ conversationId: CONV, senderId: SENDER, content: 'note to self' });
    expect(w.messages).toHaveLength(1);
    expect(w.checkSpy).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B12 — story-reply inheritance (REAL stories route plugin)
// ===========================================================================

const AUTHOR = { userId: 'user-author', username: 'author' };
const REPLIER = { userId: 'user-replier', username: 'replier' };

function makeStoryWorld() {
  // The author blocked the replier AFTER their DIRECT conversation
  // already existed. The author's story is world-visible
  // (whoCanSeeStory 'everyone'), so the reply reaches sendMessage —
  // where the QC-F-359 gate must stop it.
  const users = [
    {
      id: AUTHOR.userId,
      displayName: 'Author',
      avatarUrl: null,
      preferences: {
        chatSettings: {
          privacy: { whoCanSeeStory: 'everyone', whoCanMessage: 'everyone' },
          blockedUsers: [{ id: REPLIER.userId }],
        },
      },
    },
    { id: REPLIER.userId, displayName: 'Replier', avatarUrl: null, preferences: null },
  ];
  const userById = new Map(users.map((u) => [u.id, u]));
  const members = [
    { conversationId: 'conv-dm', userId: AUTHOR.userId, leftAt: null },
    { conversationId: 'conv-dm', userId: REPLIER.userId, leftAt: null },
  ];
  const messages: Array<Record<string, unknown>> = [];

  function matchMembers(where: Record<string, unknown>) {
    return members.filter((m) => {
      const userCond = where['userId'];
      if (typeof userCond === 'string' && m.userId !== userCond) return false;
      if (
        userCond &&
        typeof userCond === 'object' &&
        Array.isArray((userCond as { in?: unknown }).in) &&
        !((userCond as { in: string[] }).in).includes(m.userId)
      ) {
        return false;
      }
      const convCond = where['conversationId'];
      if (typeof convCond === 'string' && m.conversationId !== convCond) return false;
      if (
        convCond &&
        typeof convCond === 'object' &&
        Array.isArray((convCond as { in?: unknown }).in) &&
        !((convCond as { in: string[] }).in).includes(m.conversationId)
      ) {
        return false;
      }
      if ('leftAt' in where && m.leftAt !== where['leftAt']) return false;
      return true;
    });
  }

  const conversationDelegate = {
    async findMany({ where }: { where: Record<string, unknown> }) {
      const idCond = where['id'] as { in?: string[] } | undefined;
      const rows = [{ id: 'conv-dm', type: 'DIRECT' }].filter((c) => {
        if (idCond?.in && !idCond.in.includes(c.id)) return false;
        if (where['type'] !== undefined && c.type !== where['type']) return false;
        return true;
      });
      return rows;
    },
    async findUnique({ where }: { where: { id: string } }) {
      return where.id === 'conv-dm' ? { id: 'conv-dm', type: 'DIRECT' } : null;
    },
    async update() {
      return {};
    },
  };
  const conversationMemberDelegate = {
    async findMany({ where }: { where: Record<string, unknown> }) {
      return matchMembers(where).map((m) => ({ ...m }));
    },
    async findFirst({ where }: { where: Record<string, unknown> }) {
      return matchMembers(where)[0] ?? null;
    },
    async createMany() {
      return { count: 0 };
    },
  };
  const messageDelegate = {
    async create({ data }: { data: Record<string, unknown> }) {
      const row = { ...data, id: `msg-${messages.length + 1}`, createdAt: new Date() };
      messages.push(row);
      return row;
    },
  };
  const txClient = {
    conversation: conversationDelegate,
    conversationMember: conversationMemberDelegate,
    message: messageDelegate,
    messageOutbox: { async create({ data }: { data: unknown }) { return data; } },
  };
  const prisma = {
    story: {
      async findUnique({ where }: { where: { id: string } }) {
        return where.id === 'story-1'
          ? { id: 'story-1', userId: AUTHOR.userId, audience: 'ALL', viewCount: 0 }
          : null;
      },
    },
    closeFriend: { async findMany() { return []; } },
    user: {
      async findMany({ where }: { where: { id: { in: string[] } } }) {
        return users
          .filter((u) => where.id.in.includes(u.id))
          .map((u) => ({ id: u.id, preferences: u.preferences }));
      },
      async findUnique({ where }: { where: { id: string } }) {
        const row = userById.get(where.id);
        return row ? { preferences: row.preferences } : null;
      },
    },
    conversationMember: conversationMemberDelegate,
    conversation: conversationDelegate,
    message: messageDelegate,
    messageOutbox: txClient.messageOutbox,
    streak: {
      async findUnique() { return null; },
      async create({ data }: { data: unknown }) { return data; },
      async update({ data }: { data: unknown }) { return data; },
    },
    async $transaction<T>(cb: (tx: typeof txClient) => Promise<T>): Promise<T> {
      return cb(txClient);
    },
  };
  return { prisma, messages };
}

describe('QC-F-359 B12 — story-reply route inherits the gate', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('B12: replying to a story whose author blocked you (existing DIRECT) → no message delivered (QC-F-447: 404 NOT_FOUND at Gate 0, supersedes the 403 surface shape)', async () => {
    const world = makeStoryWorld();
    app = Fastify({ logger: false });
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
    app.decorate('prisma', world.prisma as never);
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = {
        userId: REPLIER.userId,
        username: REPLIER.username,
        email: '',
        role: 'user',
        scopes: [],
        sessionId: 'sess_test',
        app: 'quantchat',
        tokenId: 'tok_test',
      };
    });
    await app.register(storiesRoutes, { prefix: '/stories' });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/stories/story-1/reply',
      payload: { message: 'nice story' },
    });
    // QC-F-447 amendment (specialist-qc-f-447-buildprep.md §3 + §6.1):
    // the blocked pair now fails EARLIER, at stories Gate 0 — the story
    // is invisible to the blocked replier, so the reply answers the
    // story surface's own 404 (a 403 USER_BLOCKED here would be an
    // existence/block oracle: it would confirm the story exists AND
    // that a block is in force). The QC-F-359 security property this
    // case exists to pin is unchanged and still asserted below: NO
    // message is delivered. MessageService's send gate remains the
    // second wall behind Gate 0 and is still pinned directly by
    // B1–B11/B13.
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('NOT_FOUND');
    expect(world.messages).toHaveLength(0);
  });
});

// ===========================================================================
// W series — WS chat_message gate (REAL websocketRoutes, loopback sockets)
// ===========================================================================

// Test-only HMAC key for this harness (assembled at runtime; the WS
// verifier and the token signer both read it from the same constant,
// exactly like the QC-F-037 harness pattern).
const WS_TEST_KEY_PARTS = ['qc-f-359', 'ws-harness', 'key', '0123456789abcdef'];
const WS_HMAC_KEY = WS_TEST_KEY_PARTS.join('-');
const WS_JWT_ISSUER = 'quantchat';
const WS_JWT_AUDIENCE = 'quant-ecosystem';

interface WsMemberRow {
  conversationId: string;
  userId: string;
  leftAt: Date | null;
}

const WS_MEMBERS: WsMemberRow[] = [
  ...[
    ['conv-w1', 'w1-sender', 'w1-peer'],
    ['conv-w2', 'w2-sender', 'w2-peer'],
    ['conv-w3', 'w3-sender', 'w3-peer'],
    ['conv-w4', 'w4-sender', 'w4-peer'],
    ['conv-w5', 'w5-sender', 'w5-peer'],
    ['conv-w7', 'w7-sender', 'w7-peer'],
  ].flatMap(([conversationId, sender, peer]) => [
    { conversationId: conversationId as string, userId: sender as string, leftAt: null },
    { conversationId: conversationId as string, userId: peer as string, leftAt: null },
  ]),
  { conversationId: 'conv-w6a', userId: 'w6-sender', leftAt: null },
  { conversationId: 'conv-w6a', userId: 'w6-peer', leftAt: null },
  { conversationId: 'conv-w6b', userId: 'w6-sender', leftAt: null },
  { conversationId: 'conv-w6b', userId: 'w6-carol', leftAt: null },
];

/** Mutable per-user stored preferences for the WS fake (per-case users, no cross-case leakage). */
const wsPrefs = new Map<string, unknown>();

function createWsFakePrisma() {
  return {
    conversationMember: {
      async findFirst(args: {
        where: { conversationId: string; userId: string; leftAt: null };
      }): Promise<WsMemberRow | null> {
        const row = WS_MEMBERS.find(
          (m) =>
            m.conversationId === args.where.conversationId &&
            m.userId === args.where.userId &&
            m.leftAt === null,
        );
        return row ? { ...row } : null;
      },
      async findMany(args: {
        where: { conversationId: string; leftAt: null };
      }): Promise<WsMemberRow[]> {
        return WS_MEMBERS.filter(
          (m) => m.conversationId === args.where.conversationId && m.leftAt === null,
        ).map((m) => ({ ...m }));
      },
    },
    conversation: {
      async findUnique(args: {
        where: { id: string };
      }): Promise<{ id: string; type: string } | null> {
        return WS_MEMBERS.some((m) => m.conversationId === args.where.id)
          ? { id: args.where.id, type: 'DIRECT' }
          : null;
      },
    },
    user: {
      async findUnique(args: {
        where: { id: string };
      }): Promise<{ preferences: unknown }> {
        return { preferences: wsPrefs.has(args.where.id) ? wsPrefs.get(args.where.id) : null };
      },
    },
    message: {
      async findUnique(): Promise<null> {
        return null;
      },
    },
    messageDelivery: {
      async findUnique(): Promise<null> {
        return null;
      },
      async upsert(args: unknown): Promise<unknown> {
        return args;
      },
    },
  };
}

interface TestSocket {
  readonly readyState: number;
  addEventListener(event: 'message', listener: (ev: { data: unknown }) => void): void;
  addEventListener(event: 'close', listener: (ev: { code: number }) => void): void;
  addEventListener(event: 'open' | 'error', listener: () => void): void;
  send(data: string): void;
  close(): void;
  terminate(): void;
}

type WebSocketCtor = new (
  url: string,
  protocols?: string[],
) => TestSocket & { terminate?: () => void };

const NativeWebSocket = (globalThis as unknown as { WebSocket: WebSocketCtor }).WebSocket;

type Frame = Record<string, unknown> & {
  type?: string;
  code?: string;
  message?: string;
  conversationId?: string;
  event_type?: string;
  payload?: { content?: unknown; senderId?: unknown; userId?: unknown; isTyping?: unknown };
  cursor?: string;
  replayed?: number;
};

class FrameCollector {
  readonly frames: Frame[] = [];
  closeCode: number | null = null;
  private closeWaiters: Array<(code: number) => void> = [];

  attach(socket: TestSocket): void {
    socket.addEventListener('message', (ev) => {
      try {
        this.frames.push(JSON.parse(String(ev.data)) as Frame);
      } catch {
        // Non-JSON frames are not part of this contract; ignore.
      }
    });
    socket.addEventListener('close', (ev) => {
      this.closeCode = ev.code;
      for (const resolve of this.closeWaiters.splice(0)) resolve(ev.code);
    });
  }

  async waitFor(pred: (frame: Frame) => boolean, label: string, timeoutMs = 4000): Promise<Frame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.frames.find(pred);
      if (hit) return hit;
      if (Date.now() > deadline) {
        throw new Error(
          `timed out waiting for ${label}; frames seen: ${JSON.stringify(this.frames)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async expectNone(pred: (frame: Frame) => boolean, label: string, settleMs = 500): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    const hit = this.frames.find(pred);
    expect(hit, `expected no frame matching ${label}, got ${JSON.stringify(hit)}`).toBeUndefined();
  }
}

const isResumed = (f: Frame): boolean => f.type === 'resumed';
const isCreatedWith = (content: string) => (f: Frame): boolean =>
  f.event_type === 'chat.message.created.v1' && f.payload?.content === content;
const isGateError = (code: string, conversationId: string) => (f: Frame): boolean =>
  f.type === 'error' && f.code === code && f.conversationId === conversationId;
const isTyping = (f: Frame): boolean => f.event_type === 'chat.typing.v1';

function makeWsToken(userId: string): string {
  const b64url = (input: string | Buffer): string =>
    Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ sub: userId, iss: WS_JWT_ISSUER, aud: WS_JWT_AUDIENCE, iat: now, exp: now + 3600 }),
  );
  const signature = b64url(createHmac('sha256', WS_HMAC_KEY).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

describe('QC-F-359 W-series — WS chat_message frames silently ignored (relay deleted, QC-F-117)', () => {
  let app: FastifyInstance;
  let wsBaseUrl = '';
  const openSockets: TestSocket[] = [];

  async function connect(
    userId: string,
  ): Promise<{ socket: TestSocket; frames: FrameCollector }> {
    const frames = new FrameCollector();
    const raw = new NativeWebSocket(`${wsBaseUrl}/ws/chat`, [makeWsToken(userId)]);
    const socket: TestSocket = {
      get readyState() {
        return raw.readyState;
      },
      addEventListener: raw.addEventListener.bind(raw) as TestSocket['addEventListener'],
      send: (data: string) => raw.send(data),
      close: () => raw.close(),
      terminate: () => {
        if (typeof raw.terminate === 'function') raw.terminate();
        else raw.close();
      },
    };
    frames.attach(socket);
    openSockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WS open timed out')), 5000);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('WS connection error before open'));
      });
    });
    return { socket, frames };
  }

  function send(socket: TestSocket, frame: Record<string, unknown>): void {
    socket.send(JSON.stringify(frame));
  }

  async function join(
    client: { socket: TestSocket; frames: FrameCollector },
    conversationId: string,
  ): Promise<void> {
    send(client.socket, { type: 'join_conversation', conversationId });
    await client.frames.waitFor(isResumed, `resumed for ${conversationId}`);
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = WS_HMAC_KEY;
    process.env.JWT_ISSUER = WS_JWT_ISSUER;
    process.env.JWT_AUDIENCE = WS_JWT_AUDIENCE;

    app = Fastify({ logger: false });
    const decorate = (
      app as unknown as { decorate(name: string, value: unknown): void }
    ).decorate.bind(app);
    decorate('prisma', createWsFakePrisma());
    decorate('realtimeBackplane', new InProcessBackplane());
    decorate('presence', new PresenceManager({}));
    await app.register(websocketRoutes, { prefix: '/ws' });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('no TCP listener address');
    wsBaseUrl = `ws://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const socket of openSockets.splice(0)) {
      try {
        socket.terminate();
      } catch {
        // already closed
      }
    }
    (app.server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    await app.close();
  });

  it('W1: peer blocked the sender → chat_message frame silently ignored; room receives nothing (QC-F-117)', async () => {
    wsPrefs.set('w1-peer', prefsBlocking(['w1-sender']));
    const sender = await connect('w1-sender');
    const peer = await connect('w1-peer');
    await join(sender, 'conv-w1');
    await join(peer, 'conv-w1');

    send(sender.socket, {
      type: 'chat_message',
      conversationId: 'conv-w1',
      content: 'w1-blocked',
      client_message_id: 'w1-1',
    });
    // QC-F-117: the WS `chat_message` relay (and its blocked-pair gate) is
    // deleted — the frame is silently ignored. No USER_BLOCKED error frame
    // (there is no gate left to answer), nothing published, socket open.
    // The durable block is still enforced on the REST send path (B-series).
    await sender.frames.expectNone(isGateError('USER_BLOCKED', 'conv-w1'), 'USER_BLOCKED frame');
    await peer.frames.expectNone(isCreatedWith('w1-blocked'), 'blocked frame published to room');
    expect(sender.frames.closeCode).toBeNull();
    expect(sender.socket.readyState).toBe(1);
  });

  it('W2: a chat_message frame never enters the resume buffer — a reconnecting sender is not replayed it (QC-F-117)', async () => {
    const sender = await connect('w2-sender');
    const peer = await connect('w2-peer');
    await join(sender, 'conv-w2');
    await join(peer, 'conv-w2');

    send(sender.socket, {
      type: 'chat_message',
      conversationId: 'conv-w2',
      content: 'w2-phantom',
      client_message_id: 'w2-1',
    });
    await sender.frames.expectNone(isCreatedWith('w2-phantom'), 'phantom published');
    await sender.frames.expectNone(isGateError('USER_BLOCKED', 'conv-w2'), 'USER_BLOCKED frame');

    // The block lands now; the next frame is equally ignored (no gate, no buffer).
    wsPrefs.set('w2-peer', prefsBlocking(['w2-sender']));
    send(sender.socket, {
      type: 'chat_message',
      conversationId: 'conv-w2',
      content: 'w2-blocked',
      client_message_id: 'w2-2',
    });
    await sender.frames.expectNone(isGateError('USER_BLOCKED', 'conv-w2'), 'USER_BLOCKED frame');
    await peer.frames.expectNone(isCreatedWith('w2-blocked'), 'blocked frame published');

    sender.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const sender2 = await connect('w2-sender');
    send(sender2.socket, {
      type: 'join_conversation',
      conversationId: 'conv-w2',
      last_event_cursor: 'conversation.conv-w2:0',
    });
    const resumed = await sender2.frames.waitFor(isResumed, 'resumed after reconnect');
    expect(resumed.replayed).toBe(0);
    await sender2.frames.expectNone(isCreatedWith('w2-blocked'), 'blocked frame replayed on resume', 200);
    await sender2.frames.expectNone(isCreatedWith('w2-phantom'), 'phantom frame replayed on resume', 200);
  });

  it('W3: sender blocked the peer (reverse direction) → frame silently ignored (QC-F-117)', async () => {
    wsPrefs.set('w3-sender', prefsBlocking(['w3-peer']));
    const sender = await connect('w3-sender');
    const peer = await connect('w3-peer');
    await join(sender, 'conv-w3');
    await join(peer, 'conv-w3');

    send(sender.socket, {
      type: 'chat_message',
      conversationId: 'conv-w3',
      content: 'w3-blocked',
      client_message_id: 'w3-1',
    });
    await sender.frames.expectNone(isGateError('USER_BLOCKED', 'conv-w3'), 'USER_BLOCKED frame');
    await peer.frames.expectNone(isCreatedWith('w3-blocked'), 'blocked frame published to room');
    expect(sender.socket.readyState).toBe(1);
  });

  it('W4: block list malformed → frame silently ignored; the socket stays alive (typing still flows) (QC-F-117)', async () => {
    wsPrefs.set('w4-peer', MALFORMED_PREFS);
    const sender = await connect('w4-sender');
    const peer = await connect('w4-peer');
    await join(sender, 'conv-w4');
    await join(peer, 'conv-w4');

    send(sender.socket, {
      type: 'chat_message',
      conversationId: 'conv-w4',
      content: 'w4-unavailable',
      client_message_id: 'w4-1',
    });
    // QC-F-117: no gate left to answer UPSTREAM_UNAVAILABLE — silent ignore.
    await sender.frames.expectNone(
      isGateError('UPSTREAM_UNAVAILABLE', 'conv-w4'),
      'UPSTREAM_UNAVAILABLE frame',
    );
    await peer.frames.expectNone(isCreatedWith('w4-unavailable'), 'unproven frame published');
    expect(sender.frames.closeCode).toBeNull();

    // Socket alive: a typing frame from the same socket still publishes.
    send(sender.socket, { type: 'typing', conversationId: 'conv-w4', isTyping: true });
    await peer.frames.waitFor(isTyping, 'typing after ignored frame');
  });

  it('W5 control: clear pair → chat_message is STILL silently ignored (relay deleted for everyone) (QC-F-117)', async () => {
    const sender = await connect('w5-sender');
    const peer = await connect('w5-peer');
    await join(sender, 'conv-w5');
    await join(peer, 'conv-w5');

    send(sender.socket, {
      type: 'chat_message',
      conversationId: 'conv-w5',
      content: 'w5-clear',
      client_message_id: 'w5-1',
    });
    await peer.frames.expectNone(isCreatedWith('w5-clear'), 'clear frame published to room');
    await sender.frames.expectNone(isCreatedWith('w5-clear'), 'clear frame echoed to sender');
    expect(sender.socket.readyState).toBe(1);
  });

  it("W6 control: an ignored frame does not poison the socket — the sender's other, unblocked conversation is equally silent, typing still flows (QC-F-117)", async () => {
    wsPrefs.set('w6-peer', prefsBlocking(['w6-sender']));
    const sender = await connect('w6-sender');
    const peer = await connect('w6-peer');
    const carol = await connect('w6-carol');
    await join(sender, 'conv-w6a');
    await join(peer, 'conv-w6a');
    await join(sender, 'conv-w6b');
    await join(carol, 'conv-w6b');

    send(sender.socket, {
      type: 'chat_message',
      conversationId: 'conv-w6a',
      content: 'w6-blocked',
      client_message_id: 'w6-1',
    });
    await sender.frames.expectNone(isGateError('USER_BLOCKED', 'conv-w6a'), 'USER_BLOCKED frame');

    send(sender.socket, {
      type: 'chat_message',
      conversationId: 'conv-w6b',
      content: 'w6-clear',
      client_message_id: 'w6-2',
    });
    await carol.frames.expectNone(isCreatedWith('w6-clear'), 'other conversation published');
    expect(sender.socket.readyState).toBe(1);

    // The socket is healthy: typing still flows on both conversations.
    send(sender.socket, { type: 'typing', conversationId: 'conv-w6b', isTyping: true });
    await carol.frames.waitFor(isTyping, 'typing still flows after ignored frames');
  });

  it('W7 control: typing frames are NOT gated — a blocked pair still exchanges typing signals', async () => {
    wsPrefs.set('w7-peer', prefsBlocking(['w7-sender']));
    const sender = await connect('w7-sender');
    const peer = await connect('w7-peer');
    await join(sender, 'conv-w7');
    await join(peer, 'conv-w7');

    send(sender.socket, { type: 'typing', conversationId: 'conv-w7', isTyping: true });
    const typing = await peer.frames.waitFor(isTyping, 'typing reaches peer despite block');
    expect(typing.payload?.userId).toBe('w7-sender');
  });
});

// ===========================================================================
// S series — ScheduledMessageWorker delivery-time gate
// ===========================================================================

const SCHED = 'user-sched';
const SPEER = 'user-speer';
const SCONV = 'conv-sched';

interface SchedRow extends ScheduledMessageRecord {
  status: 'PENDING' | 'SENT' | 'CANCELLED';
}

function makeWorkerWorld(
  opts: {
    type?: string;
    members?: string[];
    conversationExists?: boolean;
  } = {},
) {
  const row: SchedRow = {
    id: 'sched-1',
    userId: SCHED,
    conversationId: SCONV,
    content: 'scheduled hello',
    scheduledFor: new Date('2025-01-01T11:59:50Z'),
    status: 'PENDING',
  };
  const members = opts.members ?? [SCHED, SPEER];
  const prefs = new Map<string, unknown>();
  const created: Array<Record<string, unknown>> = [];

  const tx = {
    scheduledMessage: {
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: { status: string } }) => {
        if (row.id !== where.id || row.status !== where.status) return { count: 0 };
        row.status = data.status as SchedRow['status'];
        return { count: 1 };
      },
      update: async ({ data }: { data: { status: string } }) => {
        row.status = data.status as SchedRow['status'];
        return row;
      },
    },
    conversationMember: {
      async findFirst({ where }: { where: { conversationId: string; userId: string } }) {
        return members.includes(where.userId) ? { id: `mem-${where.userId}` } : null;
      },
      async findMany() {
        return members.map((userId) => ({ userId }));
      },
    },
    conversation: {
      async findUnique() {
        if (opts.conversationExists === false) return null;
        return { id: SCONV, type: opts.type ?? 'DIRECT' };
      },
      async update() {
        return {};
      },
    },
    user: {
      async findUnique({ where }: { where: { id: string } }) {
        return { preferences: prefs.has(where.id) ? prefs.get(where.id) : null };
      },
    },
    message: {
      async create({ data }: { data: Record<string, unknown> }) {
        created.push(data);
        return { id: `m-${created.length}`, ...data };
      },
    },
  };

  const prisma = {
    scheduledMessage: {
      async findMany({ where }: { where: { status: string; scheduledFor: { lte: Date } } }) {
        return row.status === where.status && row.scheduledFor <= where.scheduledFor.lte
          ? [row]
          : [];
      },
    },
    // Rollback model (QC-F-095 pattern): a throw inside restores the
    // row status and drops messages created inside the transaction.
    async $transaction<T>(cb: (txArg: typeof tx) => Promise<T>): Promise<T> {
      const statusSnapshot = row.status;
      const createdSnapshot = created.length;
      try {
        return await cb(tx);
      } catch (error) {
        row.status = statusSnapshot;
        created.length = createdSnapshot;
        throw error;
      }
    },
  };

  return { row, prefs, created, prisma };
}

const S_NOW = new Date('2025-01-01T12:00:00Z');

describe('QC-F-359 S-series — scheduled delivery blocked-pair gate', () => {
  it('S1: peer blocked the scheduler before delivery → row CANCELLED, no Message, no onDelivered', async () => {
    const w = makeWorkerWorld();
    w.prefs.set(SPEER, prefsBlocking([SCHED]));
    const onDelivered = vi.fn();
    const onError = vi.fn();
    const worker = new ScheduledMessageWorker(w.prisma as never, { onDelivered, onError });

    const delivered = await worker.tick(S_NOW);
    expect(delivered).toBe(0);
    expect(w.row.status).toBe('CANCELLED');
    expect(w.created).toHaveLength(0);
    expect(onDelivered).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('S2: scheduler blocked the peer before delivery → row CANCELLED, no Message', async () => {
    const w = makeWorkerWorld();
    w.prefs.set(SCHED, prefsBlocking([SPEER]));
    const worker = new ScheduledMessageWorker(w.prisma as never);

    const delivered = await worker.tick(S_NOW);
    expect(delivered).toBe(0);
    expect(w.row.status).toBe('CANCELLED');
    expect(w.created).toHaveLength(0);
  });

  it('S3 control: clear pair → delivery unchanged (Message created, row SENT, onDelivered fires)', async () => {
    const w = makeWorkerWorld();
    const onDelivered = vi.fn();
    const worker = new ScheduledMessageWorker(w.prisma as never, { onDelivered });

    const delivered = await worker.tick(S_NOW);
    expect(delivered).toBe(1);
    expect(w.row.status).toBe('SENT');
    expect(w.created).toHaveLength(1);
    expect(onDelivered).toHaveBeenCalledTimes(1);
  });

  it('S4: block verdict unavailable (malformed list) → throw rolls back: row stays PENDING, no Message, error surfaced for the next tick', async () => {
    const w = makeWorkerWorld();
    w.prefs.set(SPEER, MALFORMED_PREFS);
    const onError = vi.fn();
    const worker = new ScheduledMessageWorker(w.prisma as never, { onError });

    const delivered = await worker.tick(S_NOW);
    expect(delivered).toBe(0);
    expect(w.row.status).toBe('PENDING');
    expect(w.created).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('S5 control: GROUP scheduled message with full block lists → delivery unchanged (gate is DIRECT-only)', async () => {
    const w = makeWorkerWorld({ type: 'GROUP', members: [SCHED, SPEER, 'user-third'] });
    w.prefs.set(SPEER, prefsBlocking([SCHED]));
    w.prefs.set(SCHED, prefsBlocking([SPEER]));
    const worker = new ScheduledMessageWorker(w.prisma as never);

    const delivered = await worker.tick(S_NOW);
    expect(delivered).toBe(1);
    expect(w.row.status).toBe('SENT');
    expect(w.created).toHaveLength(1);
  });
});
