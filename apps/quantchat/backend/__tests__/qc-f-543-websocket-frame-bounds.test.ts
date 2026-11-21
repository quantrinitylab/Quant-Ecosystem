// ============================================================================
// QC-F-543 — WebSocket frame-layer bounds regression suite
//
// Defect (P2): routes/websocket.ts authenticated the upgrade and gated every
// frame on membership, but the FRAME LAYER was unbounded:
//   * the plugin was registered with no options, so the ws library default
//     maxPayload of 100 MiB was the only per-message size limit;
//   * the /chat config.rateLimit counts only the HTTP upgrade — frames had
//     no per-socket rate budget;
//   * per-socket processing was an unbounded promise chain whose closures
//     retained every queued raw frame, so slow DB-backed gates let one
//     socket park unlimited queued DB work + memory.
//
// Fix (specialist-qc-f-543-buildprep.md, band Slice-1):
//   * maxPayload 64 KiB (largest legitimate frame ≈40.2 KiB: REST-parity
//     10,000-char content) — oversize closes with 1009 at the transport;
//   * global admission token bucket 200 burst / 50 per-sec — over the cap:
//     RATE_LIMITED error frame + close 1008;
//   * durable sub-bucket (chat_message + receipts) 64 burst / 10 per-sec,
//     checked after parse, before any gate — over the cap: frame dropped
//     with a RATE_LIMITED error frame, socket stays open;
//   * queue-depth cap 64 pending — over the cap: QUEUE_OVERFLOW error
//     frame + close 1013, and already-queued frames skip their DB work.
//
// Harness mirrors qc-f-302-websocket-pong.test.ts: bare Fastify + the REAL
// websocketRoutes plugin + REAL InProcessBackplane + REAL PresenceManager +
// a fake Prisma whose conversationMember.findFirst delay is test-controlled
// (the queue test is meaningless without it) and whose call counts are
// observable (the receipt-flood test's bound is proven on call counts, not
// on impressions). Identity comes only from real signed JWTs via the
// Sec-WebSocket-Protocol header. NC tests FAIL on the original code and
// PASS on the fix; CT tests pass on both (ordinary traffic unchanged).
// ============================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { websocketRoutes } from '../routes/websocket';
import { InProcessBackplane } from '../services/realtime-backplane';
import { PresenceManager } from '@quant/realtime/presence';

const JWT_SECRET = 'qc-f-543-test-secret-0123456789abcdef';
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
  const messages = new Map<string, { conversationId: string; senderId: string }>();
  const counters = { findFirst: 0, findUniqueMessage: 0, upsert: 0 };
  const state = { findFirstDelayMs: 0 };
  const key = (messageId: string, userId: string): string => `${messageId}|${userId}`;
  return {
    conversationMember: {
      async findFirst(args: {
        where: { conversationId: string; userId: string; leftAt: null };
      }): Promise<MemberRow | null> {
        counters.findFirst++;
        if (state.findFirstDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, state.findFirstDelayMs));
        }
        const row = members.find(
          (m) =>
            m.conversationId === args.where.conversationId &&
            m.userId === args.where.userId &&
            (args.where.leftAt !== null || m.leftAt === null),
        );
        return row ? { ...row } : null;
      },
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
    conversation: {
      async findUnique(args: {
        where: { id: string };
      }): Promise<{ id: string; type: string } | null> {
        return members.some((m) => m.conversationId === args.where.id)
          ? { id: args.where.id, type: 'DIRECT' }
          : null;
      },
    },
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
        counters.upsert++;
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
    message: {
      async findUnique(args: {
        where: { id: string };
      }): Promise<{ conversationId: string; senderId: string } | null> {
        counters.findUniqueMessage++;
        return messages.get(args.where.id) ?? null;
      },
    },
    __deliveries: deliveries,
    __messages: messages,
    __counters: counters,
    __state: state,
    __resetCounters(): void {
      counters.findFirst = 0;
      counters.findUniqueMessage = 0;
      counters.upsert = 0;
    },
  };
}

type FakePrisma = ReturnType<typeof createFakePrisma>;

const JOIN_CONVS = Array.from({ length: 100 }, (_, i) => `conv-j-${i}`);
const MEMBERS: MemberRow[] = [
  ...['conv-f543-a', 'conv-f543-r', ...JOIN_CONVS].flatMap((conversationId) => [
    { conversationId, userId: 'alice', leftAt: null },
    { conversationId, userId: 'bob', leftAt: null },
  ]),
];

// ---------------------------------------------------------------------------
// WS test client — Node's built-in WebSocket over a real loopback listener
// ---------------------------------------------------------------------------

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
  payload?: { content?: unknown; senderId?: unknown; userId?: unknown; receipt?: unknown };
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

  async waitFor(pred: (frame: Frame) => boolean, label: string, timeoutMs = 5000): Promise<Frame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.frames.find(pred);
      if (hit) return hit;
      if (Date.now() > deadline) {
        throw new Error(
          `timed out waiting for ${label}; frames seen: ${JSON.stringify(this.frames.slice(0, 20))} (total ${this.frames.length})`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async waitForCount(
    pred: (frame: Frame) => boolean,
    count: number,
    label: string,
    timeoutMs = 6000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const seen = this.frames.filter(pred).length;
      if (seen >= count) return;
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${count} × ${label}; saw ${seen}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async expectNone(pred: (frame: Frame) => boolean, label: string, settleMs = 500): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    const hit = this.frames.find(pred);
    expect(hit, `expected no frame matching ${label}, got ${JSON.stringify(hit)}`).toBeUndefined();
  }

  waitClose(timeoutMs = 6000): Promise<number> {
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

const isErrorCode = (code: string) => (f: Frame): boolean =>
  f.type === 'error' && f.code === code;
const isResumed = (f: Frame): boolean => f.type === 'resumed';
const isPong = (f: Frame): boolean => f.type === 'pong';
const isCreatedWith = (content: string) => (f: Frame): boolean =>
  f.event_type === 'chat.message.created.v1' && f.payload?.content === content;

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let fakePrisma: FakePrisma;
const openSockets: TestSocket[] = [];

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

async function connect(
  token: string,
): Promise<{ socket: TestSocket; frames: FrameCollector }> {
  const frames = new FrameCollector();
  const raw = new NativeWebSocket(`${wsBaseUrl}/ws/chat`, token ? [token] : undefined);
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

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Join a room and wait for the server's resumed frame (join proof). */
async function joinAndWait(
  socket: TestSocket,
  frames: FrameCollector,
  conversationId: string,
): Promise<void> {
  const before = frames.frames.filter(isResumed).length;
  send(socket, { type: 'join_conversation', conversationId });
  await frames.waitForCount(isResumed, before + 1, `resumed for ${conversationId}`);
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.JWT_ISSUER = JWT_ISSUER;
  process.env.JWT_AUDIENCE = JWT_AUDIENCE;
  // The band defaults are what this suite proves; make sure no ambient env
  // lever from the host shell silently rewrites the numbers under test.
  for (const name of [
    'QC_WS_MAX_PAYLOAD_BYTES',
    'QC_WS_FRAME_BURST',
    'QC_WS_FRAME_REFILL_PER_SEC',
    'QC_WS_DURABLE_BURST',
    'QC_WS_DURABLE_REFILL_PER_SEC',
    'QC_WS_QUEUE_MAX',
  ]) {
    delete process.env[name];
  }

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
  (app.server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  await app.close();
});

// ---------------------------------------------------------------------------
// NC — negative controls: each FAILS on the original code, PASSES fixed
// ---------------------------------------------------------------------------

describe('QC-F-543 NC — frame bounds exist', () => {
  it('NC-543-1: a 100 KiB frame is rejected at the transport with close 1009', async () => {
    const { socket, frames } = await connect(makeToken('alice'));
    socket.send('x'.repeat(100 * 1024));
    const code = await frames.waitClose();
    expect(code).toBe(1009);
  });

  it('NC-543-1b: a frame one byte over the 64 KiB cap is rejected with close 1009', async () => {
    const { socket, frames } = await connect(makeToken('alice'));
    socket.send('x'.repeat(65_537));
    const code = await frames.waitClose();
    expect(code).toBe(1009);
  });

  it('NC-543-2: a 300-frame burst trips the global bucket — RATE_LIMITED + close 1008', async () => {
    const { socket, frames } = await connect(makeToken('alice'));
    for (let i = 0; i < 300; i++) {
      send(socket, { type: 'typing', conversationId: 'conv-f543-a', isTyping: true });
    }
    const err = await frames.waitFor(isErrorCode('RATE_LIMITED'), 'RATE_LIMITED error frame');
    expect(err.message).toBe('Too many frames');
    const code = await frames.waitClose();
    expect(code).toBe(1008);
  });

  it('NC-543-3: durable flood is dropped with RATE_LIMITED, socket stays open, refill recovers', async () => {
    const alice = await connect(makeToken('alice'));
    const bob = await connect(makeToken('bob'));
    await joinAndWait(alice.socket, alice.frames, 'conv-f543-a');
    await joinAndWait(bob.socket, bob.frames, 'conv-f543-a');

    // Flood size is load-robust by construction (resume-run root cause):
    // the durable check runs at the head of the serial per-socket queue,
    // so while a burst is being processed the bucket keeps refilling at
    // 10/sec — a 70-frame flood can be fully absorbed on a loaded host
    // (processing ≥0.6s refills the 6 tokens the tail needs), which made
    // the original 70-frame version intermittently see ZERO drops. With
    // 130 frames the bound holds at any plausible pace: published frames
    // can never exceed burst (64) + refill over the measured window, and
    // at least 5 drops are guaranteed unless processing exceeds ~6s.
    const FLOOD = 130;
    const floodStartedAt = Date.now();
    for (let i = 0; i < FLOOD; i++) {
      send(alice.socket, {
        type: 'chat_message',
        conversationId: 'conv-f543-a',
        content: `over-${i}`,
      });
    }
    // The first burst frame publishes; frames past the durable burst (64)
    // are dropped at the bucket, before any membership/DB gate.
    await bob.frames.waitFor(isCreatedWith('over-0'), 'first burst message published');
    await alice.frames.waitForCount(
      isErrorCode('RATE_LIMITED'),
      5,
      'durable RATE_LIMITED drops',
      8000,
    );
    // Suppression is proven on a refill-aware count bound, not on one
    // chosen tail frame: published ≤ 64 + 10/sec over the flood window
    // (+5 slack) — on the original code ALL 130 publish and no
    // RATE_LIMITED frame ever arrives, so this still fails there.
    await sleep(600);
    const elapsedSec = (Date.now() - floodStartedAt) / 1000;
    const published = bob.frames.frames.filter(
      (f) => f.event_type === 'chat.message.created.v1' && String(f.payload?.content ?? '').startsWith('over-'),
    ).length;
    expect(published).toBeLessThanOrEqual(64 + Math.ceil(elapsedSec * 10) + 5);
    expect(published).toBeLessThan(FLOOD);
    expect(alice.frames.closeCode).toBeNull();
    expect(alice.socket.readyState).toBe(1);

    // Bucket refills at 10/sec: after ~1.2s a normal message publishes again.
    await sleep(1200);
    send(alice.socket, {
      type: 'chat_message',
      conversationId: 'conv-f543-a',
      content: 'after-refill',
    });
    await bob.frames.waitFor(isCreatedWith('after-refill'), 'post-refill message published');
    alice.socket.close();
    bob.socket.close();
  });

  it('NC-543-4: slow DB + 150 durable frames trips the queue cap — QUEUE_OVERFLOW + close 1013, DB work stops', async () => {
    fakePrisma.__state.findFirstDelayMs = 100;
    try {
      const alice = await connect(makeToken('alice'));
      await joinAndWait(alice.socket, alice.frames, 'conv-f543-a');
      fakePrisma.__resetCounters();
      for (let i = 0; i < 150; i++) {
        send(alice.socket, {
          type: 'chat_message',
          conversationId: 'conv-f543-a',
          content: `q-${i}`,
        });
      }
      const err = await alice.frames.waitFor(
        isErrorCode('QUEUE_OVERFLOW'),
        'QUEUE_OVERFLOW error frame',
      );
      expect(err.message).toBe('Too many pending frames');
      const code = await alice.frames.waitClose();
      expect(code).toBe(1013);
      // The queued backlog must NOT keep doing DB work behind a closed
      // socket: the membership-gate call count is bounded far below the
      // 150 frames sent, and it stops moving entirely once tripped.
      const settled = fakePrisma.__counters.findFirst;
      expect(settled).toBeLessThanOrEqual(70);
      await sleep(600);
      expect(fakePrisma.__counters.findFirst).toBe(settled);
    } finally {
      fakePrisma.__state.findFirstDelayMs = 0;
    }
  });

  it('NC-543-5: a 200 read-receipt burst cannot drive unbounded DB work (durable bucket bound)', async () => {
    const alice = await connect(makeToken('alice'));
    const bob = await connect(makeToken('bob'));
    await joinAndWait(alice.socket, alice.frames, 'conv-f543-r');
    await joinAndWait(bob.socket, bob.frames, 'conv-f543-r');
    for (let i = 0; i < 200; i++) {
      fakePrisma.__messages.set(`msg-r-${i}`, {
        conversationId: 'conv-f543-r',
        senderId: 'alice',
      });
    }
    fakePrisma.__resetCounters();
    const burstStartedAt = Date.now();
    for (let i = 0; i < 200; i++) {
      send(bob.socket, {
        type: 'read_receipt',
        conversationId: 'conv-f543-r',
        messageId: `msg-r-${i}`,
      });
    }
    await sleep(900);
    // Original code: every one of the 200 frames runs the fresh membership
    // gate + binding lookup + receipt upsert. Fixed: frames past the
    // durable burst are dropped before any gate — observable call counts
    // stay at the burst-plus-refill scale, never near 200. The bounds are
    // refill-aware (resume-run root cause): the check sits at the head of
    // the serial queue, so a loaded host refills tokens while the burst
    // drains; the honest invariant is admitted ≤ 64 + 10/sec × elapsed
    // (+ slack), with an absolute ceiling far below the 200 sent. The
    // earlier fixed ceilings (≥100 drops, ≤80 calls) intermittently
    // failed under full-suite load for exactly that reason. The drop
    // OBSERVATION window is load-scaled for the same reason: drops are
    // emitted at the head of the serial queue, so under full-suite CPU
    // contention the queue drains far slower and 60 drops can take well
    // over 6s to OBSERVE (standalone they arrive in <1s) — the window
    // bounds patience, never the invariant: the counter assertions below
    // stay exactly as strict, and on original code zero drops ever arrive,
    // so the negative control still fails at any window size.
    await bob.frames.waitForCount(isErrorCode('RATE_LIMITED'), 60, 'receipt drops', 20000);
    const elapsedSec = (Date.now() - burstStartedAt) / 1000;
    const admissionBound = 64 + Math.ceil(elapsedSec * 10) + 10;
    expect(fakePrisma.__counters.findFirst).toBeLessThanOrEqual(admissionBound);
    expect(fakePrisma.__counters.findFirst).toBeLessThanOrEqual(150);
    expect(fakePrisma.__deliveries.size).toBeGreaterThan(0);
    expect(fakePrisma.__deliveries.size).toBeLessThanOrEqual(admissionBound);
    alice.socket.close();
    bob.socket.close();
  });
});

// ---------------------------------------------------------------------------
// CT — controls: ordinary traffic is unchanged (pass before AND after)
// ---------------------------------------------------------------------------

describe('QC-F-543 CT — ordinary traffic unchanged', () => {
  it('CT-543-1: a normal chat_message still publishes to the room', async () => {
    const alice = await connect(makeToken('alice'));
    const bob = await connect(makeToken('bob'));
    await joinAndWait(alice.socket, alice.frames, 'conv-f543-a');
    await joinAndWait(bob.socket, bob.frames, 'conv-f543-a');
    send(alice.socket, {
      type: 'chat_message',
      conversationId: 'conv-f543-a',
      content: 'hello-bounds',
    });
    const frame = await bob.frames.waitFor(isCreatedWith('hello-bounds'), 'chat event for bob');
    expect(frame.payload?.senderId).toBe('alice');
    alice.socket.close();
    bob.socket.close();
  });

  it('CT-543-2: the largest legitimate frame (10,000 emoji ≈ 40 KiB) publishes intact', async () => {
    const alice = await connect(makeToken('alice'));
    const bob = await connect(makeToken('bob'));
    await joinAndWait(alice.socket, alice.frames, 'conv-f543-a');
    await joinAndWait(bob.socket, bob.frames, 'conv-f543-a');
    const content = '😀'.repeat(10_000);
    send(alice.socket, { type: 'chat_message', conversationId: 'conv-f543-a', content });
    const frame = await bob.frames.waitFor(isCreatedWith(content), 'max-size chat event', 6000);
    expect(frame.payload?.content).toBe(content);
    alice.socket.close();
    bob.socket.close();
  });

  it('CT-543-3: heartbeat still gets its pong (QC-F-302 behaviour intact)', async () => {
    const { socket, frames } = await connect(makeToken('alice'));
    send(socket, { type: 'heartbeat' });
    await frames.waitFor(isPong, 'pong reply');
    socket.close();
  });

  it('CT-543-4: a 100-join reconnect resubscribe burst all takes effect — joins are not drop-throttled', async () => {
    const alice = await connect(makeToken('alice'));
    const bob = await connect(makeToken('bob'));
    for (const conversationId of JOIN_CONVS) {
      send(alice.socket, { type: 'join_conversation', conversationId });
      send(bob.socket, { type: 'join_conversation', conversationId });
    }
    await alice.frames.waitForCount(isResumed, 100, 'alice joins', 8000);
    await bob.frames.waitForCount(isResumed, 100, 'bob joins', 8000);
    await alice.frames.expectNone(isErrorCode('RATE_LIMITED'), 'join RATE_LIMITED', 300);
    await alice.frames.expectNone(isErrorCode('QUEUE_OVERFLOW'), 'join QUEUE_OVERFLOW', 100);
    // First and last joins are both effective: messages flow in both rooms.
    send(alice.socket, {
      type: 'chat_message',
      conversationId: 'conv-j-0',
      content: 'first-room',
    });
    send(alice.socket, {
      type: 'chat_message',
      conversationId: 'conv-j-99',
      content: 'last-room',
    });
    await bob.frames.waitFor(isCreatedWith('first-room'), 'message in first joined room');
    await bob.frames.waitFor(isCreatedWith('last-room'), 'message in last joined room');
    alice.socket.close();
    bob.socket.close();
  });

  it('CT-543-5: a bulk burst of 50 read receipts is recorded in full (inside the durable burst)', async () => {
    const alice = await connect(makeToken('alice'));
    const bob = await connect(makeToken('bob'));
    await joinAndWait(alice.socket, alice.frames, 'conv-f543-r');
    await joinAndWait(bob.socket, bob.frames, 'conv-f543-r');
    for (let i = 0; i < 50; i++) {
      fakePrisma.__messages.set(`msg-b-${i}`, {
        conversationId: 'conv-f543-r',
        senderId: 'alice',
      });
      send(bob.socket, {
        type: 'read_receipt',
        conversationId: 'conv-f543-r',
        messageId: `msg-b-${i}`,
      });
    }
    const deadline = Date.now() + 5000;
    for (;;) {
      const recorded = Array.from({ length: 50 }, (_, i) => `msg-b-${i}|bob`).filter((k) =>
        fakePrisma.__deliveries.has(k),
      ).length;
      if (recorded === 50) break;
      if (Date.now() > deadline) {
        throw new Error(`expected 50 recorded receipts, saw ${recorded}`);
      }
      await sleep(20);
    }
    await bob.frames.expectNone(isErrorCode('RATE_LIMITED'), 'bulk receipt RATE_LIMITED', 200);
    alice.socket.close();
    bob.socket.close();
  });

  it('CT-543-6: auth + membership gates unchanged — no JWT closes 4001, non-member frame gets NOT_A_MEMBER', async () => {
    const anon = await connect('');
    const anonCode = await anon.frames.waitClose();
    expect(anonCode).toBe(4001);

    const alice = await connect(makeToken('alice'));
    send(alice.socket, {
      type: 'chat_message',
      conversationId: 'conv-f543-x',
      content: 'not-a-member',
    });
    const err = await alice.frames.waitFor(
      (f) => isErrorCode('NOT_A_MEMBER')(f) && f.conversationId === 'conv-f543-x',
      'NOT_A_MEMBER for foreign conversation',
    );
    expect(err.type).toBe('error');
    alice.socket.close();
  });
});
