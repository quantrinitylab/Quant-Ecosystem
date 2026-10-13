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
  /**
   * QC-F-118: the refresh token's own id (its JWT `jti`) and the session
   * family it belongs to (its JWT `fam` claim). The refresh-token store
   * persists one row per refresh token keyed by this id, so issuance
   * callers must register the pair with the store (see
   * lib/refresh-token-store.ts) — an unregistered refresh token cannot be
   * redeemed.
   */
  refreshTokenId: string;
  familyId: string;
}

export interface IssueOptions {
  /** Carry the family forward on rotation; a fresh family is minted otherwise. */
  familyId?: string;
  /** The refresh token's row id / `jti`; a fresh one is minted otherwise. */
  refreshTokenId?: string;
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

  async issue(subject: SessionSubject, opts?: IssueOptions): Promise<IssuedTokens> {
    const sessionId = randomUUID();
    const familyId = opts?.familyId ?? randomUUID();
    const refreshTokenId = opts?.refreshTokenId ?? randomUUID();
    const accessToken = this.sign(subject, sessionId, 'access', this.accessTtl);
    const refreshToken = this.sign(subject, refreshTokenId, 'refresh', this.refreshTtl, familyId);
    return Promise.resolve({
      accessToken,
      refreshToken,
      expiresIn: this.accessTtl,
      tokenType: 'Bearer',
      refreshTokenId,
      familyId,
    });
  }

  /**
   * Verify a presented REFRESH token (signature, issuer, audience, expiry —
   * and the `kind: 'refresh'` claim). Returns the decoded payload on success,
   * null on any failure. An ACCESS token must never be redeemable here: the
   * two kinds are not interchangeable, so the kind check is part of the
   * verification, not a courtesy.
   */
  verifyRefreshToken(token: string): Record<string, unknown> | null {
    const result = verifyHs256(token, {
      jwtSecret: this.config.jwtSecret,
      jwtIssuer: this.config.jwtIssuer,
      jwtAudience: this.config.jwtAudience,
    });
    if (!result.valid || !result.payload) return null;
    if (result.payload['kind'] !== 'refresh') return null;
    if (result.payload['app'] !== 'quantchat') return null;
    if (typeof result.payload['sub'] !== 'string' || !result.payload['sub']) return null;
    return result.payload;
  }

  // QC-F-118: there is deliberately NO stateless `rotate()` here anymore.
  // Rotation is a stateful redemption owned by RefreshTokenStore
  // (lib/refresh-token-store.ts): the presented token's row is spent
  // (compare-and-set), reuse outside a short grace window revokes the whole
  // family, and the successor pair is issued in the same family. A bare
  // verify+issue helper made the previous refresh token immortal until its
  // own 30-day expiry and left no record that reuse ever happened.

  private sign(
    subject: SessionSubject,
    tokenId: string,
    kind: 'access' | 'refresh',
    ttlSec: number,
    familyId?: string,
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
      jti: tokenId,
      // QC-F-118: only the refresh token carries its session family. The
      // access token's claims are unchanged (its `jti` stays the session
      // id the server-core auth plugin reads).
      ...(kind === 'refresh' && familyId ? { fam: familyId } : {}),
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
