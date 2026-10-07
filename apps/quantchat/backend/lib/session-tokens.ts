// ============================================================================
// QuantChat - Session Tokens
// ============================================================================
//
// Issues the access + refresh JWTs returned after successful phone verification.
// Tokens are standard HS256 JWTs signed with the SAME secret/issuer/audience the
// shared server-core auth plugin verifies with (via `jose.jwtVerify`), so an
// issued access token is immediately accepted by every protected route.
//
// Signing is implemented with node:crypto (HMAC-SHA256) directly — no extra
// dependency — because a JWT is just base64url(header).base64url(payload).HMAC.

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export interface TokenSigningConfig {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  accessTtlSec?: number;
  refreshTtlSec?: number;
}

export interface SessionSubject {
  userId: string;
  username: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

const DEFAULT_ACCESS_TTL = 60 * 60; // 1h
const DEFAULT_REFRESH_TTL = 30 * 24 * 60 * 60; // 30d

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export class SessionTokenIssuer {
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  constructor(private readonly config: TokenSigningConfig) {
    if (!config.jwtSecret || config.jwtSecret.length < 16) {
      throw new Error('SessionTokenIssuer requires a jwtSecret of at least 16 chars');
    }
    this.accessTtl = config.accessTtlSec ?? DEFAULT_ACCESS_TTL;
    this.refreshTtl = config.refreshTtlSec ?? DEFAULT_REFRESH_TTL;
  }

  async issue(subject: SessionSubject): Promise<IssuedTokens> {
    const sessionId = randomUUID();
    const accessToken = this.sign(subject, sessionId, 'access', this.accessTtl);
    const refreshToken = this.sign(subject, sessionId, 'refresh', this.refreshTtl);
    return Promise.resolve({
      accessToken,
      refreshToken,
      expiresIn: this.accessTtl,
      tokenType: 'Bearer',
    });
  }

  private sign(
    subject: SessionSubject,
    sessionId: string,
    kind: 'access' | 'refresh',
    ttlSec: number,
  ): string {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      sub: subject.userId,
      username: subject.username,
      app: 'quantchat',
      scopes: [] as string[],
      role: 'user',
      kind,
      jti: sessionId,
      iat: nowSec,
      iss: this.config.jwtIssuer,
      aud: this.config.jwtAudience,
      exp: nowSec + ttlSec,
    };
    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = base64url(
      createHmac('sha256', this.config.jwtSecret).update(signingInput).digest(),
    );
    return `${signingInput}.${signature}`;
  }
}

/**
 * Verify an HS256 JWT signature + standard claims with node:crypto only (used by
 * tests and any in-process check). Mirrors what the server-core jose verifier
 * enforces: signature, issuer, audience, and expiry.
 */
export function verifyHs256(
  token: string,
  opts: { jwtSecret: string; jwtIssuer: string; jwtAudience: string },
): { valid: boolean; payload?: Record<string, unknown>; reason?: string } {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const [h, p, sig] = parts as [string, string, string];
  const expected = base64url(createHmac('sha256', opts.jwtSecret).update(`${h}.${p}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'bad-signature' };
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(p, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return { valid: false, reason: 'bad-payload' };
  }
  if (payload['iss'] !== opts.jwtIssuer) return { valid: false, reason: 'bad-issuer' };
  if (payload['aud'] !== opts.jwtAudience) return { valid: false, reason: 'bad-audience' };
  if (typeof payload['exp'] === 'number' && payload['exp'] < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: 'expired' };
  }
  return { valid: true, payload };
}
