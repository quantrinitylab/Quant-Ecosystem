// QuantChat load-test JWT helper.
//
// The QuantChat backend authenticates the `/ws/chat` upgrade with a JWT passed
// as `?token=<jwt>` (see packages/realtime/src/auth.ts). The token must be
// HS256-signed with the same `JWT_SECRET` the backend runs with, and carry the
// issuer/audience the backend expects (default `quantchat` / `quant-ecosystem`).
//
// This module provides a `getToken(vuId)` that, in order of preference:
//   1. Rotates through a comma-separated `TOKENS` env var (pre-minted tokens).
//   2. Uses a single `TOKEN` env var for every VU.
//   3. Mints a fresh HS256 token in-script from `JWT_SECRET` (handy for a
//      throwaway staging cluster whose secret you control).
//
// NEVER point the minting path at a production secret you do not own.

import crypto from 'k6/crypto';
import encoding from 'k6/encoding';

// base64url (no padding) encode a UTF-8 string.
function b64url(str) {
  return encoding.b64encode(str, 'rawurl');
}

const ISSUER = __ENV.JWT_ISSUER || 'quantchat';
const AUDIENCE = __ENV.JWT_AUDIENCE || 'quant-ecosystem';
const TOKEN_TTL = parseInt(__ENV.TOKEN_TTL || '3600', 10); // seconds

// Pre-minted token pool (comma-separated), if supplied.
const TOKEN_POOL = (__ENV.TOKENS || '')
  .split(',')
  .map((t) => t.trim())
  .filter((t) => t.length > 0);

/**
 * Mint an HS256 JWT for `userId` signed with JWT_SECRET.
 * Mirrors the claim shape the backend's `verifyToken` accepts (sub/userId).
 */
export function mintToken(userId) {
  const secret = __ENV.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'No token available: set TOKENS, TOKEN, or JWT_SECRET so the load test can authenticate the WS upgrade.',
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    userId,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now,
    exp: now + TOKEN_TTL,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto.hmac('sha256', secret, signingInput, 'base64rawurl');
  return `${signingInput}.${signature}`;
}

/**
 * Resolve a token for the given virtual-user id.
 * Stable per VU so each VU represents one logical user/socket.
 */
export function getToken(vuId) {
  if (TOKEN_POOL.length > 0) {
    return TOKEN_POOL[vuId % TOKEN_POOL.length];
  }
  if (__ENV.TOKEN) {
    return __ENV.TOKEN;
  }
  // Deterministic synthetic user id per VU so presence churn is meaningful.
  const userPrefix = __ENV.USER_PREFIX || 'loadtest-user';
  return mintToken(`${userPrefix}-${vuId}`);
}
