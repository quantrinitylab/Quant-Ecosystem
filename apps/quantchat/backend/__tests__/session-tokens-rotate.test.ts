// ============================================================================
// quantchat — SessionTokenIssuer refresh verification
//
// The refresh flow used to be a dead end: tokens were issued with a
// `kind: 'refresh'` claim but nothing anywhere could verify or redeem one.
// These tests pin the issuer-side contract the POST /auth/refresh route
// relies on: a refresh token verifies, an access token NEVER does (kinds
// are not interchangeable), and tampered/expired tokens fail.
//
// QC-F-118 removed the issuer's stateless `rotate()` entirely: rotation is
// now the RefreshTokenStore's stateful redemption (spend + reuse
// detection + family revocation), pinned by refresh-token-store.test.ts
// and qc-f-118-refresh-logout.routes.test.ts. A bare verify+issue helper
// left the previous token immortal until its own expiry.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { SessionTokenIssuer } from '../lib/session-tokens';

const config = {
  jwtSecret: 'test-secret-at-least-32-chars-long-000',
  jwtIssuer: 'quantchat',
  jwtAudience: 'quant-ecosystem',
};

function decodePayload(token: string): Record<string, unknown> {
  const p = token.split('.')[1]!;
  return JSON.parse(Buffer.from(p, 'base64').toString('utf8')) as Record<string, unknown>;
}

describe('SessionTokenIssuer.verifyRefreshToken', () => {
  it('accepts a genuine refresh token and returns its payload', async () => {
    const issuer = new SessionTokenIssuer(config);
    const tokens = await issuer.issue({ userId: 'user-1', username: 'alice' });

    const payload = issuer.verifyRefreshToken(tokens.refreshToken);
    expect(payload).not.toBeNull();
    expect(payload?.['sub']).toBe('user-1');
    expect(payload?.['kind']).toBe('refresh');
  });

  it('REJECTS an access token presented as a refresh token', async () => {
    const issuer = new SessionTokenIssuer(config);
    const tokens = await issuer.issue({ userId: 'user-1', username: 'alice' });

    expect(issuer.verifyRefreshToken(tokens.accessToken)).toBeNull();
  });

  it('rejects a tampered refresh token (signature mismatch)', async () => {
    const issuer = new SessionTokenIssuer(config);
    const tokens = await issuer.issue({ userId: 'user-1', username: 'alice' });
    const [h, p, sig] = tokens.refreshToken.split('.') as [string, string, string];
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);

    expect(issuer.verifyRefreshToken(`${h}.${p}.${flipped}`)).toBeNull();
  });

  it('rejects an expired refresh token', async () => {
    const issuer = new SessionTokenIssuer({ ...config, refreshTtlSec: -10 });
    const tokens = await issuer.issue({ userId: 'user-1', username: 'alice' });

    expect(issuer.verifyRefreshToken(tokens.refreshToken)).toBeNull();
  });

  it('rejects garbage input', () => {
    const issuer = new SessionTokenIssuer(config);
    expect(issuer.verifyRefreshToken('not-a-jwt')).toBeNull();
    expect(issuer.verifyRefreshToken('')).toBeNull();
  });
});

describe('SessionTokenIssuer has no stateless rotate (QC-F-118)', () => {
  it('rotate is gone — redemption belongs to the store', () => {
    const issuer = new SessionTokenIssuer(config);
    expect((issuer as unknown as Record<string, unknown>)['rotate']).toBeUndefined();
  });

  it('a verified refresh payload carries the fam + jti the store redeems against', async () => {
    const issuer = new SessionTokenIssuer(config);
    const tokens = await issuer.issue({ userId: 'user-9', username: 'carol' });

    const payload = issuer.verifyRefreshToken(tokens.refreshToken);
    expect(payload?.['jti']).toBe(tokens.refreshTokenId);
    expect(payload?.['fam']).toBe(tokens.familyId);
    expect(payload?.['sub']).toBe('user-9');
    // decodePayload sanity: the raw claims agree with the verified payload.
    expect(decodePayload(tokens.refreshToken)['fam']).toBe(tokens.familyId);
  });
});
