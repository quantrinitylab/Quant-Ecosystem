// ============================================================================
// QuantAI SSO session tokens — minted AFTER a QuantMail opaque SSO ticket has
// been resolved server-side (POST /sso/ticket/resolve, see routes/sso-ticket.ts).
// ============================================================================
//
// Why a QuantAI-issued token: the new ticket contract deliberately returns the
// user's IDENTITY and never any token, and only the identity root (QuantMail)
// can mint identity access tokens. The contract expects the receiving app to
// then "establish its own session" — this module mints that session as a
// short-lived HS256 JWT signed with the backend's JWT_SECRET, which the
// ecosystem auth hook (server-core plugins/auth) already verifies.
//
// Scope safety (issuer pinning): that hook accepts issuers [appJwtIssuer,
// 'quantmail', 'https://quantrinity.in', 'https://quant.app']. These tokens
// carry iss='quantai', so they verify ONLY on the QuantAI backend — other
// apps' backends reject them because 'quantai' is not in their issuer list.
// `tokenType` is pinned to 'quantai-sso-session' as a second line of defence
// against token-type confusion, and the payload carries NO role and NO scopes:
// an SSO session is identity-only; privileged scopes still require a full
// identity login. Signed with plain node:crypto (no new dependencies).
//
// The JWT is built by hand (compact JWS, base64url, no padding) so the web
// tier never needs a JWT library; the auth hook verifies it with jose.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SSO_SESSION_TOKEN_TYPE = 'quantai-sso-session';
export const SSO_SESSION_TTL_SECONDS = 3600;
export const SSO_SESSION_ISSUER = 'quantai';
export const SSO_SESSION_AUDIENCE = 'quant-ecosystem';

export interface SsoSessionIdentity {
  userId: string;
  email: string;
  username?: string;
  displayName?: string;
}

export interface SsoSessionClaims extends SsoSessionIdentity {
  tokenType: string;
  jti: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

function signHS256(signingInput: string, secret: string): string {
  return createHmac('sha256', secret).update(signingInput).digest('base64url');
}

/**
 * Mint a QuantAI SSO session token for an identity that was JUST verified by
 * the identity root via ticket/resolve. Throws on missing identity/secret —
 * callers must fail closed.
 */
export function mintSsoSessionToken(identity: SsoSessionIdentity, secret: string): string {
  if (!identity || !identity.userId || !identity.email) {
    throw new Error('mintSsoSessionToken requires userId and email');
  }
  if (!secret) {
    throw new Error('mintSsoSessionToken requires a signing secret');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      tokenType: SSO_SESSION_TOKEN_TYPE,
      sub: identity.userId,
      email: identity.email,
      username: identity.username ?? '',
      displayName: identity.displayName ?? '',
      app: 'quantai',
      iss: SSO_SESSION_ISSUER,
      aud: SSO_SESSION_AUDIENCE,
      iat: now,
      exp: now + SSO_SESSION_TTL_SECONDS,
      jti: randomBytes(16).toString('hex'),
    }),
  ).toString('base64url');
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${signHS256(signingInput, secret)}`;
}

/**
 * Verify a QuantAI SSO session token. Used by tests and any in-lane consumer
 * that needs to re-check a session token outside the global auth hook.
 * Returns the claims or null (never throws).
 */
export function verifySsoSessionToken(token: string, secret: string): SsoSessionClaims | null {
  try {
    if (!token || typeof token !== 'string' || !secret) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts as [string, string, string];
    const expected = signHS256(`${headerB64}.${payloadB64}`, secret);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
      alg?: string;
    };
    if (header.alg !== 'HS256') return null;
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (claims['tokenType'] !== SSO_SESSION_TOKEN_TYPE) return null;
    if (claims['iss'] !== SSO_SESSION_ISSUER || claims['aud'] !== SSO_SESSION_AUDIENCE) return null;
    if (typeof claims['sub'] !== 'string' || !claims['sub']) return null;
    if (typeof claims['email'] !== 'string' || !claims['email']) return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims['exp'] !== 'number' || claims['exp'] <= now) return null;
    if (typeof claims['iat'] !== 'number' || claims['iat'] > now + 60) return null;
    if (typeof claims['jti'] !== 'string' || !claims['jti']) return null;
    const str = (key: string): string | undefined => {
      const v = claims[key];
      return typeof v === 'string' && v ? v : undefined;
    };
    return {
      userId: claims['sub'] as string,
      email: claims['email'] as string,
      username: str('username'),
      displayName: str('displayName'),
      tokenType: SSO_SESSION_TOKEN_TYPE,
      jti: claims['jti'] as string,
      iss: SSO_SESSION_ISSUER,
      aud: SSO_SESSION_AUDIENCE,
      iat: claims['iat'] as number,
      exp: claims['exp'] as number,
    };
  } catch {
    return null;
  }
}
