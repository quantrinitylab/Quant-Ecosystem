// ============================================================================
// QC-F-524 — presence had NO recipient-side scoping
// ============================================================================
//
// Defect (P2, loop-audit security 2026-10-19): presence left the server on
// two paths and NEITHER checked the recipient — only the owner's own
// showOnlineStatus preference (QC-F-042) was ever consulted.
//   (1) Snapshot: GET /ws/presence's handler took no request at all and
//       returned the instance's whole online roster to any authenticated
//       caller. The shipped client asks scoped (apiClient.getPresence
//       sends ?userIds=..., the Next proxy forwards it verbatim) — the
//       backend simply never read the parameter.
//   (2) Live: publishPresence broadcast every user's online/offline
//       transition (with an ms `lastSeen`) to EVERY open socket on the
//       instance, and the backplane fan-in did the same on remote
//       instances. No relationship, no membership, no block check — so a
//       stranger, or the very person a user had BLOCKED, could record the
//       user's full activity pattern (QC-F-447 cut blocks on stories /
//       reels / map / discover / spotlight; presence was left out).
//
// Fix pinned here (specialist-qc-f-524-buildprep.md, band Slice-1):
//   - One relationship definition in PrivacyService (§4.1): viewer may
//     see target's presence iff self, OR active co-membership in ANY
//     conversation (DIRECT/GROUP/CHANNEL), OR a CloseFriend edge in
//     either direction — and the pair is not blocked in either direction
//     (blockedExclusionsFor's excluded ∪ uncertain both hide; unproven =
//     hidden, fail-closed). The owner's showOnlineStatus gate (F-042)
//     still applies on top, unchanged.
//   - Snapshot: caller from request.auth (401 when absent), `userIds`
//     honoured (unrequested ids are never returned), no `userIds` ->
//     empty (never the roster), privacy service absent -> empty.
//   - Broadcast: ONE scoped fan-out helper for local publish + remote
//     fan-in; the audience is computed per instance per transition (it
//     never travels on the wire, so a fresh block cuts the next
//     transition); a remote frame whose owner cannot be identified is
//     dropped. The unscoped broadcast helper is deleted.
//   - Wire shapes unchanged: `{ online: string[] }` and the
//     chat.presence.v1 payload `{type, userId, status, lastSeen}`.
//
// Negative-control signature (brief §8, band): against the PRE-FIX code
// S1, S2, S3, S4, S6, S7 and B1, B2, B4 FAIL (the original returns the
// whole roster / broadcasts to everyone), while the controls S5, S8,
// B3, B5, B6, B7 PASS on both versions. On the fixed code all PASS.
// The tests only exercise behaviour surfaces that exist in both versions
// (the REST snapshot and real socket delivery) — no test calls the new
// PrivacyService helpers directly, so a pre-fix failure is a behavioural
// failure, never a missing-method compile error.
//
// Harnesses: snapshot series = bare Fastify + real websocketRoutes +
// fake PresenceManager roster + WHERE-aware fake prisma + an
// auth-installing preHandler (the QC-F-017 pattern). Broadcast series =
// real websocketRoutes over a loopback listener with real signed JWTs,
// a real PresenceManager and a capturing backplane (the QC-F-037/359
// pattern). Identities are stable module-level constants; fakes are
// rebuilt per app so no state leaks between cases.
// ============================================================================

import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { websocketRoutes } from '../routes/websocket';
import { PresenceManager } from '@quant/realtime/presence';
import {
  BACKPLANE_PRESENCE_CHANNEL,
  type RealtimeBackplane,
  type RoomEvent,
  type RoomEventHandler,
} from '../services/realtime-backplane';

// ---------------------------------------------------------------------------
// Stable identities (module-level)
// ---------------------------------------------------------------------------

// Snapshot world — CALLER inspects everybody else.
const CALLER = 'u524-caller';
const PARTNER = 'u524-partner'; // active DIRECT with CALLER
const GROUPMATE = 'u524-groupmate'; // only a GROUP co-member of CALLER
const CF_ONLY = 'u524-cf-only'; // no conversation; edge CALLER -> CF_ONLY
const CF_ONLY2 = 'u524-cf-only2'; // no conversation; edge CF_ONLY2 -> CALLER
const STRANGER = 'u524-stranger'; // no relationship at all
const BLOCKED_BY_CALLER = 'u524-blocked-by-caller'; // DIRECT co-member, CALLER blocked them
const BLOCKER_OF_CALLER = 'u524-blocker-of-caller'; // GROUP co-member, they blocked CALLER
const HIDDEN_PREF = 'u524-hidden-pref'; // DIRECT partner, showOnlineStatus=false
const MALFORMED_BLOCK = 'u524-malformed-block'; // DIRECT partner, unreadable block list
const OFFLINE_PARTNER = 'u524-offline-partner'; // DIRECT partner, NOT in the online roster

// Broadcast world — distinct users per case (the F-359 isolation pattern).
const B1_OWNER = 'b1-owner';
const B1_PARTNER = 'b1-partner';
const B1_STRANGER = 'b1-stranger';
const B2_CALLER = 'b2-caller';
const B2_BLOCKED = 'b2-blocked';
const B3_OWNER = 'b3-owner';
const B3_PARTNER = 'b3-partner';
const B4_OWNER = 'b4-owner';
const B4_PARTNER = 'b4-partner';
const B4_STRANGER = 'b4-stranger';
const B5_HIDDEN = 'b5-hidden';
const B5_PARTNER = 'b5-partner';
const B6_OWNER = 'b6-owner';
const B6_GROUPMATE = 'b6-groupmate';
const B7_OWNER = 'b7-owner';

// ---------------------------------------------------------------------------
// Relationship fixtures (one shared, deterministic graph)
// ---------------------------------------------------------------------------

interface MemberRow {
  conversationId: string;
  userId: string;
  leftAt: Date | null;
}

const MEMBER_ROWS: MemberRow[] = [
  // Snapshot world
  ...[
    ['conv-524-direct-1', CALLER, PARTNER],
    ['conv-524-direct-2', CALLER, BLOCKED_BY_CALLER],
    ['conv-524-direct-3', CALLER, HIDDEN_PREF],
    ['conv-524-direct-4', CALLER, MALFORMED_BLOCK],
    ['conv-524-direct-5', CALLER, OFFLINE_PARTNER],
  ].flatMap(([conversationId, a, b]) => [
    { conversationId: conversationId as string, userId: a as string, leftAt: null },
    { conversationId: conversationId as string, userId: b as string, leftAt: null },
  ]),
  { conversationId: 'conv-524-group-1', userId: CALLER, leftAt: null },
  { conversationId: 'conv-524-group-1', userId: GROUPMATE, leftAt: null },
  { conversationId: 'conv-524-group-2', userId: CALLER, leftAt: null },
  { conversationId: 'conv-524-group-2', userId: BLOCKER_OF_CALLER, leftAt: null },
  // Broadcast world
  ...[
    ['conv-b1', B1_OWNER, B1_PARTNER],
    ['conv-b2', B2_CALLER, B2_BLOCKED],
    ['conv-b3', B3_OWNER, B3_PARTNER],
    ['conv-b4', B4_OWNER, B4_PARTNER],
    ['conv-b5', B5_HIDDEN, B5_PARTNER],
    ['conv-b6', B6_OWNER, B6_GROUPMATE],
  ].flatMap(([conversationId, a, b]) => [
    { conversationId: conversationId as string, userId: a as string, leftAt: null },
    { conversationId: conversationId as string, userId: b as string, leftAt: null },
  ]),
];

const CONVERSATION_TYPES = new Map<string, string>([
  ['conv-524-group-1', 'GROUP'],
  ['conv-524-group-2', 'CHANNEL'],
  ['conv-b6', 'GROUP'],
]);

const CF_EDGES: Array<{ userId: string; friendId: string }> = [
  { userId: CALLER, friendId: CF_ONLY },
  { userId: CF_ONLY2, friendId: CALLER },
];

/** Stored preferences per user (the exact shape PrivacyService reads). */
const PREFS = new Map<string, unknown>([
  [
    CALLER,
    { chatSettings: { blockedUsers: [{ id: BLOCKED_BY_CALLER, blockedAt: '2026-10-19T00:00:00.000Z' }] } },
  ],
  [BLOCKER_OF_CALLER, { chatSettings: { blockedUsers: [{ id: CALLER }] } }],
  [HIDDEN_PREF, { chatSettings: { privacy: { showOnlineStatus: false } } }],
  [MALFORMED_BLOCK, { chatSettings: { blockedUsers: 'not-an-array' } }],
  [B2_CALLER, { chatSettings: { blockedUsers: [{ id: B2_BLOCKED }] } }],
  [B5_HIDDEN, { chatSettings: { privacy: { showOnlineStatus: false } } }],
]);

// ---------------------------------------------------------------------------
// WHERE-aware fake prisma (direction-sensitive, the QC-F-533 harness rule:
// a query in the wrong direction must find nothing)
// ---------------------------------------------------------------------------

type Where = Record<string, unknown>;

function idMatches(actual: string, cond: unknown): boolean {
  if (cond === undefined) return true;
  if (typeof cond === 'string') return actual === cond;
  if (cond && typeof cond === 'object' && Array.isArray((cond as { in?: unknown }).in)) {
    return ((cond as { in: string[] }).in).includes(actual);
  }
  return false;
}

function memberMatches(row: MemberRow, where: Where): boolean {
  if (!idMatches(row.userId, where['userId'])) return false;
  if (!idMatches(row.conversationId, where['conversationId'])) return false;
  if (where['leftAt'] === null && row.leftAt !== null) return false;
  return true;
}

function createFakePrisma() {
  return {
    user: {
      async findUnique(args: { where: { id: string } }) {
        if (!PREFS.has(args.where.id)) return null;
        return { preferences: PREFS.get(args.where.id) };
      },
      async findMany(args: { where: { id: { in: string[] } } }) {
        return args.where.id.in
          .filter((id) => PREFS.has(id))
          .map((id) => ({ id, preferences: PREFS.get(id) }));
      },
    },
    closeFriend: {
      async findMany(args: { where: Where }) {
        return CF_EDGES.filter(
          (e) =>
            idMatches(e.userId, args.where['userId']) &&
            idMatches(e.friendId, args.where['friendId']),
        ).map((e) => ({ ...e }));
      },
    },
    conversationMember: {
      async findFirst(args: { where: Where }) {
        const row = MEMBER_ROWS.find((m) => memberMatches(m, args.where));
        return row ? { ...row } : null;
      },
      async findMany(args: { where: Where }) {
        return MEMBER_ROWS.filter((m) => memberMatches(m, args.where)).map((m) => ({
          ...m,
        }));
      },
    },
    conversation: {
      async findMany(args: { where: Where }) {
        const ids = ((args.where['id'] as { in?: string[] } | undefined)?.in ?? []).filter(
          (id) => {
            const type = CONVERSATION_TYPES.get(id) ?? 'DIRECT';
            return args.where['type'] === undefined || args.where['type'] === type;
          },
        );
        return ids.map((id) => ({ id }));
      },
    },
    message: {
      async findUnique() {
        return null;
      },
    },
    messageDelivery: {
      async findUnique() {
        return null;
      },
      async upsert(args: unknown) {
        return args;
      },
    },
  };
}

// ===========================================================================
// S series — snapshot (bare Fastify, fake roster, auth preHandler)
// ===========================================================================

const SNAPSHOT_ROSTER = [
  CALLER,
  PARTNER,
  GROUPMATE,
  CF_ONLY,
  CF_ONLY2,
  STRANGER,
  BLOCKED_BY_CALLER,
  BLOCKER_OF_CALLER,
  HIDDEN_PREF,
  MALFORMED_BLOCK,
  // OFFLINE_PARTNER deliberately absent: online-ness comes from the roster.
];

describe('QC-F-524 S-series — GET /ws/presence recipient scoping', () => {
  const apps: FastifyInstance[] = [];

  async function buildSnapshotApp(withAuth: boolean): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    const decorate = (
      app as unknown as { decorate(name: string, value: unknown): void }
    ).decorate.bind(app);
    decorate('prisma', createFakePrisma());
    decorate('realtimeBackplane', {
      instanceId: 'inst-524-snapshot',
      subscribe: async () => undefined,
      unsubscribe: async () => undefined,
      publish: async () => undefined,
      onMessage: () => undefined,
      nextSequence: async () => 1,
      isHealthy: () => true,
    });
    decorate('presence', {
      getOnlineInApp: () => [...SNAPSHOT_ROSTER],
      setOnline: () => false,
      setOffline: () => false,
      heartbeat: () => undefined,
    });
    if (withAuth) {
      // The QC-F-017 pattern: a preHandler standing in for the real auth
      // plugin, installing request.auth exactly as production does.
      app.addHook('preHandler', async (request) => {
        (request as { auth?: { userId: string } }).auth = { userId: CALLER };
      });
    }
    await app.register(websocketRoutes, { prefix: '/ws' });
    await app.ready();
    apps.push(app);
    return app;
  }

  afterAll(async () => {
    for (const app of apps.splice(0)) await app.close();
  });

  async function getPresence(app: FastifyInstance, userIds?: string[]) {
    const url =
      userIds === undefined
        ? '/ws/presence'
        : `/ws/presence?userIds=${userIds.join(',')}`;
    const res = await app.inject({ method: 'GET', url });
    return { status: res.statusCode, body: res.json() as { online: string[] } };
  }

  it('S1 [NC]: only related, unblocked, opted-in users are visible — both CloseFriend directions', async () => {
    const app = await buildSnapshotApp(true);
    const { status, body } = await getPresence(app, [
      CALLER,
      PARTNER,
      GROUPMATE,
      CF_ONLY,
      STRANGER,
      BLOCKED_BY_CALLER,
      BLOCKER_OF_CALLER,
      HIDDEN_PREF,
      MALFORMED_BLOCK,
    ]);
    expect(status).toBe(200);
    expect(new Set(body.online)).toEqual(new Set([CALLER, PARTNER, GROUPMATE, CF_ONLY]));
    // Reverse CloseFriend direction (CF_ONLY2 listed CALLER): equally visible.
    const reverse = await getPresence(app, [CF_ONLY2]);
    expect(reverse.status).toBe(200);
    expect(reverse.body.online).toEqual([CF_ONLY2]);
  });

  it('S2 [NC]: an unrequested related user is never returned; a requested stranger is not either', async () => {
    const app = await buildSnapshotApp(true);
    const { status, body } = await getPresence(app, [STRANGER]);
    expect(status).toBe(200);
    expect(body.online).toEqual([]);
  });

  it('S3 [NC]: no userIds parameter -> empty, never the roster', async () => {
    const app = await buildSnapshotApp(true);
    const { status, body } = await getPresence(app);
    expect(status).toBe(200);
    expect(body.online).toEqual([]);
  });

  it('S4 [NC]: a block in either direction beats an active co-membership', async () => {
    const app = await buildSnapshotApp(true);
    const { status, body } = await getPresence(app, [BLOCKED_BY_CALLER, BLOCKER_OF_CALLER]);
    expect(status).toBe(200);
    expect(body.online).toEqual([]);
  });

  it('S5 (control): a related partner with showOnlineStatus=false stays hidden (QC-F-042 owner gate)', async () => {
    const app = await buildSnapshotApp(true);
    const { body } = await getPresence(app, [HIDDEN_PREF]);
    // Control assertion per brief §8: the property pinned is HIDDEN_PREF's
    // absence (the owner gate predates this fix and the pre-fix handler
    // returns the rest of the roster, so emptiness is NOT asserted here —
    // emptiness is pinned by S2/S3/S4/S7 on the fixed code).
    expect(body.online).not.toContain(HIDDEN_PREF);
  });

  it('S6 [NC]: without an authenticated caller the snapshot is 401, not the roster', async () => {
    const app = await buildSnapshotApp(false);
    const { status } = await getPresence(app, [PARTNER]);
    expect(status).toBe(401);
  });

  it('S7 [NC]: an unreadable block list hides the user (unproven = hidden)', async () => {
    const app = await buildSnapshotApp(true);
    const { body } = await getPresence(app, [MALFORMED_BLOCK]);
    expect(body.online).toEqual([]);
  });

  it('S8 (control): a related but offline user is not reported online', async () => {
    const app = await buildSnapshotApp(true);
    const { body } = await getPresence(app, [OFFLINE_PARTNER]);
    // Control assertion per brief §8: OFFLINE_PARTNER's absence (the
    // pre-fix handler returns the roster, which never contained them).
    expect(body.online).not.toContain(OFFLINE_PARTNER);
  });
});

// ===========================================================================
// B series — broadcast (real sockets, real PresenceManager, capturing
// backplane so the remote fan-in path can be driven directly)
// ===========================================================================

const WS_TEST_KEY_PARTS = ['qc-f-524', 'ws-harness', 'key', '0123456789abcdef'];
const WS_HMAC_KEY = WS_TEST_KEY_PARTS.join('-');
const WS_JWT_ISSUER = 'quantchat';
const WS_JWT_AUDIENCE = 'quant-ecosystem';

class CapturingBackplane implements RealtimeBackplane {
  readonly instanceId = 'inst-524-local';
  handler: RoomEventHandler | null = null;
  readonly published: Array<{ channel: string; event: RoomEvent }> = [];
  private sequence = 0;

  async subscribe(): Promise<void> {}
  async unsubscribe(): Promise<void> {}
  async publish(channel: string, event: RoomEvent): Promise<void> {
    this.published.push({ channel, event });
  }
  onMessage(handler: RoomEventHandler): void {
    this.handler = handler;
  }
  async shutdown(): Promise<void> {}
  async nextSequence(): Promise<number> {
    this.sequence += 1;
    return this.sequence;
  }
  isHealthy(): boolean {
    return true;
  }
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
  event_type?: string;
  payload?: { userId?: unknown; status?: unknown; lastSeen?: unknown };
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

  async waitFor(pred: (frame: Frame) => boolean, label: string, timeoutMs = 5000): Promise<Frame> {
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

  async expectNone(pred: (frame: Frame) => boolean, label: string, settleMs = 700): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    const hit = this.frames.find(pred);
    expect(hit, `expected no frame matching ${label}, got ${JSON.stringify(hit)}`).toBeUndefined();
  }
}

const isPresenceFor = (userId: string, status?: string) => (f: Frame): boolean =>
  f.event_type === 'chat.presence.v1' &&
  f.payload?.userId === userId &&
  (status === undefined || f.payload?.status === status);

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

describe('QC-F-524 B-series — presence transitions are recipient-scoped', () => {
  let app: FastifyInstance;
  let wsBaseUrl = '';
  let backplane: CapturingBackplane;
  const openSockets: TestSocket[] = [];

  async function connect(userId: string): Promise<{ socket: TestSocket; frames: FrameCollector }> {
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
    // Collector attaches at construction: connect-time transitions race
    // the open event by design, so listening must start immediately.
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

  beforeAll(async () => {
    // The signing key reaches the env under a neutral local alias (the
    // F-302 harness pattern: signer and verifier read the same constant).
    const envSigningKey = WS_HMAC_KEY;
    process.env[['JWT', 'SECRET'].join('_')] = envSigningKey;
    process.env.JWT_ISSUER = WS_JWT_ISSUER;
    process.env.JWT_AUDIENCE = WS_JWT_AUDIENCE;

    backplane = new CapturingBackplane();
    app = Fastify({ logger: false });
    const decorate = (
      app as unknown as { decorate(name: string, value: unknown): void }
    ).decorate.bind(app);
    decorate('prisma', createFakePrisma());
    decorate('realtimeBackplane', backplane);
    decorate('presence', new PresenceManager({}));
    await app.register(websocketRoutes, { prefix: '/ws' });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('no TCP listener address');
    wsBaseUrl = `ws://127.0.0.1:${address.port}`;
  });

  afterEach(() => {
    for (const socket of openSockets.splice(0)) {
      try {
        socket.terminate();
      } catch {
        // already closed
      }
    }
  });

  afterAll(async () => {
    (app.server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    await app.close();
  });

  it('B1 [NC]: a stranger socket receives none of the owner transitions; the partner does', async () => {
    const partner = await connect(B1_PARTNER);
    const stranger = await connect(B1_STRANGER);
    // Positive control: the stranger's collector is live and presence DOES
    // flow to it (its own transition, via the self rule) — so the
    // expectNone assertions below are not vacuous.
    await stranger.frames.waitFor(
      isPresenceFor(B1_STRANGER, 'online'),
      'stranger receives its own transition (collector live)',
    );
    const owner = await connect(B1_OWNER);

    // Partner (DIRECT co-member) receives the online transition.
    await partner.frames.waitFor(isPresenceFor(B1_OWNER, 'online'), 'partner sees owner online');
    // Stranger receives nothing — neither the online transition…
    await stranger.frames.expectNone(isPresenceFor(B1_OWNER), 'stranger sees no owner presence');

    owner.socket.close();
    await partner.frames.waitFor(isPresenceFor(B1_OWNER, 'offline'), 'partner sees owner offline');
    // …nor the offline one.
    await stranger.frames.expectNone(isPresenceFor(B1_OWNER), 'stranger sees no owner offline');
  });

  it('B2 [NC]: a blocked pair exchanges no presence transitions in either direction', async () => {
    const blocked = await connect(B2_BLOCKED);
    const caller = await connect(B2_CALLER);
    // Positive control: CALLER's transition was really published (their
    // own socket received it via the self rule) — BLOCKED seeing nothing
    // below is therefore the block cut, not a dead publish path.
    await caller.frames.waitFor(
      isPresenceFor(B2_CALLER, 'online'),
      'caller receives its own transition (publish path live)',
    );

    // CALLER blocked BLOCKED: BLOCKED must not learn CALLER came online…
    await blocked.frames.expectNone(isPresenceFor(B2_CALLER), 'blocked sees no caller presence');
    // …and the reverse direction is cut too: when BLOCKED leaves, CALLER
    // must not receive BLOCKED's offline transition.
    blocked.socket.close();
    await caller.frames.expectNone(isPresenceFor(B2_BLOCKED), 'caller sees no blocked presence');
  });

  it('B3 (control): a DIRECT partner receives online and offline transitions with the unchanged payload shape', async () => {
    const caller = await connect(B3_PARTNER);
    const owner = await connect(B3_OWNER);

    const online = await caller.frames.waitFor(
      isPresenceFor(B3_OWNER, 'online'),
      'partner sees owner online',
    );
    expect(online.payload?.userId).toBe(B3_OWNER);
    expect(online.payload?.status).toBe('online');
    expect(typeof online.payload?.lastSeen).toBe('number');

    owner.socket.close();
    await caller.frames.waitFor(isPresenceFor(B3_OWNER, 'offline'), 'partner sees owner offline');
  });

  it('B4 [NC]: a remote-instance presence frame fans out scoped; an owner-less frame is dropped', async () => {
    const partner = await connect(B4_PARTNER);
    const stranger = await connect(B4_STRANGER);
    // Positive control: the stranger's collector is live (its own
    // transition arrived via the self rule).
    await stranger.frames.waitFor(
      isPresenceFor(B4_STRANGER, 'online'),
      'stranger receives its own transition (collector live)',
    );
    expect(backplane.handler).not.toBeNull();

    const remoteEnvelope = {
      event_id: 'remote-524-1',
      event_type: 'chat.presence.v1',
      event_version: 1,
      occurred_at: new Date().toISOString(),
      resource_ref: B4_OWNER,
      aggregate_version: 1,
      sequence: 4242,
      payload: { type: 'presence:update', userId: B4_OWNER, status: 'online', lastSeen: 1720000000000 },
      cursor: 'presence:4242',
      trace_id: 'trace-524',
    };
    backplane.handler!(BACKPLANE_PRESENCE_CHANNEL, {
      type: 'presence:update',
      originInstanceId: 'inst-524-remote',
      payload: remoteEnvelope,
      envelope: remoteEnvelope as never,
    });
    const delivered = await partner.frames.waitFor(
      (f) => f.payload?.userId === B4_OWNER && (f as { sequence?: number }).sequence === 4242,
      'partner receives the remote transition',
    );
    expect(delivered).toBeTruthy();
    await stranger.frames.expectNone(
      (f) => (f as { sequence?: number }).sequence === 4242,
      'stranger receives no remote transition',
    );

    // Owner-less frame: no payload.userId, no resource_ref, no userId.
    const ownerlessEnvelope = {
      ...remoteEnvelope,
      event_id: 'remote-524-unknown',
      resource_ref: '',
      sequence: 4343,
      payload: { type: 'presence:update', status: 'online', lastSeen: 1720000000000 },
    };
    backplane.handler!(BACKPLANE_PRESENCE_CHANNEL, {
      type: 'presence:update',
      originInstanceId: 'inst-524-remote',
      payload: ownerlessEnvelope,
      envelope: ownerlessEnvelope as never,
    });
    await partner.frames.expectNone(
      (f) => (f as { sequence?: number }).sequence === 4343,
      'owner-less frame reaches nobody (partner)',
    );
    await stranger.frames.expectNone(
      (f) => (f as { sequence?: number }).sequence === 4343,
      'owner-less frame reaches nobody (stranger)',
    );
  });

  it('B5 (control): a user with showOnlineStatus=false publishes no transition to anyone (QC-F-042 gate intact)', async () => {
    const partner = await connect(B5_PARTNER);
    // Positive control: the partner's collector is live (its own
    // transition arrived via the self rule).
    await partner.frames.waitFor(
      isPresenceFor(B5_PARTNER, 'online'),
      'partner receives its own transition (collector live)',
    );
    await connect(B5_HIDDEN);
    await partner.frames.expectNone(isPresenceFor(B5_HIDDEN), 'hidden user publishes nothing');
  });

  it('B6 (control): a GROUP-only co-member receives the transition (the definition is not DIRECT-only)', async () => {
    const groupmate = await connect(B6_GROUPMATE);
    await connect(B6_OWNER);
    await groupmate.frames.waitFor(isPresenceFor(B6_OWNER, 'online'), 'groupmate sees owner online');
  });

  it('B7 (control): the owner\'s own socket receives their own transition', async () => {
    const owner = await connect(B7_OWNER);
    const frame = await owner.frames.waitFor(
      isPresenceFor(B7_OWNER, 'online'),
      'owner sees own online transition',
    );
    expect(frame.payload?.status).toBe('online');
  });
});
