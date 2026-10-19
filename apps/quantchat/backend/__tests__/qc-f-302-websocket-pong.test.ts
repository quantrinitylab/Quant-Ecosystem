// ============================================================================
// QC-F-302 — WebSocket heartbeat proof-of-life (pong) regression suite
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
      // QC-F-359 fixture migration: the WS blocked-send gate derives
      // the peer set from active members. Same rows, same leftAt
      // filter as findFirst. Assertions unchanged.
      async findMany(args: {
        where: { conversationId: string; leftAt: null };
      }): Promise<MemberRow[]> {
        return members
          .filter(
            (m) =>
              m.conversationId === args.where.conversationId &&
              (args.where.leftAt !== null || m.leftAt === null),
          )
          .map((m) => ({ ...m }));
      },
    },
    // QC-F-359 fixture migration: the WS blocked-send gate reads the
    // conversation type from the row. Every conversation in MEMBERS is
    // an alice+bob (or mallory-solo) 1:1 scenario, so DIRECT is the
    // scenario's real type; a conversation with no member rows does
    // not exist here (null → the gate's fail-closed answer, which the
    // membership gate reaches first in every case in this suite).
    conversation: {
      async findUnique(args: {
        where: { id: string };
      }): Promise<{ id: string; type: string } | null> {
        return members.some((m) => m.conversationId === args.where.id)
          ? { id: args.where.id, type: 'DIRECT' }
          : null;
      },
    },
    // QC-F-359 fixture migration: block-list reads. `preferences: null`
    // is a readable empty block list ('clear' in both directions), so
    // every pre-existing frame flow keeps its behaviour; blocked
    // scenarios live in the dedicated QC-F-359 suite.
    user: {
      async findUnique(args: {
        where: { id: string };
      }): Promise<{ id: string; preferences: null }> {
        return { id: args.where.id, preferences: null };
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
// Cases — QC-F-302: the server must answer heartbeat/ping with a pong on
// the SAME socket, so the Flutter client's silence watchdog can tell a
// half-open (dead) transport from an idle-but-alive one. Before the fix
// the heartbeat branch returned silently: an idle client received ZERO
// inbound frames forever, so no honest liveness signal existed.
// ---------------------------------------------------------------------------

const isPong = (f: Frame): boolean => f.type === 'pong';

describe('QC-F-302 websocket heartbeat pong', () => {
  it('answers a heartbeat frame with a pong on the same socket', async () => {
    const { socket, frames } = await connect(makeToken('alice'), '/ws/chat');
    send(socket, { type: 'heartbeat' });
    const pong = await frames.waitFor(isPong, 'pong reply to heartbeat', 3000);
    expect(pong.type).toBe('pong');
    socket.close();
  });

  it('answers a ping frame with a pong on the same socket', async () => {
    const { socket, frames } = await connect(makeToken('alice'), '/ws/chat');
    send(socket, { type: 'ping' });
    await frames.waitFor(isPong, 'pong reply to ping', 3000);
    socket.close();
  });

  it('sends the pong only to the requesting socket, not to peers', async () => {
    const alice = await connect(makeToken('alice'), '/ws/chat');
    const bob = await connect(makeToken('bob'), '/ws/chat');
    send(alice.socket, { type: 'heartbeat' });
    await alice.frames.waitFor(isPong, 'pong for alice', 3000);
    await bob.frames.expectNone(isPong, 'pong leaked to bob', 400);
    alice.socket.close();
    bob.socket.close();
  });

  it('keeps answering repeated heartbeats (idle connection stays provably alive)', async () => {
    const { socket, frames } = await connect(makeToken('alice'), '/ws/chat');
    send(socket, { type: 'heartbeat' });
    await frames.waitFor(isPong, 'first pong', 3000);
    send(socket, { type: 'heartbeat' });
    // Second pong: wait until at least two pongs were collected.
    const deadline = Date.now() + 3000;
    for (;;) {
      const count = frames.frames.filter(isPong).length;
      if (count >= 2) break;
      if (Date.now() > deadline) {
        throw new Error(`expected 2 pongs, saw ${count}; frames: ${JSON.stringify(frames.frames)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    socket.close();
  });
});
