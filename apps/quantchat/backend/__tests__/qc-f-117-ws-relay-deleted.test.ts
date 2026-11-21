// ============================================================================
// QC-F-117 — WS `chat_message` phantom relay DELETED + REST fan-out is real
//
// Defect (P1): routes/websocket.ts fanned a member's raw `chat_message`
// client frame out as `chat.message.created.v1` with no persistence, no
// schema validation and no rate-limit — phantom messages, id-overwrite of
// real messages in the live view, and `sender:'self'` self-bubble forgery.
// The ONLY server truth in the frame was the stamped senderId.
//
// Root-cause fix: the relay branch is deleted; the frame is silently
// ignored (like any unknown frame type). Live delivery now comes ONLY from
// the persisted REST send path (`POST /conversations/:id/messages` →
// MessageService → publishConversationEvent).
//
// Companion fix (same root cause): the REST fan-out never actually reached
// local sockets — InProcessBackplane.publish was a no-op (single-node) and
// the origin-instance discard dropped REST-published events in a Redis
// cluster (only publishRoomEvent delivers inline). The phantom relay was
// papering over that hole. publishConversationEvent now stamps
// localDeliveryDone:false, the origin handler delivers+buffers those, and
// InProcessBackplane.publish hands events to the local handler (single-node
// behaves as a one-node cluster).
//
// Harness: bare Fastify + the REAL websocketRoutes plugin + REAL
// InProcessBackplane (with the QC-F-117 single-node behaviour) + REAL
// PresenceManager + a fake Prisma delegate (conversationMember.findFirst /
// findMany, conversation.findUnique, user.findUnique — the surface
// websocket.ts uses). Sockets are REAL WebSocket clients over a loopback TCP
// listener; the collector attaches synchronously at construction, before
// 'open'. Identity comes only from real signed JWTs via Sec-WebSocket-Protocol.
// ============================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { websocketRoutes } from '../routes/websocket';
import { InProcessBackplane } from '../services/realtime-backplane';
import { publishConversationEvent } from '../services/realtime-publisher';
import { PresenceManager } from '@quant/realtime/presence';

const JWT_SECRET = ['qc-f-117', 'ws-harness', 'key', '0123456789abcdef'].join('-');
const JWT_ISSUER = 'quantchat';
const JWT_AUDIENCE = 'quant-ecosystem';

// ---------------------------------------------------------------------------
// Fake Prisma — exactly the surface websocket.ts uses
// ---------------------------------------------------------------------------

interface MemberRow {
  conversationId: string;
  userId: string;
  leftAt: Date | null;
}

const MEMBERS: MemberRow[] = (
  ['conv-r1', 'conv-r2', 'conv-r3', 'conv-r4', 'conv-r5', 'conv-r6'] as const
).flatMap((conversationId) => [
  { conversationId, userId: 'alice', leftAt: null },
  { conversationId, userId: 'bob', leftAt: null },
]);

function createFakePrisma() {
  return {
    conversationMember: {
      async findFirst(args: {
        where: { conversationId: string; userId: string; leftAt: null };
      }): Promise<MemberRow | null> {
        const row = MEMBERS.find(
          (m) =>
            m.conversationId === args.where.conversationId &&
            m.userId === args.where.userId &&
            m.leftAt === null,
        );
        return row ? { ...row } : null;
      },
      async findMany(args: {
        where: { conversationId: string; leftAt: null };
      }): Promise<MemberRow[]> {
        return MEMBERS.filter(
          (m) => m.conversationId === args.where.conversationId && m.leftAt === null,
        ).map((m) => ({ ...m }));
      },
    },
    conversation: {
      async findUnique(args: {
        where: { id: string };
      }): Promise<{ id: string; type: string } | null> {
        return MEMBERS.some((m) => m.conversationId === args.where.id)
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
      async findUnique(): Promise<null> {
        return null;
      },
      async upsert(args: unknown): Promise<unknown> {
        return args;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Socket harness (same pattern as the QC-F-037 suite)
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
  event_type?: string;
  cursor?: string;
  replayed?: number;
  payload?: { content?: unknown; senderId?: unknown };
  resource_ref?: string;
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
const isAnyCreated = (f: Frame): boolean => f.event_type === 'chat.message.created.v1';
const isTyping = (f: Frame): boolean => f.event_type === 'chat.typing.v1';
const isErrorFrame = (f: Frame): boolean => f.type === 'error';

function makeToken(userId: string): string {
  const b64url = (input: string | Buffer): string =>
    Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ sub: userId, iss: JWT_ISSUER, aud: JWT_AUDIENCE, iat: now, exp: now + 3600 }),
  );
  const signature = b64url(createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

describe('QC-F-117 — WS chat_message relay deleted; REST fan-out is the real path', () => {
  let app: FastifyInstance;
  let wsBaseUrl = '';
  const openSockets: TestSocket[] = [];

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

  async function join(
    client: { socket: TestSocket; frames: FrameCollector },
    conversationId: string,
    lastEventCursor?: string,
  ): Promise<void> {
    send(client.socket, {
      type: 'join_conversation',
      conversationId,
      ...(lastEventCursor ? { last_event_cursor: lastEventCursor } : {}),
    });
    await client.frames.waitFor(isResumed, `resumed for ${conversationId}`);
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.JWT_ISSUER = JWT_ISSUER;
    process.env.JWT_AUDIENCE = JWT_AUDIENCE;

    app = Fastify({ logger: false });
    const decorate = (
      app as unknown as { decorate(name: string, value: unknown): void }
    ).decorate.bind(app);
    decorate('prisma', createFakePrisma());
    // REAL InProcessBackplane — single-node behaviour under test includes the
    // QC-F-117 fix (publish hands events to the local handler).
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

  it('case 1: member chat_message frame → silence — no live fan-out, no error, socket stays open', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');
    await join(alice, 'conv-r1');
    await join(bob, 'conv-r1');

    send(bob.socket, {
      type: 'chat_message',
      conversationId: 'conv-r1',
      content: 'phantom-r1',
      client_message_id: 'r1-1',
    });

    await alice.frames.expectNone(isCreatedWith('phantom-r1'), 'phantom fanned out to room');
    await bob.frames.expectNone(isCreatedWith('phantom-r1'), 'phantom echoed to sender');
    await bob.frames.expectNone(isErrorFrame, 'error frame for removed frame type');
    expect(bob.socket.readyState).toBe(1); // OPEN — the frame never closes the socket
  });

  it('case 2: phantom id-overwrite + sender:self forgery frames → silence', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');
    await join(alice, 'conv-r2');
    await join(bob, 'conv-r2');

    // A frame claiming the id of a "real" persisted message with hostile content…
    send(bob.socket, {
      type: 'chat_message',
      conversationId: 'conv-r2',
      id: 'msg-real-999',
      content: 'forged-overwrite-r2',
    });
    // …and a frame claiming to be the receiver's own outgoing bubble.
    send(bob.socket, {
      type: 'chat_message',
      conversationId: 'conv-r2',
      content: 'forged-self-r2',
      sender: 'self',
    });

    await alice.frames.expectNone(isCreatedWith('forged-overwrite-r2'), 'id-overwrite fanned out');
    await alice.frames.expectNone(isCreatedWith('forged-self-r2'), 'self-bubble forgery fanned out');
    await alice.frames.expectNone(isAnyCreated, 'any created event from chat_message frames');
    expect(alice.socket.readyState).toBe(1);
    expect(bob.socket.readyState).toBe(1);
  });

  it('case 3: unknown frame type → silence, socket stays open', async () => {
    const alice = await connect('alice');
    await join(alice, 'conv-r3');

    send(alice.socket, { type: 'definitely_not_a_frame', conversationId: 'conv-r3' });

    await alice.frames.expectNone(isErrorFrame, 'error frame for unknown type');
    expect(alice.socket.readyState).toBe(1);
  });

  it('case 4: the persisted REST fan-out reaches local sockets live (the real path)', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');
    await join(alice, 'conv-r4');
    await join(bob, 'conv-r4');

    // This is what POST /conversations/:id/messages does after MessageService
    // persists the row: publish the PERSISTED row's id as resourceRef.
    const envelope = await publishConversationEvent(app, 'conv-r4', {
      eventType: 'chat.message.created.v1',
      resourceRef: 'msg-persisted-r4-1',
      aggregateVersion: 1,
      data: { id: 'msg-persisted-r4-1', content: 'real-live-r4', senderId: 'alice' },
    });
    expect(envelope).not.toBeNull();

    const toBob = await bob.frames.waitFor(isCreatedWith('real-live-r4'), 'REST fan-out to peer');
    expect(toBob.payload?.senderId).toBe('alice');
    expect(toBob.resource_ref).toBe('msg-persisted-r4-1');
    const toAlice = await alice.frames.waitFor(
      isCreatedWith('real-live-r4'),
      'REST fan-out echo to sender',
    );
    expect(toAlice.payload?.senderId).toBe('alice');
  });

  it('case 5: REST fan-out enters the §20 resume buffer; chat_message frames never do', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');
    await join(alice, 'conv-r5');
    await join(bob, 'conv-r5');

    await publishConversationEvent(app, 'conv-r5', {
      eventType: 'chat.message.created.v1',
      resourceRef: 'msg-persisted-r5-1',
      aggregateVersion: 1,
      data: { id: 'msg-persisted-r5-1', content: 'real-anchor-r5', senderId: 'alice' },
    });
    const anchor = await bob.frames.waitFor(isCreatedWith('real-anchor-r5'), 'anchor live');
    expect(typeof anchor.cursor).toBe('string');

    // Phantom frames after the anchor must not pollute the buffer.
    send(bob.socket, {
      type: 'chat_message',
      conversationId: 'conv-r5',
      content: 'phantom-after-anchor-r5',
      client_message_id: 'r5-phantom',
    });
    await bob.frames.expectNone(
      isCreatedWith('phantom-after-anchor-r5'),
      'phantom entered live stream',
      300,
    );

    // A third member joining with the anchor cursor replays NOTHING (no
    // phantom), and joining from before the anchor replays the real event.
    const carol = await connect('alice'); // alice's second socket: same user, fresh socket
    send(carol.socket, {
      type: 'join_conversation',
      conversationId: 'conv-r5',
      last_event_cursor: anchor.cursor as string,
    });
    const resumed = await carol.frames.waitFor(isResumed, 'resumed at anchor cursor');
    expect(resumed.replayed).toBe(0);
    await carol.frames.expectNone(
      isCreatedWith('phantom-after-anchor-r5'),
      'phantom replayed on resume',
      300,
    );
  });

  it('case 6: resume from before the anchor replays only the missed persisted events', async () => {
    const alice = await connect('alice');
    await join(alice, 'conv-r6');

    await publishConversationEvent(app, 'conv-r6', {
      eventType: 'chat.message.created.v1',
      resourceRef: 'msg-persisted-r6-1',
      aggregateVersion: 1,
      data: { id: 'msg-persisted-r6-1', content: 'real-first-r6', senderId: 'alice' },
    });
    const first = await alice.frames.waitFor(isCreatedWith('real-first-r6'), 'first live');
    await publishConversationEvent(app, 'conv-r6', {
      eventType: 'chat.message.created.v1',
      resourceRef: 'msg-persisted-r6-2',
      aggregateVersion: 1,
      data: { id: 'msg-persisted-r6-2', content: 'real-replay-r6', senderId: 'bob' },
    });
    await alice.frames.waitFor(isCreatedWith('real-replay-r6'), 'second live');

    // A fresh socket joining with the FIRST event's cursor replays only the
    // missed (second) event — the persisted fan-out feeds §20 resume.
    const bob = await connect('bob');
    send(bob.socket, {
      type: 'join_conversation',
      conversationId: 'conv-r6',
      last_event_cursor: first.cursor as string,
    });
    const replayed = await bob.frames.waitFor(isCreatedWith('real-replay-r6'), 'missed event replayed');
    expect(replayed.payload?.senderId).toBe('bob');
    const resumed = await bob.frames.waitFor(isResumed, 'resumed after replay');
    expect(resumed.replayed).toBe(1);
    await bob.frames.expectNone(isCreatedWith('real-first-r6'), 'already-seen event replayed', 200);
  });

  it('case 7 regression: typing frames still flow (untouched by the relay removal)', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');
    await join(alice, 'conv-r1');
    await join(bob, 'conv-r1');

    send(alice.socket, { type: 'typing', conversationId: 'conv-r1', isTyping: true });
    await bob.frames.waitFor(isTyping, 'typing indicator still fanned out');
  });
});
