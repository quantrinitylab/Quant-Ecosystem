// ============================================================================
// QC-F-197 — WebSocket auth composition regression suite (buildApp level)
// ============================================================================
//
// Defect (P1): the shipped web client's ONLY WebSocket transport — the JWT
// carried as a Sec-WebSocket-Protocol subprotocol (src/lib/auth.ts
// getWsProtocols; browsers cannot set an Authorization header on upgrade) —
// never reached the WS handler's ConnectionAuth, because createApp's global
// onRequest hook ran requireAuth() on GET /ws/chat first, and requireAuth
// reads tokens ONLY from the Authorization header / quant_access_token
// cookie. A fresh login session has no cookie (persistSession writes only
// localStorage; the cookie is set on just three conditional side-paths), so
// every subprotocol-only upgrade died with a 401 JSON before the upgrade.
//
// Fix (specialist-qc-f-197.md §4.2, design (b)): QuantChat's own config adds
// ONE exact rule to publicPaths — { path: '/ws/chat', methods: ['GET'],
// exact: true } — so the hook steps aside (optionalAuth no-ops: it never
// reads the subprotocol and never rejects) and ConnectionAuth in
// backend/routes/websocket.ts becomes the single WS auth gate: single
// iss/aud pair, QC-F-030 kind gate, then QC-F-037 membership. NO server-core
// or realtime change; cookie is deliberately NOT a WS credential (§4.4 —
// ambient credentials are a CSWSH door); query-string tokens stay banned.
//
// Harness: the REAL buildApp() composition (real createApp hook, real
// publicPaths, real websocketRoutes + ConnectionAuth) over a real loopback
// TCP listener — the composition seam no suite covered before (QC-F-037's
// suite registers the bare plugin, so the hook was never in its harness).
// Identity comes only from real HS256 JWTs minted per case. The decorated
// prisma is the shared @quant/database singleton; its delegates are patched
// in place (the auth-me.route.test.ts precedent) so the QC-F-041
// account-status gate — which ConnectionAuth consults via the decorated
// gate — resolves deterministic 'ok' verdicts and membership lookups are
// exact. Patching the object (not replacing it) reaches every consumer,
// because the gate provider dereferences app.prisma at request time.
//
// Env alignment (brief §6.2): websocketRoutes builds ConnectionAuth from
// process.env (JWT secret / JWT_ISSUER / JWT_AUDIENCE), NOT from AppConfig.
// Issuer and audience are set to the testConfig values BEFORE buildApp()
// runs. The suite does NOT provision a JWT secret of its own: the mint
// secret is DERIVED in beforeAll from the verifier's own source — the
// environment's JWT secret when one is provisioned there (read back via
// process.env), else websocket.ts getJwtSecret()'s documented dev
// fallback. Deriving from the verifier's source, instead of assigning a
// secret and hoping it lands, keeps mint and verifier aligned in every
// environment (some sandboxes strip SECRET-named env values before they
// reach a test worker — such an environment leaves the verifier on the
// same fallback, so both sides still agree). The REST side is unaffected:
// the global hook verifies against AppConfig.jwtSecret, and REST-case
// tokens are minted with that config value (restAccessToken).
// ============================================================================

import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

const JWT_SECRET = 'qc197-test-secret-that-is-long-enough';
const JWT_ISSUER = 'quantchat';
const JWT_AUDIENCE = 'quant-ecosystem';
// websocket.ts getJwtSecret()'s documented dev fallback, used only when the
// environment carries no JWT_SECRET at verifier-construction time (see the
// header note). It is a published placeholder in the repo, not a credential.
const WS_SECRET_ENV_FALLBACK = 'dev-only-insecure-jwt-secret-not-for-production-use-000';
// The secret the WS verifier will actually hold; resolved in beforeAll from
// the verifier's own source (env-or-fallback). WS-transport tokens are
// minted with this; REST (AppConfig) tokens with JWT_SECRET.
let wsSecret = JWT_SECRET;

const testConfig: AppConfig = {
  ...getConfig(),
  port: 0,
  host: '127.0.0.1',
  logLevel: 'silent',
  jwtSecret: JWT_SECRET,
  jwtIssuer: JWT_ISSUER,
  jwtAudience: JWT_AUDIENCE,
  env: 'test',
};

// ---------------------------------------------------------------------------
// Token minting — real HS256 JWTs (node:crypto), claims varied per case
// ---------------------------------------------------------------------------

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

let jtiCounter = 0;

interface TokenClaims {
  sub: string;
  iss?: string;
  aud?: string;
  kind?: string;
  exp?: number;
}

function mintToken(claims: TokenClaims, secret: string = wsSecret): string {
  jtiCounter += 1;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: claims.iss ?? JWT_ISSUER,
      aud: claims.aud ?? JWT_AUDIENCE,
      sub: claims.sub,
      jti: `qc197-${jtiCounter}`,
      iat: now,
      exp: claims.exp ?? now + 3600,
      ...(claims.kind === undefined ? {} : { kind: claims.kind }),
    }),
  );
  const signature = base64url(
    createHmac('sha256', secret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

const accessToken = (sub: string): string => mintToken({ sub, kind: 'access' });
// REST-side tokens are verified against AppConfig.jwtSecret (JWT_SECRET),
// which the global hook reads from config, not from the environment.
const restAccessToken = (sub: string): string =>
  mintToken({ sub, kind: 'access' }, JWT_SECRET);

// ---------------------------------------------------------------------------
// Deterministic prisma surface (patched in place on the decorated singleton)
// ---------------------------------------------------------------------------

const ALICE = 'qc197-alice';
const BOB = 'qc197-bob';
const MALLORY = 'qc197-mallory';
const KNOWN_USERS = new Set([ALICE, BOB, MALLORY]);
const MEMBER_CONVERSATION = 'conv-qc197-members';
const STRANGER_CONVERSATION = 'conv-qc197-strangers';
const MEMBERSHIPS = new Set([
  `${MEMBER_CONVERSATION}|${ALICE}`,
  `${MEMBER_CONVERSATION}|${BOB}`,
]);

interface PrismaDelegateSurface {
  user: {
    findUnique: (args: { where: { id: string } }) => Promise<unknown>;
    findMany: (args: { where?: { id?: { in?: string[] } } }) => Promise<unknown[]>;
  };
  conversationMember: {
    findFirst: (args: {
      where: { conversationId: string; userId: string };
    }) => Promise<unknown>;
  };
}

function patchPrisma(app: FastifyInstance): void {
  const prisma = (app as unknown as { prisma: PrismaDelegateSurface }).prisma;
  prisma.user.findUnique = async ({ where }: { where: { id: string } }) =>
    KNOWN_USERS.has(where.id)
      ? { deletedAt: null, status: 'ACTIVE', preferences: null }
      : null;
  prisma.user.findMany = async (args: { where?: { id?: { in?: string[] } } }) => {
    const ids = args.where?.id?.in ?? [];
    return ids
      .filter((id) => KNOWN_USERS.has(id))
      .map((id) => ({ id, preferences: null }));
  };
  prisma.conversationMember.findFirst = async ({
    where,
  }: {
    where: { conversationId: string; userId: string };
  }) =>
    MEMBERSHIPS.has(`${where.conversationId}|${where.userId}`)
      ? { conversationId: where.conversationId, userId: where.userId, leftAt: null }
      : null;
}

// ---------------------------------------------------------------------------
// WS test client — Node's built-in WebSocket over the real loopback listener.
// The collector is attached synchronously at construction, before 'open', so
// connect-time frames (auth error / resumed / NOT_A_MEMBER) are never raced.
// ---------------------------------------------------------------------------

interface TestSocket {
  readonly readyState: number;
  addEventListener(event: 'message', listener: (ev: { data: unknown }) => void): void;
  addEventListener(event: 'close', listener: (ev: { code: number }) => void): void;
  addEventListener(event: 'open' | 'error', listener: () => void): void;
  close(): void;
  terminate(): void;
}

type WebSocketCtor = new (
  url: string,
  options?: { protocols?: string[]; headers?: Record<string, string> },
) => TestSocket & { terminate?: () => void };

const NativeWebSocket = (globalThis as unknown as { WebSocket: WebSocketCtor }).WebSocket;

type Frame = Record<string, unknown> & {
  type?: string;
  code?: string;
  message?: string;
  conversationId?: string;
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

const isAuthError = (f: Frame): boolean =>
  f.type === 'error' && f.message === 'Authentication required';
const isNotMember = (conversationId: string) => (f: Frame): boolean =>
  f.type === 'error' && f.code === 'NOT_A_MEMBER' && f.conversationId === conversationId;
const isResumed = (f: Frame): boolean => f.type === 'resumed';

// ---------------------------------------------------------------------------
// App setup — real buildApp composition on a real loopback port
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let wsBaseUrl = '';
const openSockets: TestSocket[] = [];

interface ConnectOptions {
  protocols?: string[];
  headers?: Record<string, string>;
}

async function connect(
  path: string,
  opts: ConnectOptions = {},
): Promise<{ socket: TestSocket; frames: FrameCollector }> {
  const frames = new FrameCollector();
  const raw = new NativeWebSocket(`${wsBaseUrl}${path}`, {
    protocols: opts.protocols,
    headers: opts.headers,
  });
  const socket: TestSocket = {
    get readyState() {
      return raw.readyState;
    },
    addEventListener: raw.addEventListener.bind(raw) as TestSocket['addEventListener'],
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

/** Connect expecting the handler's fail-closed shape: error frame + 4001. */
async function connectExpectAuthReject(
  path: string,
  opts: ConnectOptions = {},
): Promise<FrameCollector> {
  const { frames } = await connect(path, opts);
  const frame = await frames.waitFor(isAuthError, 'Authentication required error frame');
  expect(frame.message).toBe('Authentication required');
  await expect(frames.waitClose()).resolves.toBe(4001);
  return frames;
}

beforeAll(async () => {
  // websocketRoutes reads its verifier config from the environment, not
  // from AppConfig — align issuer/audience BEFORE buildApp() registers it,
  // and resolve the verifier's effective secret from its own source
  // (header note): whatever getJwtSecret() will return at registration
  // time — the environment's JWT secret when one is provisioned, else the
  // module's documented dev fallback. The suite deliberately does not
  // provision a JWT secret of its own; the read-back keeps the mint side
  // aligned with the verifier in every environment.
  process.env['JWT_ISSUER'] = JWT_ISSUER;
  process.env['JWT_AUDIENCE'] = JWT_AUDIENCE;
  wsSecret = process.env['JWT_SECRET'] ?? WS_SECRET_ENV_FALLBACK;
  // Hermetic realtime relay (engine-surfaces precedent): no Redis, no
  // durable relay — this suite exercises the auth seam, not persistence.
  delete process.env['REDIS_URL'];
  process.env['E2EE_RELAY'] = 'memory';

  app = await buildApp(testConfig);
  patchPrisma(app);
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
// Cases (numbering follows specialist-qc-f-197.md §6.2)
// ---------------------------------------------------------------------------

describe('QC-F-197 — WS auth composition (single gate = ConnectionAuth)', () => {
  it('case 2 (the fix): subprotocol-only valid access token opens and stays open, no error frame', async () => {
    const { socket, frames } = await connect('/ws/chat', {
      protocols: [accessToken(ALICE)],
    });
    await frames.expectNone(isAuthError, 'auth error frame for the shipped transport', 600);
    expect(socket.readyState).toBe(1); // OPEN
    socket.close();
  });

  it('case 3: Authorization-header valid token still opens (native-client parity)', async () => {
    const { socket, frames } = await connect('/ws/chat', {
      headers: { authorization: `Bearer ${accessToken(BOB)}` },
    });
    await frames.expectNone(isAuthError, 'auth error frame for header transport', 400);
    expect(socket.readyState).toBe(1);
    socket.close();
  });

  it('case 4: no token at all -> error frame + close 4001 (fail-closed, WS shape)', async () => {
    await connectExpectAuthReject('/ws/chat');
  });

  it('case 5: cookie-only valid token -> error frame + close 4001 (cookie is NOT a WS credential)', async () => {
    await connectExpectAuthReject('/ws/chat', {
      headers: { cookie: `quant_access_token=${accessToken(ALICE)}` },
    });
  });

  it('case 6: refresh-kind token is rejected on BOTH transports (QC-F-030 gate at composition level)', async () => {
    const refresh = mintToken({ sub: ALICE, kind: 'refresh' });
    await connectExpectAuthReject('/ws/chat', { protocols: [refresh] });
    await connectExpectAuthReject('/ws/chat', {
      headers: { authorization: `Bearer ${refresh}` },
    });
  });

  it('case 7: foreign token the REST hook would wave through (iss quantmail) -> 4001 from the single WS gate', async () => {
    const foreign = mintToken({ sub: ALICE, iss: 'quantmail', kind: 'access' });
    await connectExpectAuthReject('/ws/chat', { protocols: [foreign] });
  });

  it('case 8: wrong audience and wrong issuer each -> 4001', async () => {
    await connectExpectAuthReject('/ws/chat', {
      protocols: [mintToken({ sub: ALICE, aud: 'some-other-audience', kind: 'access' })],
    });
    await connectExpectAuthReject('/ws/chat', {
      protocols: [mintToken({ sub: ALICE, iss: 'quantai', kind: 'access' })],
    });
  });

  it('case 9: expired token -> 4001; garbage subprotocol -> 4001 without crash; next valid connect succeeds', async () => {
    const expired = mintToken({
      sub: ALICE,
      kind: 'access',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    await connectExpectAuthReject('/ws/chat', { protocols: [expired] });
    await connectExpectAuthReject('/ws/chat', { protocols: ['not-a-jwt'] });
    const { socket, frames } = await connect('/ws/chat', {
      protocols: [accessToken(ALICE)],
    });
    await frames.expectNone(isAuthError, 'auth error after garbage attempt', 400);
    expect(socket.readyState).toBe(1);
    socket.close();
  });

  it('case 10: token in the ?token= query string alone -> 4001 (query transport stays banned)', async () => {
    await connectExpectAuthReject(`/ws/chat?token=${accessToken(ALICE)}`);
  });

  it('case 11: /ws/presence keeps its hook gate — 401 without token, 200 with a valid Bearer', async () => {
    const anon = await app.inject({ method: 'GET', url: '/ws/presence' });
    expect(anon.statusCode).toBe(401);
    const authed = await app.inject({
      method: 'GET',
      url: '/ws/presence',
      headers: { authorization: `Bearer ${restAccessToken(ALICE)}` },
    });
    expect(authed.statusCode).toBe(200);
    expect(Array.isArray((authed.json() as { online: unknown }).online)).toBe(true);
  });

  it('case 12: REST unchanged — Sec-WebSocket-Protocol alone does NOT authenticate a REST route', async () => {
    const viaProtocol = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { 'sec-websocket-protocol': restAccessToken(ALICE) },
    });
    expect(viaProtocol.statusCode).toBe(401);
    const viaBearer = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${restAccessToken(ALICE)}` },
    });
    // Reaching the handler (any non-401 outcome) is the contract here;
    // the handler's own result on the patched prisma is not this seam.
    expect(viaBearer.statusCode).not.toBe(401);
  });

  it('case 13: POST /ws/chat without token -> 401 (exemption is GET-only)', async () => {
    const res = await app.inject({ method: 'POST', url: '/ws/chat' });
    expect(res.statusCode).toBe(401);
  });

  it('case 14: membership still gates at composition level — non-member gets NOT_A_MEMBER, member gets resumed', async () => {
    const stranger = await connect(`/ws/chat?conversationId=${STRANGER_CONVERSATION}`, {
      protocols: [accessToken(MALLORY)],
    });
    await stranger.frames.waitFor(
      isNotMember(STRANGER_CONVERSATION),
      'NOT_A_MEMBER frame for non-member',
    );
    expect(stranger.socket.readyState).toBe(1); // socket itself stays open
    stranger.socket.close();

    const member = await connect(`/ws/chat?conversationId=${MEMBER_CONVERSATION}`, {
      protocols: [accessToken(ALICE)],
    });
    await member.frames.waitFor(isResumed, 'resumed frame for member');
    await member.frames.expectNone(
      isNotMember(MEMBER_CONVERSATION),
      'NOT_A_MEMBER for a member',
      200,
    );
    member.socket.close();
  });

  it('case 15: no prefix leak — /ws/chatx and /ws/chat/extra without token -> 401', async () => {
    const chatx = await app.inject({ method: 'GET', url: '/ws/chatx' });
    expect(chatx.statusCode).toBe(401);
    const extra = await app.inject({ method: 'GET', url: '/ws/chat/extra' });
    expect(extra.statusCode).toBe(401);
  });
});
