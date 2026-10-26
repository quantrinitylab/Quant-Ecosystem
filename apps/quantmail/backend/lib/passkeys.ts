/**
 * Passkey (WebAuthn) ceremony state for QuantMail — no new database table
 * for challenges, and no process-memory store.
 *
 * The old packages/auth WebAuthnService kept challenges in a Map: a restart
 * or a second replica silently invalidated every in-flight ceremony. Here a
 * challenge rides in a signed, short-lived JWT (the same pattern as the TOTP
 * challenge in lib/two-factor.ts, with its own purpose string and its own
 * HMAC-derived key so a challenge can never be confused with a refresh
 * token or a TOTP challenge). The browser already receives the raw challenge
 * inside the WebAuthn options, so signing the token proves server issuance
 * and freshness — the challenge itself was never secret. Replay is closed
 * the same way the TOTP flow closes it: the assertion is verified against
 * the challenge inside the token, and the credential counter moves forward
 * on every accepted assertion, so a captured assertion cannot mint a
 * second session against a fresh challenge.
 *
 * Kept free of Fastify and Prisma so the token rules can be tested directly
 * rather than through an HTTP round trip. The actual WebAuthn cryptography
 * lives in @quant/auth/services/passkey-ceremony (stateless wrappers around
 * @simplewebauthn/server); this module only owns QuantMail's challenge
 * tokens and relying-party derivation.
 */

import { createHmac } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getJwtRefreshSecret } from '@quant/auth/lib/secrets';

/** A login may sit half-finished for as long as a TOTP challenge may. */
export const PASSKEY_CHALLENGE_TTL_SECONDS = 300;

export type PasskeyChallengePurpose = 'register' | 'login';

const CHALLENGE_ISSUER = 'quantmail';
const CHALLENGE_AUDIENCE = 'quantmail-passkey';

const challengeKey = (purpose: PasskeyChallengePurpose): Uint8Array =>
  new Uint8Array(
    createHmac('sha256', getJwtRefreshSecret())
      .update(`quantmail.passkey-challenge:${purpose}:v1`)
      .digest(),
  );

export interface PasskeyChallengeClaims {
  userId: string;
  purpose: PasskeyChallengePurpose;
  /** The base64url challenge the authenticator signed over. */
  challenge: string;
  issuedAt: number;
}

/**
 * Issue the token that stands in for "this server generated this challenge
 * for this user, for this purpose, moments ago". Carries no scopes and no
 * role, so presenting it to a normal authenticated route buys nothing.
 */
export async function signPasskeyChallenge(
  input: { userId: string; purpose: PasskeyChallengePurpose; challenge: string },
  nowMs: number = Date.now(),
): Promise<{ challengeToken: string; expiresIn: number }> {
  const issuedAt = Math.floor(nowMs / 1000);
  const challengeToken = await new SignJWT({
    purpose: `quantmail.passkey-challenge.${input.purpose}`,
    challenge: input.challenge,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(input.userId)
    .setIssuer(CHALLENGE_ISSUER)
    .setAudience(CHALLENGE_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + PASSKEY_CHALLENGE_TTL_SECONDS)
    .sign(challengeKey(input.purpose));
  return { challengeToken, expiresIn: PASSKEY_CHALLENGE_TTL_SECONDS };
}

/**
 * Returns the claims, or `null` for anything that is not a live challenge
 * token this server issued for the expected purpose. Callers must not
 * distinguish the failure reasons to the client: "expired" and "forged"
 * are the same answer at the HTTP boundary.
 */
export async function verifyPasskeyChallenge(
  token: string,
  expectedPurpose: PasskeyChallengePurpose,
): Promise<PasskeyChallengeClaims | null> {
  if (typeof token !== 'string' || token.length === 0) return null;
  try {
    const { payload } = await jwtVerify(token, challengeKey(expectedPurpose), {
      issuer: CHALLENGE_ISSUER,
      audience: CHALLENGE_AUDIENCE,
      algorithms: ['HS256'],
    });
    if (payload['purpose'] !== `quantmail.passkey-challenge.${expectedPurpose}`) return null;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
    if (typeof payload['challenge'] !== 'string' || payload['challenge'].length === 0) {
      return null;
    }
    return {
      userId: payload.sub,
      purpose: expectedPurpose,
      challenge: payload['challenge'] as string,
      issuedAt: typeof payload.iat === 'number' ? payload.iat : 0,
    };
  } catch {
    return null;
  }
}

export interface PasskeyRpConfig {
  /** Relying-party ID: the registrable domain ceremonies bind to. */
  rpID: string;
  /** Display name shown in the browser's passkey prompt. */
  rpName: string;
  /** The origin the browser must report (scheme + host + port). */
  origin: string;
}

/**
 * Derive the relying-party config for one request.
 *
 * `PASSKEY_RP_ID` pins the RP ID in production (quantmail.in). Without it,
 * the RP ID is the request origin's hostname — which is exactly right for
 * localhost development (rpID 'localhost') and for preview deployments, and
 * avoids the old service's failure mode of silently defaulting to an
 * unrelated domain. An origin whose hostname is neither the pinned RP ID
 * nor a subdomain of it is rejected: a ceremony bound to one RP must never
 * be verified against another origin's assertion.
 */
export function passkeyRpConfig(
  origin: string | undefined,
  rpIdOverride?: string,
): PasskeyRpConfig | null {
  if (typeof origin !== 'string' || origin.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') return null;
  const rpID = rpIdOverride ?? parsed.hostname;
  if (parsed.hostname !== rpID && !parsed.hostname.endsWith(`.${rpID}`)) return null;
  return { rpID, rpName: 'QuantMail', origin: `${parsed.protocol}//${parsed.host}` };
}

/** The caller already checked the origin against the trusted-origin set. */
export function requestOrigin(request: { headers?: Record<string, unknown> }): string | undefined {
  const origin = request.headers?.['origin'];
  return typeof origin === 'string' ? origin : undefined;
}
