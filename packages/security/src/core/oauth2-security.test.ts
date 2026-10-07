import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { OAuth2Security } from './oauth2-security';

describe('OAuth2Security PKCE (real S256)', () => {
  it('generatePKCE produces a code_challenge equal to BASE64URL(SHA256(verifier))', () => {
    const oauth = new OAuth2Security();
    const pkce = oauth.generatePKCE();

    // Oracle: compute the RFC 7636 S256 challenge with Node crypto directly.
    const expected = crypto.createHash('sha256').update(pkce.codeVerifier).digest('base64url');

    expect(pkce.method).toBe('S256');
    expect(pkce.codeChallenge).toBe(expected);
    // base64url: no padding, no '+' or '/'
    expect(pkce.codeChallenge).not.toMatch(/[+/=]/);
  });

  it('validatePKCE accepts the matching verifier and rejects a wrong one', () => {
    const oauth = new OAuth2Security();
    const pkce = oauth.generatePKCE();

    expect(oauth.validatePKCE(pkce.codeVerifier, pkce.codeChallenge)).toBe(true);
    expect(oauth.validatePKCE(`${pkce.codeVerifier}x`, pkce.codeChallenge)).toBe(false);
  });

  it('completes a full PKCE S256 authorization-code exchange and rejects a bad verifier', async () => {
    const oauth = new OAuth2Security({
      requirePKCE: true,
      redirectUris: ['https://app.example.com/callback'],
      allowedScopes: ['read', 'write'],
    });

    const pkce = oauth.generatePKCE();
    const created = await oauth.createAuthRequest({
      clientId: 'client-1',
      redirectUri: 'https://app.example.com/callback',
      scope: ['read'],
      responseType: 'code',
      codeChallenge: pkce.codeChallenge,
      codeChallengeMethod: 'S256',
    });
    expect('requestId' in created).toBe(true);
    if (!('requestId' in created)) return;

    const code = await oauth.issueAuthCode(created.requestId);
    expect(code).toBeTruthy();

    // Wrong verifier must fail PKCE validation.
    const badExchange = await oauth.exchangeCode(
      code!,
      'not-the-verifier',
      'https://app.example.com/callback',
      'client-1',
    );
    expect(badExchange.success).toBe(false);
    expect(badExchange.error).toBe('pkce_validation_failed');

    // Re-issue a fresh code (previous one is consumed only on success; here it survived a failed PKCE check).
    const goodExchange = await oauth.exchangeCode(
      code!,
      pkce.codeVerifier,
      'https://app.example.com/callback',
      'client-1',
    );
    expect(goodExchange.success).toBe(true);
    expect(goodExchange.accessToken).toBeTruthy();
  });
});
