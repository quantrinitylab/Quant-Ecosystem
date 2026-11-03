// ============================================================================
// QuantChat - Two-factor (TOTP) challenge primitives
// ============================================================================
//
// QC-F-141: QuantChat's `POST /auth/login` never read the shared User row's
// 2FA state — a user with `twoFactorEnabled = true` got a full session on
// password alone, bypassing the second factor the same row enforces on
// QuantMail. These primitives mirror QuantMail's canonical
// `apps/quantmail/backend/lib/two-factor.ts` (same challenge shape, TTL,
// replay-floor and backup-code rules) so both apps honour the same
// `twoFactorEnabled` on the same shared `User` row. Kept deliberately free of
// Fastify and Prisma so each rule can be tested directly.
//
// Deliberate QuantChat differences from the QuantMail file:
//   - Signing uses node:crypto HMAC-SHA256 directly (the pattern in
//     `session-tokens.ts`) — this package has no `jose` dependency.
//   - The challenge key is derived from the app's JWT_SECRET (HMAC, domain
//     separation `quantchat.2fa-challenge:v1`), not the refresh secret, which
//     QuantChat's backend does not read from the environment at all.
//   - Enrolment helpers (otpauthUri, generateBackupCodes) are NOT ported:
//     2FA enrolment happens on QuantMail; QuantChat only honours it at login.
// ============================================================================

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Seconds per TOTP step. RFC 6238's default, and what otplib uses. */
export const TOTP_STEP_SECONDS = 30;

/**
 * How long a login may sit half-finished. Long enough to fetch a phone from
 * another room, short enough that a challenge lifted from a proxy log is
 * useless by the time anyone reads it.
 */
export const CHALLENGE_TTL_SECONDS = 300;

const CHALLENGE_PURPOSE = 'quantchat.2fa-challenge';
const CHALLENGE_KEY_DOMAIN = 'quantchat.2fa-challenge:v1';

export interface ChallengeSigningConfig {
  /** The app's session JWT secret; the challenge key is DERIVED from it. */
  jwtSecret: string;
  /** Session issuer (default 'quantchat'); the challenge issuer matches it. */
  jwtIssuer: string;
}

/**
 * The challenge is signed with a key *derived* from the session secret rather
 * than the session secret itself. A challenge and a session token are both
 * "you are mid-authentication" bearer <redacted>, and signing them with the same
 * key is what makes cross-protocol confusion possible at all — deriving costs
 * one HMAC and removes the question.
 */
const challengeKey = (config: ChallengeSigningConfig): Buffer =>
  createHmac('sha256', config.jwtSecret).update(CHALLENGE_KEY_DOMAIN).digest();

const challengeAudience = (config: ChallengeSigningConfig): string =>
  `${config.jwtIssuer}-2fa`;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface TwoFactorChallengeClaims {
  userId: string;
  /** Unix seconds. */
  issuedAt: number;
}

/**
 * Issue the token that stands in for "password accepted, second factor
 * outstanding". It carries no scopes, no role and no `kind` claim, and its
 * audience is `<issuer>-2fa` — presenting it to a normal authenticated route
 * buys nothing even if the signature checked out.
 */
export function signTwoFactorChallenge(
  userId: string,
  config: ChallengeSigningConfig,
  nowMs: number = Date.now(),
): { challenge: string; expiresIn: number } {
  const issuedAt = Math.floor(nowMs / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    purpose: CHALLENGE_PURPOSE,
    sub: userId,
    iss: config.jwtIssuer,
    aud: challengeAudience(config),
    iat: issuedAt,
    exp: issuedAt + CHALLENGE_TTL_SECONDS,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(createHmac('sha256', challengeKey(config)).update(signingInput).digest());
  return { challenge: `${signingInput}.${signature}`, expiresIn: CHALLENGE_TTL_SECONDS };
}

/**
 * Returns the claims, or `null` for anything that is not a live challenge this
 * server issued. Callers must not distinguish the failure reasons to the
 * client: "expired" and "forged" are the same answer at the HTTP boundary.
 */
export function verifyTwoFactorChallenge(
  challenge: unknown,
  config: ChallengeSigningConfig,
): TwoFactorChallengeClaims | null {
  if (typeof challenge !== 'string' || challenge.length === 0) return null;
  const parts = challenge.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts as [string, string, string];
  const expected = base64url(createHmac('sha256', challengeKey(config)).update(`${h}.${p}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(p, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (payload['iss'] !== config.jwtIssuer) return null;
  if (payload['aud'] !== challengeAudience(config)) return null;
  if (payload['purpose'] !== CHALLENGE_PURPOSE) return null;
  if (typeof payload['sub'] !== 'string' || payload['sub'].length === 0) return null;
  if (typeof payload['exp'] === 'number' && payload['exp'] < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return {
    userId: payload['sub'],
    issuedAt: typeof payload['iat'] === 'number' ? payload['iat'] : 0,
  };
}

/** The TOTP step number a given moment falls in. */
export const totpStepFor = (nowMs: number = Date.now()): number =>
  Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);

/**
 * A TOTP code is accepted across three steps (previous, current, next) because
 * clocks drift, which means a code captured off the wire stays valid for up to
 * 90 seconds. Storing a floor and refusing anything at or below it is what
 * closes that window.
 *
 * The floor is `acceptedStep + 1` rather than `acceptedStep`: the code just
 * accepted may have been the *next* step's code on a fast clock, so a floor of
 * `acceptedStep` would still let it through once more. The cost is a wait of up
 * to 60 seconds before a second verification succeeds — which only affects
 * flows that verify twice in a row, and none of ours do.
 */
export const totpReplayFloorAfter = (acceptedStep: number): number => acceptedStep + 1;

export const isTotpStepReplayed = (
  currentStep: number,
  lastUsedStep: number | null | undefined,
): boolean => typeof lastUsedStep === 'number' && currentStep <= lastUsedStep;

/** Cheap shape gate so a garbage body never reaches the crypto. */
export const looksLikeTotpCode = (code: unknown): code is string =>
  typeof code === 'string' && /^\d{6}$/.test(code.trim());

/**
 * Recovery-code alphabet: uppercase letters and digits minus `O`, `I`, `L` and
 * `0`, `1`. These are codes people read off paper and retype under stress —
 * ambiguity between them is the whole reason support tickets exist.
 */
const BACKUP_CODE_GROUP = 5;
const BACKUP_CODE_GROUPS = 2;
const BACKUP_CODE_LENGTH = BACKUP_CODE_GROUP * BACKUP_CODE_GROUPS;

/**
 * Fold away everything a human might add or drop: case, the hyphen we print
 * for legibility, and any whitespace picked up from a copy-paste. What is
 * hashed is what survives this.
 */
export const normalizeBackupCode = (code: string): string =>
  code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Recovery codes are stored as digests, never in the clear. The point of a
 * recovery code is to work when the authenticator is gone, so a readable table
 * would hand over every second factor at once. No salt and no KDF: the input is
 * ~50 bits of server-chosen randomness, not a human password, so there is
 * nothing for a dictionary to chew on and the per-attempt cost would only slow
 * down the legitimate check.
 */
export const hashBackupCode = (code: string): string =>
  createHash('sha256').update(normalizeBackupCode(code)).digest('hex');

/** Constant-time comparison for the hex digests above. */
export function digestsMatch(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export const looksLikeBackupCode = (code: unknown): code is string =>
  typeof code === 'string' && normalizeBackupCode(code).length === BACKUP_CODE_LENGTH;
