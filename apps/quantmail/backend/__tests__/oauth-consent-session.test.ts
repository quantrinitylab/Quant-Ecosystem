// @vitest-environment node
// ============================================================================
// Unit tests for the OAuth browser-consent session tokens
// (services/oauth-consent-session.ts).
// ============================================================================
//
// The HTML consent screen cannot send an Authorization header, so GET
// /oauth/authorize mints a short-lived, single-use, request-bound consent
// token and POST /oauth/consent accepts it instead of a Bearer <redacted>
// These tests pin the security properties: single-use, expiry, tamper
// resistance, token-type confusion resistance, and domain separation from
// the access-token and SSO-ticket secrets.

import { describe, it, expect, vi } from 'vitest';
import * as jose from 'jose';

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: vi.fn(() => 'test-jwt-secret'),
  getJwtRefreshSecret: vi.fn(() => 'test-refresh-secret'),
}));

import {
  mintConsentToken,
  verifyConsentToken,
  consumeConsentToken,
  getConsentSecretForTests,
  CONSENT_TOKEN_TTL_SECONDS,
  CONSENT_TOKEN_TYPE,
} from '../services/oauth-consent-session';
import {
  mintSsoTicket,
  verifySsoTicket,
  getSsoTicketSecretForTests,
} from '../services/sso-ticket';

const claims = {
  userId: 'user-1',
  clientId: 'client-1',
  redirectUri: 'https://app.test.com/callback',
  scope: 'openid profile email',
  state: 'xyz',
  codeChallenge: 'challenge-abc',
  codeChallengeMethod: 'S256',
  nonce: 'nonce-123',
};

describe('oauth-consent-session', () => {
  it('mints a token that verifies with all bound claims', async () => {
    const token = await mintConsentToken(claims);
    const payload = await verifyConsentToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe('user-1');
    expect(payload!.clientId).toBe('client-1');
    expect(payload!.redirectUri).toBe('https://app.test.com/callback');
    expect(payload!.scope).toBe('openid profile email');
    expect(payload!.state).toBe('xyz');
    expect(payload!.codeChallenge).toBe('challenge-abc');
    expect(payload!.codeChallengeMethod).toBe('S256');
    expect(payload!.nonce).toBe('nonce-123');
    expect(payload!.tokenType).toBe(CONSENT_TOKEN_TYPE);
    expect(typeof payload!.jti).toBe('string');
  });

  it('verifies WITHOUT consuming: consume still succeeds afterwards', async () => {
    const token = await mintConsentToken(claims);
    expect(await verifyConsentToken(token)).not.toBeNull();
    expect(await verifyConsentToken(token)).not.toBeNull();
    const consumed = await consumeConsentToken(token);
    expect(consumed).not.toBeNull();
    expect(consumed!.userId).toBe('user-1');
  });

  it('rejects replay: the second consume of the same token returns null', async () => {
    const token = await mintConsentToken(claims);
    expect(await consumeConsentToken(token)).not.toBeNull();
    expect(await consumeConsentToken(token)).toBeNull();
    expect(await verifyConsentToken(token)).not.toBeNull(); // verify is non-consuming
    expect(await consumeConsentToken(token)).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await mintConsentToken(claims);
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    expect(await verifyConsentToken(tampered)).toBeNull();
    expect(await consumeConsentToken(tampered)).toBeNull();
  });

  it('rejects garbage, empty, and non-string input', async () => {
    expect(await verifyConsentToken('')).toBeNull();
    expect(await verifyConsentToken('not-a-jwt')).toBeNull();
    expect(await verifyConsentToken(null as unknown as string)).toBeNull();
    expect(await consumeConsentToken('')).toBeNull();
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await new jose.SignJWT({ tokenType: CONSENT_TOKEN_TYPE })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('user-1')
      .setJti('expired-jti')
      .setIssuer('quantmail')
      .setAudience('quant-ecosystem')
      .setIssuedAt(now - 1200)
      .setExpirationTime(now - 600)
      .sign(getConsentSecretForTests());
    expect(await verifyConsentToken(expired)).toBeNull();
    expect(await consumeConsentToken(expired)).toBeNull();
  });

  it('rejects a token with the wrong tokenType (type-confusion guard)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const wrongType = await new jose.SignJWT({ tokenType: 'sso-ticket' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('user-1')
      .setJti('wrong-type-jti')
      .setIssuer('quantmail')
      .setAudience('quant-ecosystem')
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(getConsentSecretForTests());
    expect(await verifyConsentToken(wrongType)).toBeNull();
  });

  it('a real SSO ticket does NOT verify as a consent token and vice versa', async () => {
    const ssoTicket = await mintSsoTicket({
      userId: 'user-1',
      email: 'user@test.com',
      username: 'user',
      displayName: 'User',
    });
    expect(await verifyConsentToken(ssoTicket)).toBeNull();

    const consentToken = await mintConsentToken(claims);
    expect(await verifySsoTicket(consentToken)).toBeNull();
  });

  it('uses a domain-separated secret (differs from the SSO-ticket secret)', async () => {
    const a = getConsentSecretForTests();
    const b = getSsoTicketSecretForTests();
    expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'));
  });

  it('mint requires userId, clientId, and redirectUri', async () => {
    await expect(mintConsentToken({ ...claims, userId: '' })).rejects.toThrow();
    await expect(mintConsentToken({ ...claims, clientId: '' })).rejects.toThrow();
    await expect(mintConsentToken({ ...claims, redirectUri: '' })).rejects.toThrow();
  });

  it('tokens expire within the documented TTL', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await mintConsentToken(claims);
    const { payload } = await jose.jwtVerify(token, getConsentSecretForTests());
    expect(payload.exp! - before).toBeLessThanOrEqual(CONSENT_TOKEN_TTL_SECONDS);
    expect(payload.exp! - before).toBeGreaterThan(0);
  });
});
