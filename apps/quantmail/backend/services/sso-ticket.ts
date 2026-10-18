// ============================================================================
// SSO handoff tickets — single-use opaque credentials for cross-app sign-in
// ============================================================================
//
// SECURITY: the session access token must NEVER be placed in a redirect URL
// query string. Query params land in browser history, reverse-proxy / server
// access logs, and the Referer headers of the receiving app — leaking a bearer
// credential to anyone with log access.
//
// Instead the account chooser mints a short-lived, single-use, opaque SSO
// ticket server-side (POST /sso/ticket/mint, authenticated by the user's
// session) and the redirect URL carries ONLY `?__quant_sso_ticket=<ticket>`.
// The receiving app's backend resolves the ticket to an identity server-side
// (POST /sso/ticket/resolve, authenticated with its OAuth client credentials)
// and then establishes its own session. The QuantMail bearer token never
// appears in the URL at all.
//
// Ticket construction: a signed JWT (jose) with a DOMAIN-SEPARATED secret —
// HMAC-SHA256(JWT_SECRET, 'quant-sso-ticket-v1') — so a ticket can NEVER
// validate as a regular access token (or vice versa), even though both are
// JWT-shaped. `tokenType` is pinned to 'sso-ticket' and checked on verify, as
// a second line of defence against token-type confusion.
//
// Single-use is enforced per backend instance via a consumed-jti set with lazy
// expiry sweep. Caveat, stated honestly: in a multi-replica deployment a
// ticket consumed on replica A is not yet known-consumed on replica B. Tickets
// are 120s-lived and 256-bit random, so the practical replay window is tiny; a
// strictly cross-instance single-use guarantee would need a DB-backed store
// (e.g. an `sso_tickets` table) instead of this in-memory set.

import { createHmac, randomBytes } from 'node:crypto';
import * as jose from 'jose';
import { getJwtSecret } from '@quant/auth/lib/secrets';

export const SSO_TICKET_TTL_SECONDS = 120;
export const SSO_TICKET_TYPE = 'sso-ticket';

const SSO_TICKET_ISSUER = 'quantmail';
const SSO_TICKET_AUDIENCE = 'quant-ecosystem';

export interface SsoTicketClaims {
  userId: string;
  email: string;
  username: string;
  displayName: string;
  clientId?: string;
  returnTo?: string;
  /**
   * Epoch seconds of the last strong authentication of the session that
   * minted this ticket. Carried through to the exchanged access token so the
   * handoff cannot freshen step-up authority. Absent when the minting session
   * predates step-up support — the exchange must then treat the resulting
   * token as stale, never as fresh.
   */
  lastStrongAuthAt?: number;
}

export interface SsoTicketPayload extends SsoTicketClaims {
  jti: string;
  tokenType: string;
  iss: string;
  aud: string;
}

/**
 * Domain-separated ticket secret. Deriving from the access-token secret (rather
 * than reusing it) is what makes type confusion impossible: a ticket signature
 * will never verify under the access-token key and an access token will never
 * verify under the ticket key.
 */
function getTicketSecret(): Uint8Array {
  const derived = createHmac('sha256', getJwtSecret())
    .update('quant-sso-ticket-v1')
    .digest();
  return new Uint8Array(derived);
}

/** Exposed for tests: proves a ticket cannot validate as an access token. */
export function getSsoTicketSecretForTests(): Uint8Array {
  return getTicketSecret();
}

/** Mint a fresh single-use ticket for the given identity claims. */
export async function mintSsoTicket(claims: SsoTicketClaims): Promise<string> {
  if (!claims.userId) throw new Error('mintSsoTicket requires userId');
  const jti = randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({
    email: claims.email,
    username: claims.username,
    displayName: claims.displayName,
    ...(claims.clientId ? { clientId: claims.clientId } : {}),
    ...(claims.returnTo ? { returnTo: claims.returnTo } : {}),
    // Only a valid positive timestamp is carried. Anything else stays
    // absent so the exchange can distinguish "known stale" from "unknown".
    ...(typeof claims.lastStrongAuthAt === 'number' && claims.lastStrongAuthAt > 0
      ? { lastStrongAuthAt: claims.lastStrongAuthAt }
      : {}),
    tokenType: SSO_TICKET_TYPE,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setJti(jti)
    .setIssuer(SSO_TICKET_ISSUER)
    .setAudience(SSO_TICKET_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + SSO_TICKET_TTL_SECONDS)
    .sign(getTicketSecret());
}

// Consumed jtis: jti -> absolute expiry (ms). Per-instance single-use
// enforcement; see the module header for the multi-replica caveat.
const consumedJtis = new Map<string, number>();

function sweepConsumedJtis(nowMs: number): void {
  for (const [jti, expiresAtMs] of consumedJtis) {
    if (expiresAtMs <= nowMs) consumedJtis.delete(jti);
  }
}

/** Verify a ticket WITHOUT consuming it. Returns the payload or null. */
export async function verifySsoTicket(ticket: string): Promise<SsoTicketPayload | null> {
  if (!ticket || typeof ticket !== 'string') return null;
  try {
    const { payload } = await jose.jwtVerify(ticket, getTicketSecret(), {
      issuer: SSO_TICKET_ISSUER,
      audience: SSO_TICKET_AUDIENCE,
    });
    if (payload['tokenType'] !== SSO_TICKET_TYPE) return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    if (typeof payload.jti !== 'string' || !payload.jti) return null;
    const str = (key: string): string =>
      typeof payload[key] === 'string' ? (payload[key] as string) : '';
    const optStr = (key: string): string | undefined => {
      const v = payload[key];
      return typeof v === 'string' && v ? v : undefined;
    };
    const optNum = (key: string): number | undefined => {
      const v = payload[key];
      return typeof v === 'number' && v > 0 ? v : undefined;
    };
    return {
      jti: payload.jti,
      userId: payload.sub,
      email: str('email'),
      username: str('username'),
      displayName: str('displayName'),
      clientId: optStr('clientId'),
      returnTo: optStr('returnTo'),
      lastStrongAuthAt: optNum('lastStrongAuthAt'),
      tokenType: SSO_TICKET_TYPE,
      iss: SSO_TICKET_ISSUER,
      aud: SSO_TICKET_AUDIENCE,
    };
  } catch {
    return null;
  }
}

/**
 * Verify AND consume a ticket atomically. Returns the payload on first use,
 * null when the ticket is expired, invalid, tampered, or already used.
 */
export async function consumeSsoTicket(ticket: string): Promise<SsoTicketPayload | null> {
  const payload = await verifySsoTicket(ticket);
  if (!payload) return null;
  const nowMs = Date.now();
  sweepConsumedJtis(nowMs);
  if (consumedJtis.has(payload.jti)) return null;
  consumedJtis.set(payload.jti, nowMs + SSO_TICKET_TTL_SECONDS * 1000);
  return payload;
}
