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
// Single-use is enforced per backend instance via a consumed-jti set with lazy
// expiry sweep. Caveat, stated honestly (same as SSO tickets): in a
// multi-replica deployment a token consumed on replica A is not yet
// known-consumed on replica B. Tokens are 600s-lived and 256-bit random, so
// the practical replay window is tiny; a strictly cross-instance single-use
// guarantee would need a DB-backed store instead of this in-memory set.

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

// Consumed jtis: jti -> absolute expiry (ms). Per-instance single-use
// enforcement; see the module header for the multi-replica caveat.
const consumedJtis = new Map<string, number>();

function sweepConsumedJtis(nowMs: number): void {
  for (const [jti, expiresAtMs] of consumedJtis) {
    if (expiresAtMs <= nowMs) consumedJtis.delete(jti);
  }
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
  const nowMs = Date.now();
  sweepConsumedJtis(nowMs);
  if (consumedJtis.has(payload.jti)) return null;
  consumedJtis.set(payload.jti, nowMs + CONSENT_TOKEN_TTL_SECONDS * 1000);
  return payload;
}
