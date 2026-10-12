// ============================================================================
// QC-F-037 — WebSocket room membership (BOLA) regression suite
//
// Defect (P0): routes/websocket.ts authenticated the upgrade (JWT) but NEVER
// checked conversation membership. Any logged-in user could:
//   * join ANY conversation room via ?conversationId= or a join_conversation
//     frame and receive its live events + §20 resume replays,
//   * inject chat_message / typing frames into conversations they are not a
//     member of,
//   * persist + fan out forged delivery/read receipts for any message.
// Plus: packages/realtime accepted the JWT via ?token= in the URL (leaks
// into logs/history/Referer) and preferred it over the Authorization header.
//
// Harness: bare Fastify + the REAL websocketRoutes plugin + REAL
// InProcessBackplane + REAL PresenceManager + a fake Prisma delegate
// (conversationMember.findFirst respecting leftAt, messageDelivery
// findUnique/upsert for the REAL DeliveryReceiptService). Sockets are REAL
// WebSocket clients over a loopback TCP listener (Node's built-in client);
// the collector is attached synchronously at construction, before 'open',
// so connect-time frames (resumed / NOT_A_MEMBER) are captured, not raced.
// Identity comes only from real signed JWTs, transported via the
// Sec-WebSocket-Protocol header — the exact transport the shipped web
// client uses (src/lib/auth.ts getWsProtocols).
// ============================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { websocketRoutes } from '../routes/websocket';
import { InProcessBackplane } from '../services/realtime-backplane';
import { PresenceManager } from '@quant/realtime/presence';

const JWT_SECRET = 'qc-f-037-test-secret-key-for-jwt-signing-0123456789';
const JWT_ISSUER = 'quantchat';
const JWT_AUDIENCE = 'quant-ecosystem';

// ---------------------------------------------------------------------------
// Fake Prisma — exactly the surface websocket.ts + DeliveryReceiptService use
// ---------------------------------------------------------------------------

interface MemberRow {
  conversationId: string;
  userId: string;
  leftAt: Date | null;
}

interface DeliveryRow {
  messageId: string;
  userId: string;
  deliveredAt: Date | null;
  readAt: Date | null;
}

function createFakePrisma(members: MemberRow[]) {
  const deliveries = new Map<string, DeliveryRow>();
  const key = (messageId: string, userId: string): string => `${messageId}|${userId}`;
  return {
    conversationMember: {
      async findFirst(args: {
        where: { conversationId: string; userId: string; leftAt: null };
      }): Promise<MemberRow | null> {
        const row = members.find(
          (m) =>
            m.conversationId === args.where.conversationId &&
            m.userId === args.where.userId &&
            (args.where.leftAt !== null || m.leftAt === null),
        );
        return row ? { ...row } : null;
      },
    },
    messageDelivery: {
      async findUnique(args: {
        where: { messageId_userId: { messageId: string; userId: string } };
      }): Promise<DeliveryRow | null> {
        const row = deliveries.get(
          key(args.where.messageId_userId.messageId, args.where.messageId_userId.userId),
        );
        return row ? { ...row } : null;
      },
      async upsert(args: {
        where: { messageId_userId: { messageId: string; userId: string } };
        create: {
          messageId: string;
          userId: string;
          deliveredAt?: Date | null;
          readAt?: Date | null;
        };
        update: { deliveredAt?: Date | null; readAt?: Date | null };
      }): Promise<DeliveryRow> {
        const k = key(args.where.messageId_userId.messageId, args.where.messageId_userId.userId);
        const existing = deliveries.get(k);
        if (existing) {
          if (args.update.deliveredAt !== undefined) {
            existing.deliveredAt = args.update.deliveredAt;
          }
          if (args.update.readAt !== undefined) existing.readAt = args.update.readAt;
          return { ...existing };
        }
        const row: DeliveryRow = {
          messageId: args.create.messageId,
          userId: args.create.userId,
          deliveredAt: args.create.deliveredAt ?? null,
          readAt: args.create.readAt ?? null,
        };
        deliveries.set(k, row);
        return { ...row };
      },
    },
    // QC-F-042 amend (gap 2): the WS layer now binds a receipt frame's
    // messageId to its owning conversation before recording. Case 6's
    // scenario presupposes a real message — msg-t6, sent by alice in
    // conv-t6, acked by bob — modelled here. Unknown ids return null
    // (unbound frames are dropped).
    message: {
      async findUnique(args: {
        where: { id: string };
      }): Promise<{ conversationId: string; senderId: string } | null> {
        return args.where.id === 'msg-t6'
          ? { conversationId: 'conv-t6', senderId: 'alice' }
          : null;
      },
    },
    __deliveries: deliveries,
  };
}

type FakePrisma = ReturnType<typeof createFakePrisma>;

// conv-t7: dave WAS a member but left (leftAt set) — must be denied.
const MEMBERS: MemberRow[] = [
  ...['conv-t1', 'conv-t2', 'conv-t3', 'conv-t4', 'conv-t5', 'conv-t6'].flatMap(
    (conversationId) => [
      { conversationId, userId: 'alice', leftAt: null },
      { conversationId, userId: 'bob', leftAt: null },
    ],
  ),
  { conversationId: 'conv-t3-own', userId: 'mallory', leftAt: null },
  { conversationId: 'conv-t7', userId: 'alice', leftAt: null },
  { conversationId: 'conv-t7', userId: 'dave', leftAt: new Date('2026-10-01T00:00:00Z') },
];

// ---------------------------------------------------------------------------
// WS test client — Node's built-in WebSocket over a real loopback listener
// ---------------------------------------------------------------------------

/** Minimal structural surface of the built-in (undici) WebSocket client. */
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

const NativeWebSocket = (
  globalThis as unknown as { WebSocket: WebSocketCtor }
).WebSocket;

type Frame = Record<string, unknown> & {
  type?: string;
  code?: string;
  message?: string;
  conversationId?: string;
  event_type?: string;
  payload?: { content?: unknown; senderId?: unknown; userId?: unknown; receipt?: unknown };
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

  async waitFor(
    pred: (frame: Frame) => boolean,
    label: string,
    timeoutMs = 4000,
  ): Promise<Frame> {
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

  waitClose(timeoutMs = 4000): Promise<number> {
    if (this.closeCode !== null) return Promise.resolve(this.closeCode);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('timed out waiting for socket close')),
        timeoutMs,
      );
      this.closeWaiters.push((code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }
}

const isNotMember = (conversationId: string) => (f: Frame): boolean =>
  f.type === 'error' && f.code === 'NOT_A_MEMBER' && f.conversationId === conversationId;
const isResumed = (f: Frame): boolean => f.type === 'resumed';
const isCreatedWith = (content: string) => (f: Frame): boolean =>
  f.event_type === 'chat.message.created.v1' && f.payload?.content === content;

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let fakePrisma: FakePrisma;
const openSockets: TestSocket[] = [];

/**
 * Sign a real HS256 JWT with node:crypto (jose is not a direct dependency of
 * this app package; the verifier under test is the real jose-based
 * ConnectionAuth inside @quant/realtime, so the token must be a genuine,
 * correctly-signed JWT — iss/aud/exp/sub exactly as production tokens carry).
 */
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
    JSON.stringify({
      sub: userId,
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = b64url(
    createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

let wsBaseUrl = '';

/**
 * Open a real WebSocket connection. The JWT travels as the
 * Sec-WebSocket-Protocol subprotocol (the web client's real transport);
 * `viaQueryToken` instead puts it in the URL — the transport QC-F-037
 * removes — for the case-8 rejection test.
 */
async function connect(
  token: string | null,
  path: string,
  opts: { viaQueryToken?: boolean } = {},
): Promise<{ socket: TestSocket; frames: FrameCollector }> {
  const frames = new FrameCollector();
  const url =
    opts.viaQueryToken && token
      ? `${wsBaseUrl}${path}${path.includes('?') ? '&' : '?'}token=${token}`
      : `${wsBaseUrl}${path}`;
  const raw = new NativeWebSocket(url, !opts.viaQueryToken && token ? [token] : undefined);
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
  // Attach the collector synchronously — before 'open' — so connect-time
  // frames (resumed / NOT_A_MEMBER / presence) are never raced.
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

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.JWT_ISSUER = JWT_ISSUER;
  process.env.JWT_AUDIENCE = JWT_AUDIENCE;

  fakePrisma = createFakePrisma(MEMBERS);
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
  // Destroy any lingering TCP/WS sockets so app.close() cannot hang.
  (app.server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  await app.close();
});

// ---------------------------------------------------------------------------
// Cases (numbering follows specialist-qc-f-037.md §5)
// ---------------------------------------------------------------------------

describe('QC-F-037 — WebSocket conversation membership gate', () => {
  it('case 1+2 control: member connect-time join gets resumed; member chat_message reaches room', async () => {
    const alice = await connect(await makeToken('alice'), '/ws/chat?conversationId=conv-t1');
    await alice.frames.waitFor(isResumed, 'member connect-time resumed');
    await alice.frames.expectNone(isNotMember('conv-t1'), 'NOT_A_MEMBER for a member', 200);

    const bob = await connect(await makeToken('bob'), '/ws/chat');
    send(bob.socket, { type: 'join_conversation', conversationId: 'conv-t1' });
    await bob.frames.waitFor(isResumed, 'member frame-join resumed');

    send(bob.socket, {
      type: 'chat_message',
      conversationId: 'conv-t1',
      content: 'hello-t1',
      client_message_id: 't1-1',
    });
    const delivered = await alice.frames.waitFor(
      isCreatedWith('hello-t1'),
      'member chat_message delivered to room',
    );
    expect(delivered.payload?.senderId).toBe('bob');
  });

  it('case 2: member frame join with cursor replays only the missed buffered events', async () => {
    const alice = await connect(await makeToken('alice'), '/ws/chat');
    send(alice.socket, { type: 'join_conversation', conversationId: 'conv-t2' });
    await alice.frames.waitFor(isResumed, 'alice resumed');

    send(alice.socket, {
      type: 'chat_message',
      conversationId: 'conv-t2',
      content: 't2-first',
      client_message_id: 't2-1',
    });
    const first = await alice.frames.waitFor(isCreatedWith('t2-first'), 'first message echo');
    send(alice.socket, {
      type: 'chat_message',
      conversationId: 'conv-t2',
      content: 't2-second',
      client_message_id: 't2-2',
    });
    await alice.frames.waitFor(isCreatedWith('t2-second'), 'second message echo');

    const bob = await connect(await makeToken('bob'), '/ws/chat');
    send(bob.socket, {
      type: 'join_conversation',
      conversationId: 'conv-t2',
      last_event_cursor: first.cursor,
    });
    const replayedFrame = await bob.frames.waitFor(
      isCreatedWith('t2-second'),
      'missed event replayed to member',
    );
    expect(replayedFrame.payload?.senderId).toBe('alice');
    const resumed = await bob.frames.waitFor(isResumed, 'bob resumed after replay');
    expect(resumed.replayed).toBe(1);
    await bob.frames.expectNone(isCreatedWith('t2-first'), 'already-seen event replayed', 200);
  });

  it('case 3: non-member connect-time join denied — no room, no resumed/cursor, socket stays open', async () => {
    const mallory = await connect(
      await makeToken('mallory'),
      '/ws/chat?conversationId=conv-t3',
    );
    await mallory.frames.waitFor(isNotMember('conv-t3'), 'NOT_A_MEMBER on connect-time join');
    await mallory.frames.expectNone(isResumed, 'resumed frame leaked to non-member');
    expect(mallory.socket.readyState).toBe(1); // still OPEN

    // A member's message in that room must never reach the non-member.
    const alice = await connect(await makeToken('alice'), '/ws/chat?conversationId=conv-t3');
    await alice.frames.waitFor(isResumed, 'alice resumed');
    send(alice.socket, {
      type: 'chat_message',
      conversationId: 'conv-t3',
      content: 'secret-t3',
      client_message_id: 't3-1',
    });
    await alice.frames.waitFor(isCreatedWith('secret-t3'), 'member echo');
    await mallory.frames.expectNone(isCreatedWith('secret-t3'), 'live event leaked to non-member');

    // The SAME socket can still join a conversation mallory belongs to.
    send(mallory.socket, { type: 'join_conversation', conversationId: 'conv-t3-own' });
    await mallory.frames.waitFor(isResumed, 'own-conversation join on same socket');
  });

  it('case 4: non-member frame join gets no resume replay at all', async () => {
    const alice = await connect(await makeToken('alice'), '/ws/chat');
    send(alice.socket, { type: 'join_conversation', conversationId: 'conv-t4' });
    await alice.frames.waitFor(isResumed, 'alice resumed');
    send(alice.socket, {
      type: 'chat_message',
      conversationId: 'conv-t4',
      content: 'replay-secret-t4',
      client_message_id: 't4-1',
    });
    await alice.frames.waitFor(isCreatedWith('replay-secret-t4'), 'buffered message echo');

    const mallory = await connect(await makeToken('mallory'), '/ws/chat');
    send(mallory.socket, {
      type: 'join_conversation',
      conversationId: 'conv-t4',
      last_event_cursor: 'conversation.conv-t4:0',
    });
    await mallory.frames.waitFor(isNotMember('conv-t4'), 'NOT_A_MEMBER on frame join');
    await mallory.frames.expectNone(
      isCreatedWith('replay-secret-t4'),
      'buffered replay leaked to non-member',
    );
    await mallory.frames.expectNone(isResumed, 'resumed leaked to non-member', 200);
    await mallory.frames.expectNone(
      (f) => f.type === 'snapshot_required',
      'snapshot_required leaked to non-member',
      200,
    );
  });

  it('case 5: non-member chat_message is dropped — no live fan-out, no resume-buffer entry', async () => {
    const alice = await connect(await makeToken('alice'), '/ws/chat');
    send(alice.socket, { type: 'join_conversation', conversationId: 'conv-t5' });
    await alice.frames.waitFor(isResumed, 'alice resumed');
    send(alice.socket, {
      type: 'chat_message',
      conversationId: 'conv-t5',
      content: 'legit-t5',
      client_message_id: 't5-legit',
    });
    const legit = await alice.frames.waitFor(isCreatedWith('legit-t5'), 'legit message echo');

    const mallory = await connect(await makeToken('mallory'), '/ws/chat');
    send(mallory.socket, {
      type: 'chat_message',
      conversationId: 'conv-t5',
      content: 'injected-t5',
      client_message_id: 't5-evil',
    });
    await mallory.frames.waitFor(isNotMember('conv-t5'), 'NOT_A_MEMBER on chat_message');
    await alice.frames.expectNone(isCreatedWith('injected-t5'), 'injected message fanned out');

    // If the injected frame had entered the resume buffer, a member joining
    // with the legit cursor would replay it. It must replay nothing.
    const bob = await connect(await makeToken('bob'), '/ws/chat');
    send(bob.socket, {
      type: 'join_conversation',
      conversationId: 'conv-t5',
      last_event_cursor: legit.cursor,
    });
    const resumed = await bob.frames.waitFor(isResumed, 'bob resumed');
    expect(resumed.replayed).toBe(0);
    await bob.frames.expectNone(isCreatedWith('injected-t5'), 'injected message replayed', 200);
  });

  it('case 6: non-member typing + receipts denied (no fan-out, no persistence); member receipts work', async () => {
    const alice = await connect(await makeToken('alice'), '/ws/chat');
    send(alice.socket, { type: 'join_conversation', conversationId: 'conv-t6' });
    await alice.frames.waitFor(isResumed, 'alice resumed');
    const bob = await connect(await makeToken('bob'), '/ws/chat');
    send(bob.socket, { type: 'join_conversation', conversationId: 'conv-t6' });
    await bob.frames.waitFor(isResumed, 'bob resumed');

    const mallory = await connect(await makeToken('mallory'), '/ws/chat');
    send(mallory.socket, { type: 'typing', conversationId: 'conv-t6', isTyping: true });
    await mallory.frames.waitFor(isNotMember('conv-t6'), 'NOT_A_MEMBER on typing');
    await alice.frames.expectNone(
      (f) => f.event_type === 'chat.typing.v1' && f.payload?.userId === 'mallory',
      'typing ghost from non-member',
    );

    send(mallory.socket, {
      type: 'delivery_ack',
      messageId: 'msg-t6',
      conversationId: 'conv-t6',
    });
    send(mallory.socket, { type: 'read_receipt', messageId: 'msg-t6', conversationId: 'conv-t6' });
    // Both receipt frames are denied; give the handler time to (not) persist.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(fakePrisma.__deliveries.get('msg-t6|mallory')).toBeUndefined();
    await alice.frames.expectNone(
      (f) => f.event_type === 'chat.message.receipt_updated.v1' && f.payload?.userId === 'mallory',
      'forged receipt tick from non-member',
      200,
    );

    // Member control: bob's receipts persist AND fan out.
    send(bob.socket, { type: 'delivery_ack', messageId: 'msg-t6', conversationId: 'conv-t6' });
    const deliveredTick = await alice.frames.waitFor(
      (f) =>
        f.event_type === 'chat.message.receipt_updated.v1' &&
        f.payload?.userId === 'bob' &&
        f.payload?.receipt === 'delivered',
      'member delivered tick',
    );
    expect(deliveredTick).toBeDefined();
    expect(fakePrisma.__deliveries.get('msg-t6|bob')?.deliveredAt).toBeInstanceOf(Date);

    send(bob.socket, { type: 'read_receipt', messageId: 'msg-t6', conversationId: 'conv-t6' });
    await alice.frames.waitFor(
      (f) =>
        f.event_type === 'chat.message.receipt_updated.v1' &&
        f.payload?.userId === 'bob' &&
        f.payload?.receipt === 'read',
      'member read tick',
    );
    expect(fakePrisma.__deliveries.get('msg-t6|bob')?.readAt).toBeInstanceOf(Date);
  });

  it('case 7: a member who left (leftAt set) is denied like a non-member', async () => {
    const dave = await connect(await makeToken('dave'), '/ws/chat?conversationId=conv-t7');
    await dave.frames.waitFor(isNotMember('conv-t7'), 'NOT_A_MEMBER for removed member');
    await dave.frames.expectNone(isResumed, 'resumed leaked to removed member', 200);

    send(dave.socket, {
      type: 'chat_message',
      conversationId: 'conv-t7',
      content: 'ghost-t7',
      client_message_id: 't7-1',
    });
    // A SECOND NOT_A_MEMBER must arrive for the chat_message frame itself
    // (the first one was for the connect-time join).
    const deadline = Date.now() + 4000;
    for (;;) {
      const denials = dave.frames.frames.filter(isNotMember('conv-t7'));
      if (denials.length >= 2) break;
      if (Date.now() > deadline) {
        throw new Error(
          `expected 2 NOT_A_MEMBER frames for removed member, saw ${denials.length}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });

  it('case 8: a valid JWT presented only via ?token= is rejected (close 4001)', async () => {
    const token = makeToken('alice');
    // The upgrade itself succeeds at the WS layer; the route's auth then
    // fails (no header/subprotocol token) and the server closes with 4001
    // after a plain 'Authentication required' error frame.
    const { frames } = await connect(token, '/ws/chat', { viaQueryToken: true });
    const code = await frames.waitClose();
    expect(code).toBe(4001);
    const authError = frames.frames.find((f) => f.type === 'error');
    expect(authError?.message).toBe('Authentication required');
    expect(authError?.code).toBeUndefined(); // plain auth error, not NOT_A_MEMBER
  });
});
