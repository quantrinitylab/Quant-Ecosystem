/**
 * Passkey challenge-token rules (backend/lib/passkeys.ts), tested directly
 * rather than through HTTP: the token is what binds a browser ceremony to
 * one user, one purpose, and a 5-minute window.
 *
 * The refresh secret is mocked; jose is real, so a token this test mints
 * is verified by the real verifier — a mock here would prove nothing.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => 'test-refresh-secret-which-is-long-enough',
}));

import {
  passkeyRpConfig,
  signPasskeyChallenge,
  verifyPasskeyChallenge,
} from '../lib/passkeys';

describe('passkey challenge tokens', () => {
  it('round-trips: a token minted for login verifies for login', async () => {
    const { challengeToken } = await signPasskeyChallenge({
      userId: 'user-1',
      purpose: 'login',
      challenge: 'abc-def-challenge',
    });
    const claims = await verifyPasskeyChallenge(challengeToken, 'login');
    expect(claims).toMatchObject({
      userId: 'user-1',
      purpose: 'login',
      challenge: 'abc-def-challenge',
    });
  });

  it('a login token verifies nothing for register (purpose confusion closed)', async () => {
    const { challengeToken } = await signPasskeyChallenge({
      userId: 'user-1',
      purpose: 'login',
      challenge: 'abc-def-challenge',
    });
    await expect(verifyPasskeyChallenge(challengeToken, 'register')).resolves.toBeNull();
  });

  it('a forged token verifies to null, not to an exception', async () => {
    await expect(verifyPasskeyChallenge('not-a-jwt', 'login')).resolves.toBeNull();
    await expect(verifyPasskeyChallenge('', 'login')).resolves.toBeNull();
  });

  it('a token minted in the past beyond the TTL is dead', async () => {
    const { challengeToken } = await signPasskeyChallenge(
      { userId: 'user-1', purpose: 'login', challenge: 'old-challenge' },
      Date.now() - 10 * 60 * 1000,
    );
    await expect(verifyPasskeyChallenge(challengeToken, 'login')).resolves.toBeNull();
  });
});

describe('passkey relying-party config', () => {
  it('localhost derives rpID localhost (development)', () => {
    expect(passkeyRpConfig('http://localhost:3000')).toMatchObject({
      rpID: 'localhost',
      origin: 'http://localhost:3000',
    });
  });

  it('plain http on a non-localhost host is rejected', () => {
    expect(passkeyRpConfig('http://quantmail.in')).toBeNull();
  });

  it('a pinned RP ID accepts itself and its subdomains, nothing else', () => {
    expect(passkeyRpConfig('https://quantmail.in', 'quantmail.in')).toMatchObject({
      rpID: 'quantmail.in',
    });
    expect(passkeyRpConfig('https://app.quantmail.in', 'quantmail.in')).toMatchObject({
      rpID: 'quantmail.in',
    });
    expect(passkeyRpConfig('https://evilquantmail.in', 'quantmail.in')).toBeNull();
    expect(passkeyRpConfig('https://quantmail.in.evil.com', 'quantmail.in')).toBeNull();
  });

  it('no origin means no config (fail closed, not a default)', () => {
    expect(passkeyRpConfig(undefined)).toBeNull();
  });
});
