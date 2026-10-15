// ============================================================================
// QC-F-042 AMEND — PR #956 changes-requested review (war room #902,
// comment 6115293682): receipt authorization + realtime binding gaps.
//
// The original QC-F-042 package enforced the 8 privacy toggles, but the
// review found four uncovered gaps. This file pins the amend:
//
//   gap 1 (REST BOLA): POST /receipts/:id/delivered|read and
//     GET /receipts/:id/status proved authentication only. Now the caller
//     must be an ACTIVE member of the message's conversation; the sender
//     cannot record receipts on their own message (403 NOT_A_RECIPIENT);
//     status is sender-only (403 NOT_MESSAGE_SENDER); unknown message 404.
//     A denied call writes NO MessageDelivery row and publishes NO event.
//   gap 2 (WS binding): a receipt frame's conversationId was checked for
//     membership, but its messageId was never bound to that conversation.
//     A member of conversation A could record receipts for a message from
//     conversation B. Now the frame is dropped (no write, no event) unless
//     message.conversationId === frame conversationId and the caller is
//     not the message's sender.
//   gap 3 (WS reciprocity): sender-side read-receipt reciprocity masked
//     only the REST status view; the live WS read tick still reached a
//     sender whose receipts are off. Now the read tick is delivered
//     per-recipient: everyone in the room EXCEPT that sender — live, via
//     the backplane, and on §20 resume replay. The REST-originated read
//     tick carries the same exclusion.
//   gap 4 (fail-closed fields): pinned in privacy.service.test.ts.
//
// Every test here FAILS against the pre-amend package (negative control in
// build-QC-F-042.md §6) and passes with the amend. Fakes are in-memory
// with stable module-level identities; sockets are real loopback WS.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import receiptsRoutes from '../routes/receipts';
import { websocketRoutes } from '../routes/websocket';
import { ReceiptService } from '../services/receipt.service';
import { InProcessBackplane, type RoomEvent } from '../services/realtime-backplane';
import { PresenceManager } from '@quant/realtime/presence';

// Stable identities (module-level).
const SENDER = { userId: 'user_r_sender', username: 'rsender' };
const READER = { userId: 'user_r_reader', username: 'rreader' };
const THIRD = { userId: 'user_r_third', username: 'rthird' };
const OUTSIDER = { userId: 'user_r_outsider', username: 'routsider' };

const W_SENDER_OFF = 'user_w_sender_off';
const W_SENDER_ON = 'user_w_sender_on';
const W_READER = 'user_w_reader';
const W_THIRD = 'user_w_third';

function prefs(privacy: Record<string, unknown>) {
  return { chatSettings: { privacy } };
}

interface ReceiptRow {
  messageId: string;
  userId: string;
  deliveredAt: Date | null;
  readAt: Date | null;
}

function makeDeliveryDelegate(rows: Map<string, ReceiptRow>) {
  const key = (messageId: string, userId: string) => `${messageId}::${userId}`;
  return {
    async findUnique(args: unknown) {
      const w = (args as { where: { messageId_userId: { messageId: string; userId: string } } })
        .where.messageId_userId;
      return rows.get(key(w.messageId, w.userId)) ?? null;
    },
    async upsert(args: unknown) {
      const a = args as {
        where: { messageId_userId: { messageId: string; userId: string } };
        create: { messageId: string; userId: string; deliveredAt?: Date; readAt?: Date };
        update: { deliveredAt?: Date; readAt?: Date };
      };
      const k = key(a.where.messageId_userId.messageId, a.where.messageId_userId.userId);
      const existing = rows.get(k);
      const row: ReceiptRow = existing
        ? { ...existing, ...a.update }
        : {
            messageId: a.create.messageId,
            userId: a.create.userId,
            deliveredAt: a.create.deliveredAt ?? null,
            readAt: a.create.readAt ?? null,
          };
      rows.set(k, row);
      return row;
    },
    async findMany(args: unknown) {
      const messageId = (args as { where: { messageId: string } }).where.messageId;
      return [...rows.values()].filter((r) => r.messageId === messageId);
    },
  };
}

// ---------------------------------------------------------------------------
// Gap 1 + REST half of gap 3 — receipts routes on a bare Fastify instance
// ---------------------------------------------------------------------------
describe('QC-F-042 amend gap 1: REST receipt object authorization', () => {
  let apps: FastifyInstance[] = [];

  afterEach(async () => {
    for (const app of apps) await app.close();
    apps = [];
  });

  /**
   * Scenario: msg-a was sent by SENDER in conv-a; active members are
   * SENDER, READER, THIRD. OUTSIDER is authenticated but not a member.
   * `senderPrefs` controls SENDER's stored privacy block.
   */
  function restPrisma(senderPrefs: unknown) {
    const rows = new Map<string, ReceiptRow>();
    const published: Array<{ conversationId: string; event: RoomEvent }> = [];
    let seq = 0;
    const userPrefs = new Map<string, unknown>([
      [SENDER.userId, senderPrefs],
      [READER.userId, null],
      [THIRD.userId, null],
      [OUTSIDER.userId, null],
    ]);
    const members = new Set([SENDER.userId, READER.userId, THIRD.userId]);
    const prisma = {
      messageDelivery: makeDeliveryDelegate(rows),
      message: {
        async findUnique(args: unknown) {
          const id = (args as { where: { id: string } }).where.id;
          return id === 'msg-a'
            ? { conversationId: 'conv-a', senderId: SENDER.userId }
            : null;
        },
      },
      conversationMember: {
        async findFirst(args: unknown) {
          const w = (args as { where: { conversationId: string; userId: string; leftAt: null } })
            .where;
          return w.conversationId === 'conv-a' && members.has(w.userId)
            ? { conversationId: w.conversationId, userId: w.userId, leftAt: null }
            : null;
        },
        async findMany() {
          return [];
        },
      },
      user: {
        async findUnique(args: unknown) {
          const id = (args as { where: { id: string } }).where.id;
          if (!userPrefs.has(id)) return null;
          return { preferences: userPrefs.get(id) };
        },
        async findMany() {
          return [];
        },
      },
      closeFriend: { async findMany() { return []; } },
      conversation: { async findMany() { return []; } },
    };
    const backplane = {
      instanceId: 'rest-amend-test',
      async publish(conversationId: string, event: RoomEvent) {
        published.push({ conversationId, event });
      },
      async nextSequence() {
        return ++seq;
      },
      async subscribe() {},
      async unsubscribe() {},
      onMessage() {},
      isHealthy() {
        return true;
      },
    };
    return { prisma, rows, published, backplane };
  }

  async function appFor(
    auth: { userId: string; username: string },
    ctx: ReturnType<typeof restPrisma>,
  ): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    // Mirror of the server-core error handler's AppError branch.
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
    const decorate = (
      app as unknown as { decorate: (key: string, value: unknown) => void }
    ).decorate.bind(app);
    // Captain pattern: decorate the real prisma value directly (no helper
    // with an `unknown`-typed prisma param — TS2345).
    decorate('prisma', ctx.prisma);
    decorate('realtimeBackplane', ctx.backplane);
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = {
        userId: auth.userId,
        username: auth.username,
        email: '',
        role: 'user',
        scopes: [],
        sessionId: 'sess_amend',
        app: 'quantchat',
        tokenId: 'tok_amend',
      };
    });
    await app.register(receiptsRoutes, { prefix: '/receipts' });
    await app.ready();
    apps.push(app);
    return app;
  }

  it('non-member POST read is 403 NOT_A_MEMBER and writes no row', async () => {
    const ctx = restPrisma(null);
    const app = await appFor(OUTSIDER, ctx);
    const res = await app.inject({ method: 'POST', url: '/receipts/msg-a/read' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(ctx.rows.size).toBe(0);
  });

  it('non-member POST delivered is 403 and writes no row', async () => {
    const ctx = restPrisma(null);
    const app = await appFor(OUTSIDER, ctx);
    const res = await app.inject({ method: 'POST', url: '/receipts/msg-a/delivered' });
    expect(res.statusCode).toBe(403);
    expect(ctx.rows.size).toBe(0);
  });

  it('the sender cannot record receipts on their own message (403, no row)', async () => {
    const ctx = restPrisma(null);
    const app = await appFor(SENDER, ctx);
    const read = await app.inject({ method: 'POST', url: '/receipts/msg-a/read' });
    expect(read.statusCode).toBe(403);
    expect(read.json().error.code).toBe('NOT_A_RECIPIENT');
    const delivered = await app.inject({ method: 'POST', url: '/receipts/msg-a/delivered' });
    expect(delivered.statusCode).toBe(403);
    expect(ctx.rows.size).toBe(0);
  });

  it('member recipient records delivered + read (control)', async () => {
    const ctx = restPrisma(null);
    const app = await appFor(READER, ctx);
    const delivered = await app.inject({ method: 'POST', url: '/receipts/msg-a/delivered' });
    expect(delivered.statusCode).toBe(200);
    const read = await app.inject({ method: 'POST', url: '/receipts/msg-a/read' });
    expect(read.statusCode).toBe(200);
    expect(ctx.rows.get(`msg-a::${READER.userId}`)?.readAt).toBeInstanceOf(Date);
  });

  it('status: non-member 403, member non-sender 403, sender 200 (control)', async () => {
    const ctx = restPrisma(null);
    const readerApp = await appFor(READER, ctx);
    await readerApp.inject({ method: 'POST', url: '/receipts/msg-a/read' });

    const outsiderApp = await appFor(OUTSIDER, ctx);
    const outsiderRes = await outsiderApp.inject({ method: 'GET', url: '/receipts/msg-a/status' });
    expect(outsiderRes.statusCode).toBe(403);

    const memberRes = await readerApp.inject({ method: 'GET', url: '/receipts/msg-a/status' });
    expect(memberRes.statusCode).toBe(403);
    expect(memberRes.json().error.code).toBe('NOT_MESSAGE_SENDER');

    const senderApp = await appFor(SENDER, ctx);
    const senderRes = await senderApp.inject({ method: 'GET', url: '/receipts/msg-a/status' });
    expect(senderRes.statusCode).toBe(200);
    expect(senderRes.json().data.status).toBe('read');
    expect(senderRes.json().data.receipts.map((r: { userId: string }) => r.userId)).toEqual([
      READER.userId,
    ]);
  });

  it('unknown message is 404 for both record and status', async () => {
    const ctx = restPrisma(null);
    const app = await appFor(READER, ctx);
    const res = await app.inject({ method: 'POST', url: '/receipts/msg-nope/read' });
    expect(res.statusCode).toBe(404);
    const status = await app.inject({ method: 'GET', url: '/receipts/msg-nope/status' });
    expect(status.statusCode).toBe(404);
    expect(ctx.rows.size).toBe(0);
  });

  /** The route publishes its tick fire-and-forget; poll the capture. */
  async function waitForTick(
    ctx: ReturnType<typeof restPrisma>,
  ): Promise<{ conversationId: string; event: RoomEvent } | undefined> {
    const deadline = Date.now() + 3000;
    for (;;) {
      const hit = ctx.published.find(
        (p) => p.event.envelope?.event_type === 'chat.message.receipt_updated.v1',
      );
      if (hit) return hit;
      if (Date.now() > deadline) return undefined;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  it('REST read tick excludes a receipts-off sender; sender with defaults is not excluded (gap 3)', async () => {
    // Sender OFF: the live tick is published for the room but must carry
    // the sender exclusion so the WS layer never delivers it to them.
    const offCtx = restPrisma(prefs({ showReadReceipts: false }));
    const offApp = await appFor(READER, offCtx);
    const offRes = await offApp.inject({ method: 'POST', url: '/receipts/msg-a/read' });
    expect(offRes.statusCode).toBe(200);
    const offEvent = await waitForTick(offCtx);
    expect(offEvent).toBeDefined();
    expect(offEvent?.event.excludeUserIds).toEqual([SENDER.userId]);

    // Sender with default prefs: no exclusion.
    const onCtx = restPrisma(null);
    const onApp = await appFor(READER, onCtx);
    const onRes = await onApp.inject({ method: 'POST', url: '/receipts/msg-a/read' });
    expect(onRes.statusCode).toBe(200);
    const onEvent = await waitForTick(onCtx);
    expect(onEvent).toBeDefined();
    expect(onEvent?.event.excludeUserIds).toBeUndefined();
  });

  it('service fails closed (503) when the authorization store is not wired', async () => {
    const rows = new Map<string, ReceiptRow>();
    const service = new ReceiptService({
      messageDelivery: makeDeliveryDelegate(rows),
    } as never);
    await expect(service.markMessageRead('msg-a', READER.userId)).rejects.toMatchObject({
      statusCode: 503,
    });
    await expect(service.getMessageReceiptStatus('msg-a', SENDER.userId)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(rows.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Gaps 2 + 3 — websocket receipt frames over real loopback sockets
// (harness mirrors qc-f-037-websocket-membership.test.ts)
// ---------------------------------------------------------------------------

const JWT_SECRET = 'qc-f-042-amend-test-secret-key-for-jwt-signing-0123456789';
const JWT_ISSUER = 'quantchat';
const JWT_AUDIENCE = 'quant-ecosystem';

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
  conversationId?: string;
  event_type?: string;
  cursor?: string;
  payload?: {
    content?: unknown;
    senderId?: unknown;
    userId?: unknown;
    receipt?: unknown;
    messageId?: unknown;
  };
};

class FrameCollector {
  readonly frames: Frame[] = [];

  attach(socket: TestSocket): void {
    socket.addEventListener('message', (ev) => {
      try {
        this.frames.push(JSON.parse(String(ev.data)) as Frame);
      } catch {
        // Non-JSON frames are not part of this contract; ignore.
      }
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
const isReadTickFor = (messageId: string) => (f: Frame): boolean =>
  f.event_type === 'chat.message.receipt_updated.v1' &&
  f.payload?.messageId === messageId &&
  f.payload?.receipt === 'read';

function makeToken(userId: string): string {
  const b64url = (input: string | Buffer): string =>
    Buffer.from(input)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ sub: userId, iss: JWT_ISSUER, aud: JWT_AUDIENCE, iat: now, exp: now + 3600 }),
  );
  const signature = b64url(
    createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

describe('QC-F-042 amend gaps 2+3: WS receipt binding + sender reciprocity', () => {
  let app: FastifyInstance;
  let wsBaseUrl = '';
  const openSockets: TestSocket[] = [];
  const rows = new Map<string, ReceiptRow>();

  const MEMBERS: Record<string, string[]> = {
    'conv-w1': [W_SENDER_OFF, W_READER, W_THIRD],
    'conv-w2': [W_SENDER_ON, W_READER],
    'conv-w3': [W_SENDER_ON, W_READER, W_THIRD],
  };
  const MESSAGES: Record<string, { conversationId: string; senderId: string }> = {
    'msg-w1': { conversationId: 'conv-w1', senderId: W_SENDER_OFF },
    'msg-w2': { conversationId: 'conv-w2', senderId: W_SENDER_ON },
    'msg-w3': { conversationId: 'conv-w3', senderId: W_SENDER_ON },
  };
  const USER_PREFS = new Map<string, unknown>([
    [W_SENDER_OFF, prefs({ showReadReceipts: false })],
    [W_SENDER_ON, null],
    [W_READER, null],
    [W_THIRD, null],
  ]);

  async function connect(
    userId: string,
  ): Promise<{ socket: TestSocket; frames: FrameCollector }> {
    const frames = new FrameCollector();
    const raw = new NativeWebSocket(`${wsBaseUrl}/ws/chat`, [makeToken(userId)]);
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

  async function joinAndResume(
    client: { socket: TestSocket; frames: FrameCollector },
    conversationId: string,
  ): Promise<void> {
    send(client.socket, { type: 'join_conversation', conversationId });
    await client.frames.waitFor(isResumed, `resumed for ${conversationId}`);
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.JWT_ISSUER = JWT_ISSUER;
    process.env.JWT_AUDIENCE = JWT_AUDIENCE;

    const fakePrisma = {
      messageDelivery: makeDeliveryDelegate(rows),
      message: {
        async findUnique(args: unknown) {
          const id = (args as { where: { id: string } }).where.id;
          return MESSAGES[id] ?? null;
        },
      },
      conversationMember: {
        async findFirst(args: unknown) {
          const w = (args as { where: { conversationId: string; userId: string; leftAt: null } })
            .where;
          return (MEMBERS[w.conversationId] ?? []).includes(w.userId)
            ? { conversationId: w.conversationId, userId: w.userId, leftAt: null }
            : null;
        },
        async findMany() {
          return [];
        },
      },
      user: {
        async findUnique(args: unknown) {
          const id = (args as { where: { id: string } }).where.id;
          if (!USER_PREFS.has(id)) return null;
          return { preferences: USER_PREFS.get(id) };
        },
        async findMany(args: unknown) {
          const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
          return ids
            .filter((id) => USER_PREFS.has(id))
            .map((id) => ({ id, preferences: USER_PREFS.get(id) }));
        },
      },
      closeFriend: { async findMany() { return []; } },
      conversation: {
        async findMany() {
          return [];
        },
        // QC-F-359 fixture migration: the WS blocked-send gate reads
        // the conversation type via findUnique before a chat_message
        // publish. The anchor conversation (conv-w1) has three active
        // members in MEMBERS — a group scenario, so GROUP is its real
        // type and the DIRECT-only gate skips it; other known
        // conversations answer DIRECT (their member sets are pairs).
        // The gate additionally derives peers from
        // conversationMember.findMany, which this fake answers [] —
        // either way no pre-existing frame flow changes. Assertions
        // unchanged.
        async findUnique(args: unknown) {
          const id = (args as { where: { id: string } }).where.id;
          const memberIds = MEMBERS[id];
          if (!memberIds) return null;
          return { id, type: memberIds.length > 2 ? 'GROUP' : 'DIRECT' };
        },
      },
    };

    app = Fastify({ logger: false });
    const decorate = (
      app as unknown as { decorate(name: string, value: unknown): void }
    ).decorate.bind(app);
    decorate('prisma', fakePrisma);
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
    await app.close();
  });

  it('gap 2: conversationId/messageId mismatch is dropped — no write, no event; bound frame works (control)', async () => {
    const reader = await connect(W_READER);
    const third = await connect(W_THIRD);
    await joinAndResume(reader, 'conv-w1');
    await joinAndResume(third, 'conv-w1');

    // Reader IS a member of conv-w1 (frame gate passes), but msg-w2 lives
    // in conv-w2 — the receipt must not be written nor fanned anywhere.
    send(reader.socket, { type: 'delivery_ack', messageId: 'msg-w2', conversationId: 'conv-w1' });
    send(reader.socket, { type: 'read_receipt', messageId: 'msg-w2', conversationId: 'conv-w1' });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(rows.get(`msg-w2::${W_READER}`)).toBeUndefined();
    await third.frames.expectNone(isReadTickFor('msg-w2'), 'tick for mismatched message', 200);
    await third.frames.expectNone(
      (f) =>
        f.event_type === 'chat.message.receipt_updated.v1' && f.payload?.messageId === 'msg-w2',
      'any receipt tick for mismatched message',
      200,
    );

    // Control: the correctly bound frame records + fans out.
    send(reader.socket, { type: 'read_receipt', messageId: 'msg-w1', conversationId: 'conv-w1' });
    await third.frames.waitFor(isReadTickFor('msg-w1'), 'bound read tick reaches room member');
    expect(rows.get(`msg-w1::${W_READER}`)?.readAt).toBeInstanceOf(Date);
  });

  it('gap 3: reader ON + sender OFF — the live read tick reaches other members but never the sender', async () => {
    const sender = await connect(W_SENDER_OFF);
    const reader = await connect(W_READER);
    const third = await connect(W_THIRD);
    await joinAndResume(sender, 'conv-w1');
    await joinAndResume(reader, 'conv-w1');
    await joinAndResume(third, 'conv-w1');

    send(reader.socket, { type: 'read_receipt', messageId: 'msg-w1', conversationId: 'conv-w1' });

    // Per-recipient filter: the third member DOES receive the tick...
    await third.frames.waitFor(isReadTickFor('msg-w1'), 'read tick reaches third member');
    expect(rows.get(`msg-w1::${W_READER}`)?.readAt).toBeInstanceOf(Date);
    // ...and the receipts-off sender does NOT (pre-amend it did).
    await sender.frames.expectNone(isReadTickFor('msg-w1'), 'read tick leaked to receipts-off sender');
  });

  it('gap 3 control: sender with receipts on receives the live read tick', async () => {
    const sender = await connect(W_SENDER_ON);
    const reader = await connect(W_READER);
    await joinAndResume(sender, 'conv-w3');
    await joinAndResume(reader, 'conv-w3');

    send(reader.socket, { type: 'read_receipt', messageId: 'msg-w3', conversationId: 'conv-w3' });
    await sender.frames.waitFor(isReadTickFor('msg-w3'), 'read tick reaches receipts-on sender');
    expect(rows.get(`msg-w3::${W_READER}`)?.readAt).toBeInstanceOf(Date);
  });

  it('gap 3 resume: a reconnecting receipts-off sender is not replayed the withheld read tick; another member is', async () => {
    const sender = await connect(W_SENDER_OFF);
    const third = await connect(W_THIRD);
    const reader = await connect(W_READER);
    await joinAndResume(sender, 'conv-w1');
    await joinAndResume(third, 'conv-w1');
    await joinAndResume(reader, 'conv-w1');

    // Anchor: a room message both observers receive; its envelope cursor
    // predates the read tick published below.
    send(reader.socket, {
      type: 'chat_message',
      conversationId: 'conv-w1',
      content: 'resume-anchor',
      client_message_id: 'amend-anchor-1',
    });
    const anchor = await sender.frames.waitFor(
      (f) => f.event_type === 'chat.message.created.v1' && f.payload?.content === 'resume-anchor',
      'anchor message at sender',
    );
    await third.frames.waitFor(
      (f) => f.event_type === 'chat.message.created.v1' && f.payload?.content === 'resume-anchor',
      'anchor message at third',
    );
    const anchorCursor = anchor.cursor;
    expect(typeof anchorCursor).toBe('string');

    sender.socket.close();
    third.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 300));

    // While both are away, the reader reads the sender's message.
    send(reader.socket, { type: 'read_receipt', messageId: 'msg-w1', conversationId: 'conv-w1' });
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(rows.get(`msg-w1::${W_READER}`)?.readAt).toBeInstanceOf(Date);

    // Sender reconnects with the pre-tick cursor: resume must NOT replay
    // the withheld tick to them.
    const sender2 = await connect(W_SENDER_OFF);
    send(sender2.socket, {
      type: 'join_conversation',
      conversationId: 'conv-w1',
      last_event_cursor: anchorCursor,
    });
    await sender2.frames.waitFor(isResumed, 'sender resumed after reconnect');
    await sender2.frames.expectNone(
      isReadTickFor('msg-w1'),
      'withheld read tick replayed to receipts-off sender',
    );

    // Third member reconnects with the same cursor: the tick IS replayed
    // to them — the filter is per-recipient, not a dropped event.
    const third2 = await connect(W_THIRD);
    send(third2.socket, {
      type: 'join_conversation',
      conversationId: 'conv-w1',
      last_event_cursor: anchorCursor,
    });
    await third2.frames.waitFor(isReadTickFor('msg-w1'), 'read tick replayed to third member');
  });
});
