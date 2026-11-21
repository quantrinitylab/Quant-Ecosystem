// ============================================================================
// OAuth browser-consent sessions — single-use capability tokens for the HTML
// consent screen (GET /oauth/authorize -> POST /oauth/consent)
// ============================================================================
//
// WHY THIS EXISTS: the consent screen is plain HTML. A browser form POST
// cannot send an `Authorization: Bearer` header, and the Next.js consent proxy
// (src/app/api/oauth/consent/route.ts) runs server-side without access to the
// user's in-memory access token — so the old `requireAuth` (Bearer-only)
// preHandler on POST /oauth/consent made the Approve/Cancel buttons dead in
// every browser (401), on top of the form posting to a Next route that did
// not exist (404) and a JSON-only proxy (400).
//
// Instead, GET /oauth/authorize mints a short-lived, single-use, opaque
// consent token bound to the authenticated user AND to the exact authorization
// request (client_id, redirect_uri, scope, state, PKCE, nonce) and embeds it
// as a hidden form field. POST /oauth/consent accepts that token INSTEAD of a
// Bearer token: the token IS the session for this one decision. The posted
// `user_id` field is gone — the token's subject is authoritative, so there is
// nothing left to spoof (the old AUTH-01 user_id-mismatch check only applies
// to the Bearer path used by programmatic API clients, which is unchanged).
//
// Token construction mirrors services/sso-ticket.ts: a signed JWT (jose) with
// a DOMAIN-SEPARATED secret — HMAC-SHA256(JWT_SECRET,
// 'quant-oauth-consent-v1') — so a consent token can NEVER validate as a
// regular access token or as an SSO ticket (or vice versa), even though all
// three are JWT-shaped. `tokenType` is pinned to 'oauth-consent' and checked
// on verify, as a second line of defence against token-type confusion.
//
// Single-use is enforced via a pluggable consumed-jti store (see
// ConsentTokenStore below). Production uses the DB-backed
// PrismaConsentTokenStore against the `oauth_consent_tokens` table (unique
// jti => the database itself is the atomic check-and-mark, so a token consumed
// on replica A is known-consumed on replica B — cross-instance replay
// resistance holds, no best-effort caveat). The in-memory store remains only
// as the unit-test default and an offline fallback; it is NOT sufficient for
// multi-replica deployments on its own.

import { createHmac, randomBytes } from 'node:crypto';
import * as jose from 'jose';
import { getJwtSecret } from '@quant/auth/lib/secrets';

export const CONSENT_TOKEN_TTL_SECONDS = 600;
export const CONSENT_TOKEN_TYPE = 'oauth-consent';

const CONSENT_TOKEN_ISSUER = 'quantmail';
const CONSENT_TOKEN_AUDIENCE = 'quant-ecosystem';

export interface ConsentTokenClaims {
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  nonce: string;
}

export interface ConsentTokenPayload extends ConsentTokenClaims {
  jti: string;
  tokenType: string;
  iss: string;
  aud: string;
}

/**
 * Domain-separated consent-token secret. Deriving from the access-token
 * secret (rather than reusing it) is what makes type confusion impossible: a
 * consent-token signature will never verify under the access-token key or the
 * SSO-ticket key, and neither of those will verify under this key.
 */
function getConsentSecret(): Uint8Array {
  const derived = createHmac('sha256', getJwtSecret())
    .update('quant-oauth-consent-v1')
    .digest();
  return new Uint8Array(derived);
}

/** Exposed for tests: proves a consent token cannot validate as another token type. */
export function getConsentSecretForTests(): Uint8Array {
  return getConsentSecret();
}

/** Mint a fresh single-use consent token for an authenticated authorization request. */
export async function mintConsentToken(claims: ConsentTokenClaims): Promise<string> {
  if (!claims.userId) throw new Error('mintConsentToken requires userId');
  if (!claims.clientId) throw new Error('mintConsentToken requires clientId');
  if (!claims.redirectUri) throw new Error('mintConsentToken requires redirectUri');
  const jti = randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({
    clientId: claims.clientId,
    redirectUri: claims.redirectUri,
    scope: claims.scope,
    state: claims.state,
    codeChallenge: claims.codeChallenge,
    codeChallengeMethod: claims.codeChallengeMethod,
    nonce: claims.nonce,
    tokenType: CONSENT_TOKEN_TYPE,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setJti(jti)
    .setIssuer(CONSENT_TOKEN_ISSUER)
    .setAudience(CONSENT_TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + CONSENT_TOKEN_TTL_SECONDS)
    .sign(getConsentSecret());
}

// ============================================================================
// Consumed-jti stores: single-use enforcement for consent tokens.
// ============================================================================
//
// The store is the atomic check-and-mark: tryConsume returns true exactly once
// per jti (the first valid presentation) and false on every replay. Because
// the check must hold ACROSS backend replicas, the production store is
// DB-backed (PrismaConsentTokenStore, table `oauth_consent_tokens` with a
// UNIQUE jti — the database's unique constraint is the cross-instance mutex).
// The in-memory store is the safe default for unit tests and offline
// development; do NOT rely on it alone in a multi-replica deploy.

/** Minimal DB surface the store needs (PrismaClient satisfies this). */
export interface ConsentTokenDbClient {
  $executeRawUnsafe(query: string, ...params: unknown[]): Promise<unknown>;
}

export interface ConsentTokenStore {
  /**
   * Atomically mark `jti` consumed. Resolves true on the FIRST call for a
   * jti, false when the jti was already consumed (replay). Rejects on
   * unexpected storage errors — callers treat that as fail-closed (no
   * decision), never as "not consumed".
   */
  tryConsume(jti: string, expiresAt: Date): Promise<boolean>;
}

/** Per-process store with lazy expiry sweep. Test/offline default only. */
export class InMemoryConsentTokenStore implements ConsentTokenStore {
  private readonly consumed = new Map<string, number>();

  async tryConsume(jti: string, expiresAt: Date): Promise<boolean> {
    const nowMs = Date.now();
    for (const [k, v] of this.consumed) {
      if (v <= nowMs) this.consumed.delete(k);
    }
    if (this.consumed.has(jti)) return false;
    this.consumed.set(jti, expiresAt.getTime());
    return true;
  }
}

const OAUTH_CONSENT_TOKENS_TABLE = 'oauth_consent_tokens';

/**
 * DB-backed store: INSERT the consumed jti; the UNIQUE(jti) constraint makes
 * the insert atomic across replicas — a second insert of the same jti fails
 * with a unique violation, which is the replay signal. Any other DB error
 * propagates (fail-closed: the consent decision is never made on a broken
 * store). Raw SQL keeps this independent of the generated Prisma client.
 */
export class PrismaConsentTokenStore implements ConsentTokenStore {
  private lastSweepMs = 0;
  private static readonly SWEEP_INTERVAL_MS = 60_000;

  constructor(private readonly db: ConsentTokenDbClient) {}

  private static isUniqueViolation(err: unknown): boolean {
    const code = (err as { code?: unknown } | null)?.code;
    if (code === 'P2002' || code === '23505') return true;
    const msg = String((err as { message?: unknown } | null)?.message ?? err ?? '');
    return /duplicate key|unique constraint|UNIQUE constraint/i.test(msg);
  }

  async tryConsume(jti: string, expiresAt: Date): Promise<boolean> {
    try {
      await this.db.$executeRawUnsafe(
        `INSERT INTO "${OAUTH_CONSENT_TOKENS_TABLE}" ("jti", "expiresAt", "createdAt") VALUES ($1, $2, NOW())`,
        jti,
        expiresAt,
      );
    } catch (err) {
      if (PrismaConsentTokenStore.isUniqueViolation(err)) return false; // replay
      throw err; // fail closed: honest error, no consent decision made
    }
    // Lazy sweep of expired rows (time-gated so it stays one extra query/min).
    const nowMs = Date.now();
    if (nowMs - this.lastSweepMs > PrismaConsentTokenStore.SWEEP_INTERVAL_MS) {
      this.lastSweepMs = nowMs;
      try {
        await this.db.$executeRawUnsafe(
          `DELETE FROM "${OAUTH_CONSENT_TOKENS_TABLE}" WHERE "expiresAt" <= NOW()`,
        );
      } catch {
        // Sweep is best-effort hygiene; a failed sweep never blocks consent.
      }
    }
    return true;
  }
}

// The active store. Swapped in production via setConsentTokenStore().
let activeStore: ConsentTokenStore = new InMemoryConsentTokenStore();

/**
 * Configure the consumed-jti store. Production must call this with a
 * PrismaConsentTokenStore wired to the shared database; until then the
 * per-instance in-memory store applies (documented above).
 */
export function setConsentTokenStore(store: ConsentTokenStore): void {
  activeStore = store;
}

/** Exposed for tests: inspect/reset the active store. */
export function getConsentTokenStoreForTests(): ConsentTokenStore {
  return activeStore;
}

/** Verify a consent token WITHOUT consuming it. Returns the payload or null. */
export async function verifyConsentToken(token: string): Promise<ConsentTokenPayload | null> {
  if (!token || typeof token !== 'string') return null;
  try {
    const { payload } = await jose.jwtVerify(token, getConsentSecret(), {
      issuer: CONSENT_TOKEN_ISSUER,
      audience: CONSENT_TOKEN_AUDIENCE,
    });
    if (payload['tokenType'] !== CONSENT_TOKEN_TYPE) return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    if (typeof payload.jti !== 'string' || !payload.jti) return null;
    const str = (key: string): string =>
      typeof payload[key] === 'string' ? (payload[key] as string) : '';
    return {
      userId: payload.sub,
      clientId: str('clientId'),
      redirectUri: str('redirectUri'),
      scope: str('scope'),
      state: str('state'),
      codeChallenge: str('codeChallenge'),
      codeChallengeMethod: str('codeChallengeMethod'),
      nonce: str('nonce'),
      jti: payload.jti,
      tokenType: CONSENT_TOKEN_TYPE,
      iss: CONSENT_TOKEN_ISSUER,
      aud: CONSENT_TOKEN_AUDIENCE,
    };
  } catch {
    return null;
  }
}

/**
 * Verify a consent token AND mark it consumed. Returns the payload on the
 * first valid presentation, null on replay, expiry, or tampering.
 */
export async function consumeConsentToken(token: string): Promise<ConsentTokenPayload | null> {
  const payload = await verifyConsentToken(token);
  if (!payload) return null;
  const firstUse = await activeStore.tryConsume(
    payload.jti,
    new Date(Date.now() + CONSENT_TOKEN_TTL_SECONDS * 1000),
  );
  if (!firstUse) return null;
  return payload;
}
