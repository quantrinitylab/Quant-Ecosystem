/**
 * The two-factor primitives, tested directly.
 *
 * These are the rules that decide whether the second factor costs an attacker
 * anything: what the challenge is signed with, whether an accepted code can be
 * presented twice, and what a recovery code is made of. Each one is checked here
 * rather than through an HTTP round trip, because a route test that happens to
 * pass tells you nothing about which of these held.
 */

import { createHmac } from 'node:crypto';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Long enough that jose accepts it as a raw HS256 key too — the derivation test
// below needs to attempt a verify with the undivided secret.
const REFRESH_SECRET = 'test-refresh-secret-long-enough-for-hs256-abcdef';

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => REFRESH_SECRET,
}));

import {
  BACKUP_CODE_COUNT,
  CHALLENGE_TTL_SECONDS,
  TOTP_STEP_SECONDS,
  digestsMatch,
  generateBackupCode,
  generateBackupCodes,
  hashBackupCode,
  isTotpStepReplayed,
  looksLikeBackupCode,
  looksLikeTotpCode,
  normalizeBackupCode,
  otpauthUri,
  signTwoFactorChallenge,
  totpReplayFloorAfter,
  totpStepFor,
  verifyTwoFactorChallenge,
} from '../lib/two-factor';

/** The key the module derives, re-derived here so forged tokens can be minted. */
const derivedKey = () =>
  new Uint8Array(
    createHmac('sha256', REFRESH_SECRET).update('quantmail.2fa-challenge:v1').digest(),
  );

const signWith = async (
  key: Uint8Array,
  claims: Record<string, unknown>,
  overrides: { issuer?: string; audience?: string; subject?: string } = {},
) => {
  const now = Math.floor(Date.now() / 1000);
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(overrides.issuer ?? 'quantmail')
    .setAudience(overrides.audience ?? 'quantmail-2fa')
    .setIssuedAt(now)
    .setExpirationTime(now + 300);
  if (overrides.subject !== undefined) jwt = jwt.setSubject(overrides.subject);
  return jwt.sign(key);
};

beforeEach(() => {
  vi.useRealTimers();
});

describe('two-factor login challenge', () => {
  it('round-trips the user it was issued for', async () => {
    const { challenge, expiresIn } = await signTwoFactorChallenge('user-1');

    expect(expiresIn).toBe(CHALLENGE_TTL_SECONDS);
    const claims = await verifyTwoFactorChallenge(challenge);
    expect(claims?.userId).toBe('user-1');
    expect(claims?.issuedAt).toBeGreaterThan(0);
  });

  it('rejects a tampered signature', async () => {
    // Twenty fresh challenges, because one signature is one sample: the earlier
    // version of this test flipped the LAST base64url character, which on 1 in 16
    // digests lands entirely in the two padding bits of the 43rd character — the
    // token then decodes back to the same 32 bytes and verifies. The first
    // character is six real bits of the digest, so a flip there always changes
    // byte 0.
    for (let i = 0; i < 20; i += 1) {
      const { challenge } = await signTwoFactorChallenge('user-1');
      const [header, payload, signature] = challenge.split('.');
      const firstChar = signature!.slice(0, 1);
      const flipped = `${firstChar === 'A' ? 'B' : 'A'}${signature!.slice(1)}`;

      expect(await verifyTwoFactorChallenge(`${header}.${payload}.${flipped}`)).toBeNull();
    }
  });

  it('rejects a payload edited to name a different user', async () => {
    const { challenge } = await signTwoFactorChallenge('user-1');
    const [header, payload, signature] = challenge.split('.');
    const decoded = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
    decoded.sub = 'user-2';
    const swapped = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');

    expect(await verifyTwoFactorChallenge(`${header}.${swapped}.${signature}`)).toBeNull();
  });

  it('rejects a challenge older than its TTL', async () => {
    const issuedAtMs = Date.now() - (CHALLENGE_TTL_SECONDS + 60) * 1000;
    const { challenge } = await signTwoFactorChallenge('user-1', issuedAtMs);

    expect(await verifyTwoFactorChallenge(challenge)).toBeNull();
  });

  it('still accepts a challenge that has not quite expired', async () => {
    const issuedAtMs = Date.now() - (CHALLENGE_TTL_SECONDS - 30) * 1000;
    const { challenge } = await signTwoFactorChallenge('user-1', issuedAtMs);

    expect((await verifyTwoFactorChallenge(challenge))?.userId).toBe('user-1');
  });

  /**
   * The point of deriving the challenge key: a challenge and a refresh token are
   * both "mid-authentication" bearer values, and signing them with one key is
   * what would let one be presented as the other.
   */
  it('is not signed with the refresh secret itself', async () => {
    const { challenge } = await signTwoFactorChallenge('user-1');
    const rawKey = new TextEncoder().encode(REFRESH_SECRET);

    const { jwtVerify } = await import('jose');
    await expect(jwtVerify(challenge, rawKey)).rejects.toThrow();
  });

  it('rejects a well-formed token that is missing the purpose claim', async () => {
    const forged = await signWith(derivedKey(), {}, { subject: 'user-1' });

    expect(await verifyTwoFactorChallenge(forged)).toBeNull();
  });

  it('rejects a token with the right key but the wrong issuer or audience', async () => {
    const claims = { purpose: 'quantmail.2fa-challenge' };
    const wrongIssuer = await signWith(derivedKey(), claims, {
      subject: 'user-1',
      issuer: 'somewhere-else',
    });
    const wrongAudience = await signWith(derivedKey(), claims, {
      subject: 'user-1',
      audience: 'quantmail-refresh',
    });

    expect(await verifyTwoFactorChallenge(wrongIssuer)).toBeNull();
    expect(await verifyTwoFactorChallenge(wrongAudience)).toBeNull();
  });

  it('rejects a token with no subject', async () => {
    const forged = await signWith(derivedKey(), { purpose: 'quantmail.2fa-challenge' });

    expect(await verifyTwoFactorChallenge(forged)).toBeNull();
  });

  it('rejects empty and non-string input without throwing', async () => {
    expect(await verifyTwoFactorChallenge('')).toBeNull();
    expect(await verifyTwoFactorChallenge('not-a-jwt')).toBeNull();
    expect(await verifyTwoFactorChallenge(undefined as unknown as string)).toBeNull();
    expect(await verifyTwoFactorChallenge(null as unknown as string)).toBeNull();
  });
});

describe('TOTP step accounting', () => {
  it('maps a moment onto its 30-second step', () => {
    expect(totpStepFor(0)).toBe(0);
    expect(totpStepFor(29_999)).toBe(0);
    expect(totpStepFor(30_000)).toBe(1);
    expect(totpStepFor(TOTP_STEP_SECONDS * 1000 * 1_000_000)).toBe(1_000_000);
  });

  /**
   * The floor is `accepted + 1`, not `accepted`: the code just accepted may have
   * been the *next* step's code on a fast clock, so a floor of `accepted` would
   * let that same code through once more.
   */
  it('sets the replay floor one step past the code it accepted', () => {
    expect(totpReplayFloorAfter(100)).toBe(101);
  });

  it('refuses every step at or below the stored floor', () => {
    const floor = totpReplayFloorAfter(100); // 101

    expect(isTotpStepReplayed(99, floor)).toBe(true);
    expect(isTotpStepReplayed(100, floor)).toBe(true);
    expect(isTotpStepReplayed(101, floor)).toBe(true);
    expect(isTotpStepReplayed(102, floor)).toBe(false);
  });

  it('treats an account that has never verified as not replayed', () => {
    expect(isTotpStepReplayed(1, null)).toBe(false);
    expect(isTotpStepReplayed(1, undefined)).toBe(false);
  });

  it('accepts a step of 0 as a real floor rather than a missing one', () => {
    expect(isTotpStepReplayed(0, 0)).toBe(true);
    expect(isTotpStepReplayed(1, 0)).toBe(false);
  });

  it('gates code shape before any crypto runs', () => {
    expect(looksLikeTotpCode('123456')).toBe(true);
    expect(looksLikeTotpCode(' 123456 ')).toBe(true);
    expect(looksLikeTotpCode('12345')).toBe(false);
    expect(looksLikeTotpCode('1234567')).toBe(false);
    expect(looksLikeTotpCode('12345a')).toBe(false);
    expect(looksLikeTotpCode('')).toBe(false);
    expect(looksLikeTotpCode(123456)).toBe(false);
    expect(looksLikeTotpCode(null)).toBe(false);
    expect(looksLikeTotpCode({ toString: () => '123456' })).toBe(false);
  });
});

describe('recovery codes', () => {
  it('prints as two five-character groups', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateBackupCode()).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}-[A-HJ-KM-NP-Z2-9]{5}$/);
    }
  });

  /** These are read off paper under stress; `O`/`0` and `I`/`1`/`L` are support tickets. */
  it('never emits an ambiguous character', () => {
    const emitted = new Set(generateBackupCodes(200).join('').replace(/-/g, ''));

    for (const ambiguous of ['O', 'I', 'L', '0', '1']) {
      expect(emitted.has(ambiguous)).toBe(false);
    }
    expect(emitted.size).toBeGreaterThan(20); // the alphabet is actually being used
  });

  it('hands out a full batch by default', () => {
    const codes = generateBackupCodes();

    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    expect(new Set(codes).size).toBe(BACKUP_CODE_COUNT);
  });

  it('folds away case, the printed hyphen and pasted whitespace', () => {
    expect(normalizeBackupCode('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(normalizeBackupCode(' ABCDE FGHJK ')).toBe('ABCDEFGHJK');
    expect(normalizeBackupCode('ABCDE—FGHJK')).toBe('ABCDEFGHJK');
  });

  it('hashes every human spelling of one code to the same digest', () => {
    const canonical = hashBackupCode('ABCDE-FGHJK');

    expect(hashBackupCode('abcde-fghjk')).toBe(canonical);
    expect(hashBackupCode('ABCDEFGHJK')).toBe(canonical);
    expect(hashBackupCode(' abcde fghjk ')).toBe(canonical);
    expect(hashBackupCode('ABCDE-FGHJM')).not.toBe(canonical);
  });

  it('produces a hex sha-256 digest and never the code itself', () => {
    const digest = hashBackupCode('ABCDE-FGHJK');

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain('ABCDE');
  });

  it('compares digests without leaking on length', () => {
    const a = hashBackupCode('ABCDE-FGHJK');

    expect(digestsMatch(a, a)).toBe(true);
    expect(digestsMatch(a, hashBackupCode('ABCDE-FGHJM'))).toBe(false);
    expect(digestsMatch(a, a.slice(0, 32))).toBe(false);
    expect(digestsMatch(a, '')).toBe(false);
    expect(digestsMatch(undefined as unknown as string, a)).toBe(false);
    expect(digestsMatch(a, null as unknown as string)).toBe(false);
  });

  it('accepts anything that normalises to ten characters', () => {
    expect(looksLikeBackupCode('ABCDE-FGHJK')).toBe(true);
    expect(looksLikeBackupCode('abcdefghjk')).toBe(true);
    expect(looksLikeBackupCode('ABCDE-FGHJ')).toBe(false);
    expect(looksLikeBackupCode('123456')).toBe(false);
    expect(looksLikeBackupCode('')).toBe(false);
    expect(looksLikeBackupCode(null)).toBe(false);
  });

  /** A six-digit TOTP code must never be mistaken for a recovery code. */
  it('does not confuse the two code shapes', () => {
    expect(looksLikeBackupCode('123456')).toBe(false);
    expect(looksLikeTotpCode('ABCDE-FGHJK')).toBe(false);
  });
});

describe('otpauth URI', () => {
  it('carries the secret and the parameters an authenticator needs', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'kundan@quantmail.in');
    const parsed = new URL(uri);

    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(parsed.searchParams.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(parsed.searchParams.get('issuer')).toBe('QuantMail');
    expect(parsed.searchParams.get('algorithm')).toBe('SHA1');
    expect(parsed.searchParams.get('digits')).toBe('6');
    expect(parsed.searchParams.get('period')).toBe(String(TOTP_STEP_SECONDS));
  });

  /**
   * The label is `issuer:account`, and the `@` in an address plus anything odd in
   * a display name has to survive as data — an unescaped label is how a URI stops
   * parsing halfway through on some scanners.
   */
  it('percent-encodes the label rather than pasting it in raw', () => {
    const uri = otpauthUri('SECRET', 'a b@quantmail.in', 'Quant Mail');
    const label = uri.slice('otpauth://totp/'.length, uri.indexOf('?'));

    expect(label).toBe('Quant%20Mail:a%20b%40quantmail.in');
    expect(decodeURIComponent(label.split(':')[1]!)).toBe('a b@quantmail.in');
  });
});
