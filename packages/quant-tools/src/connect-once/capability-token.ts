// ============================================================================
// Capability token (P1-2): a signed JWT that IS the OAuth access token.
//
// The connect-once flow issues ONE token scoped to the user. The MCP gateway
// checks every tools/call against the scopes embedded here plus the per-call
// risk tier. Implemented with node:crypto only (HS256) — quant-tools has no
// jose/jsonwebtoken dependency and we add none.
//
// Secret handling (honest): the signing secret resolves from the
// QUANTY_CAPABILITY_TOKEN_SECRET env var. For production this MUST be a
// KMS-backed secret resolved through the `KeyVault` port in
// packages/encryption/src/key-vault.ts (kms:// references, never plaintext)
// — that wiring is NOT done here; see the comment on resolveCapabilitySecret.
// ============================================================================

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const CAPABILITY_TOKEN_ISSUER = 'quanty-connect-once';
export const CAPABILITY_TOKEN_SECRET_ENV = 'QUANTY_CAPABILITY_TOKEN_SECRET';

/** Small clock-skew allowance when checking exp, in seconds. */
const EXP_SKEW_SEC = 60;

export type CapabilityTokenErrorCode =
  | 'malformed'
  | 'invalid_signature'
  | 'expired';

export class CapabilityTokenError extends Error {
  readonly code: CapabilityTokenErrorCode;

  constructor(code: CapabilityTokenErrorCode, message: string) {
    super(message);
    this.name = 'CapabilityTokenError';
    this.code = code;
  }
}

export interface CapabilityClaims {
  /** The Quant user id. */
  sub: string;
  /** Granted capability scopes, e.g. ['mail.read', 'calendar.write']. */
  scopes: string[];
  /** Expiry, seconds since epoch. */
  exp: number;
  /** Issued-at, seconds since epoch. */
  iat: number;
  iss: string;
  /** OAuth client the token was issued to. */
  client_id: string;
  /** Unique token id; used by the revocation denylist. */
  jti: string;
}

export interface IssueCapabilityTokenOptions {
  userId: string;
  scopes: string[];
  clientId: string;
  /** Lifetime in seconds. */
  ttlSec: number;
  /** Optional fixed jti (tests); random when omitted. */
  jti?: string;
}

// ---------------------------------------------------------------------------
// Secret resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the HS256 signing secret.
 *
 * NOT WIRED YET: production deployments should resolve this through the
 * `KeyVault` port in packages/encryption/src/key-vault.ts (a `kms://`
 * reference resolved via AWS Secrets Manager / HashiCorp Vault) instead of
 * an env var, so the raw key material never sits in process config. Until
 * that wiring exists, set QUANTY_CAPABILITY_TOKEN_SECRET in the environment
 * of the process that issues AND verifies these tokens (both sides must see
 * the same secret).
 */
export function resolveCapabilitySecret(): string {
  const secret = process.env[CAPABILITY_TOKEN_SECRET_ENV];
  if (!secret) {
    throw new Error(
      `Capability token secret is not configured: set the ${CAPABILITY_TOKEN_SECRET_ENV} ` +
        'environment variable. (KMS-backed resolution via @quant/encryption KeyVault is not wired yet.)',
    );
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Issue / verify
// ---------------------------------------------------------------------------

/**
 * Issue a signed capability JWT.
 *
 * @param options  token claims; `secret` defaults to resolveCapabilitySecret().
 */
export function issueCapabilityToken(
  options: IssueCapabilityTokenOptions,
  secret?: string,
): string {
  const key = secret ?? resolveCapabilitySecret();
  const nowSec = Math.floor(Date.now() / 1000);
  const claims: CapabilityClaims = {
    sub: options.userId,
    scopes: [...options.scopes],
    exp: nowSec + options.ttlSec,
    iat: nowSec,
    iss: CAPABILITY_TOKEN_ISSUER,
    client_id: options.clientId,
    jti: options.jti ?? randomBytes(16).toString('hex'),
  };
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64urlEncode(JSON.stringify(claims));
  const signature = base64urlEncode(
    createHmac('sha256', key).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

/**
 * Verify a capability JWT and return its claims.
 *
 * @throws CapabilityTokenError with code 'malformed' | 'invalid_signature' | 'expired'.
 * Does NOT check the revocation denylist — callers that enforce revocation
 * (the gateway resolver, the /oauth/revoke handler) check isCapabilityTokenRevoked
 * separately so issuance-time code paths stay pure.
 */
export function verifyCapabilityToken(token: string, secret: string): CapabilityClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new CapabilityTokenError('malformed', 'Token must have three dot-separated parts');
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(base64urlDecode(headerB64).toString('utf8'));
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new CapabilityTokenError('malformed', 'Token header/payload is not valid base64url JSON');
  }

  if (
    typeof header !== 'object' ||
    header === null ||
    (header as Record<string, unknown>)['alg'] !== 'HS256'
  ) {
    throw new CapabilityTokenError('malformed', 'Unsupported token algorithm (expected HS256)');
  }

  const expected = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest();
  let actual: Buffer;
  try {
    actual = base64urlDecode(signatureB64);
  } catch {
    throw new CapabilityTokenError('malformed', 'Token signature is not valid base64url');
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new CapabilityTokenError('invalid_signature', 'Token signature does not match');
  }

  const claims = payload as Record<string, unknown>;
  if (
    typeof claims['sub'] !== 'string' ||
    !Array.isArray(claims['scopes']) ||
    !(claims['scopes'] as unknown[]).every((s) => typeof s === 'string') ||
    typeof claims['exp'] !== 'number' ||
    typeof claims['iat'] !== 'number' ||
    typeof claims['client_id'] !== 'string' ||
    typeof claims['jti'] !== 'string'
  ) {
    throw new CapabilityTokenError('malformed', 'Token is missing required claims');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if ((claims['exp'] as number) + EXP_SKEW_SEC <= nowSec) {
    throw new CapabilityTokenError('expired', 'Token has expired');
  }

  return {
    sub: claims['sub'] as string,
    scopes: [...(claims['scopes'] as string[])],
    exp: claims['exp'] as number,
    iat: claims['iat'] as number,
    iss: typeof claims['iss'] === 'string' ? (claims['iss'] as string) : CAPABILITY_TOKEN_ISSUER,
    client_id: claims['client_id'] as string,
    jti: claims['jti'] as string,
  };
}

// ---------------------------------------------------------------------------
// Revocation denylist
// ---------------------------------------------------------------------------

/**
 * In-memory revocation denylist of token jtis.
 *
 * Honest limitation: non-durable. Like the OAuth2Provider's in-memory token
 * store, this set is lost on process restart — a restarted issuer will
 * accept previously revoked tokens until they expire. A durable (Postgres /
 * Redis) revocation store is NOT wired yet; capability tokens should keep a
 * short TTL to bound this window.
 */
const revokedJtis = new Set<string>();

/** Revoke a capability token by its jti. */
export function revokeCapabilityToken(jti: string): void {
  revokedJtis.add(jti);
}

/** True when the jti has been revoked in this process. */
export function isCapabilityTokenRevoked(jti: string): boolean {
  return revokedJtis.has(jti);
}

// ---------------------------------------------------------------------------
// base64url helpers
// ---------------------------------------------------------------------------

function base64urlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = padded.length % 4;
  const withPadding = remainder === 0 ? padded : padded + '='.repeat(4 - remainder);
  return Buffer.from(withPadding, 'base64');
}
