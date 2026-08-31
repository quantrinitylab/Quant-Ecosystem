/**
 * Primitives for real TOTP two-factor authentication.
 *
 * The previous implementation of `/auth/2fa/enable` verified a code with
 * `/^\d{6}$/` and never stored the secret it had shown the user, so "2FA
 * enabled" was a boolean and nothing more: any six digits turned it on, and
 * `/auth/login` never looked at it anyway. Everything here exists to make the
 * second factor actually cost an attacker something.
 *
 * Kept deliberately free of Fastify and Prisma so each rule — the challenge
 * key, the replay floor, the backup-code alphabet — can be tested directly
 * rather than through an HTTP round trip.
 */

import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getJwtRefreshSecret } from '@quant/auth/lib/secrets';

/** Seconds per TOTP step. RFC 6238's default, and what otplib uses. */
export const TOTP_STEP_SECONDS = 30;

/**
 * How long a login may sit half-finished. Long enough to fetch a phone from
 * another room, short enough that a challenge lifted from a proxy log is
 * useless by the time anyone reads it.
 */
export const CHALLENGE_TTL_SECONDS = 300;

const CHALLENGE_PURPOSE = 'quantmail.2fa-challenge';
const CHALLENGE_ISSUER = 'quantmail';
const CHALLENGE_AUDIENCE = 'quantmail-2fa';

/**
 * The challenge is signed with a key *derived* from the refresh secret rather
 * than the refresh secret itself. A challenge and a refresh token are both
 * "you are mid-authentication" bearer values, and signing them with the same
 * key is what makes cross-protocol confusion possible at all — deriving costs
 * one HMAC and removes the question.
 */
const challengeKey = (): Uint8Array =>
  new Uint8Array(
    createHmac('sha256', getJwtRefreshSecret()).update(`${CHALLENGE_PURPOSE}:v1`).digest(),
  );

export interface TwoFactorChallengeClaims {
  userId: string;
  /** Unix seconds. */
  issuedAt: number;
}

/**
 * Issue the token that stands in for "password accepted, second factor
 * outstanding". It carries no scopes and no role, so presenting it to a normal
 * authenticated route buys nothing even if the signature checked out.
 */
export async function signTwoFactorChallenge(
  userId: string,
  nowMs: number = Date.now(),
): Promise<{ challenge: string; expiresIn: number }> {
  const issuedAt = Math.floor(nowMs / 1000);
  const challenge = await new SignJWT({ purpose: CHALLENGE_PURPOSE })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(CHALLENGE_ISSUER)
    .setAudience(CHALLENGE_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + CHALLENGE_TTL_SECONDS)
    .sign(challengeKey());

  return { challenge, expiresIn: CHALLENGE_TTL_SECONDS };
}

/**
 * Returns the claims, or `null` for anything that is not a live challenge this
 * server issued. Callers must not distinguish the failure reasons to the
 * client: "expired" and "forged" are the same answer at the HTTP boundary.
 */
export async function verifyTwoFactorChallenge(
  challenge: string,
): Promise<TwoFactorChallengeClaims | null> {
  if (typeof challenge !== 'string' || challenge.length === 0) return null;

  try {
    const { payload } = await jwtVerify(challenge, challengeKey(), {
      issuer: CHALLENGE_ISSUER,
      audience: CHALLENGE_AUDIENCE,
      algorithms: ['HS256'],
    });

    if (payload['purpose'] !== CHALLENGE_PURPOSE) return null;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

    return { userId: payload.sub, issuedAt: typeof payload.iat === 'number' ? payload.iat : 0 };
  } catch {
    return null;
  }
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
const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const BACKUP_CODE_GROUP = 5;
const BACKUP_CODE_GROUPS = 2;

/** How many recovery codes an enrolment or regeneration hands out. */
export const BACKUP_CODE_COUNT = 10;

/**
 * 10 characters from a 31-symbol alphabet ≈ 49.6 bits, versus the 32 bits of
 * `totpService.generateBackupCodes()`. These are password-equivalent and
 * rate-limited but permanent, so they get the wider margin.
 */
export function generateBackupCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < BACKUP_CODE_GROUPS; g += 1) {
    let group = '';
    for (let i = 0; i < BACKUP_CODE_GROUP; i += 1) {
      group += BACKUP_CODE_ALPHABET[randomInt(BACKUP_CODE_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

export const generateBackupCodes = (count: number = BACKUP_CODE_COUNT): string[] =>
  Array.from({ length: count }, () => generateBackupCode());

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
  typeof code === 'string' &&
  normalizeBackupCode(code).length === BACKUP_CODE_GROUP * BACKUP_CODE_GROUPS;

/**
 * The `otpauth://` URI an authenticator scans or opens. Built here rather than
 * sent to a third-party image service: the URI *contains the shared secret*,
 * and the previous `/auth/2fa/setup` handed it to `api.qrserver.com` in a query
 * string, which put the second factor in someone else's access log.
 */
export function otpauthUri(secret: string, account: string, issuer = 'QuantMail'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
