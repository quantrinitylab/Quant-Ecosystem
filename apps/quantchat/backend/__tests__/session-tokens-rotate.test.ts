// ============================================================================
// quantchat — SessionTokenIssuer refresh verification + rotation
//
// The refresh flow used to be a dead end: tokens were issued with a
// `kind: 'refresh'` claim but nothing anywhere could verify or redeem one.
// These tests pin the issuer-side contract the new POST /auth/refresh route
// relies on: a refresh token verifies, an access token NEVER does (kinds
// are not interchangeable), tampered/expired tokens fail, and rotation
// mints a fresh pair (new session id) for the same subject.
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

describe('SessionTokenIssuer.rotate', () => {
  it('mints a fresh pair with a NEW session id for the same subject', async () => {
    const issuer = new SessionTokenIssuer(config);
    const original = await issuer.issue({ userId: 'user-9', username: 'carol' });

    const rotated = await issuer.rotate(original.refreshToken);
    expect(rotated).not.toBeNull();

    const oldPayload = decodePayload(original.refreshToken);
    const newAccess = decodePayload(rotated!.accessToken);
    const newRefresh = decodePayload(rotated!.refreshToken);

    expect(newAccess['sub']).toBe('user-9');
    expect(newAccess['username']).toBe('carol');
    expect(newAccess['kind']).toBe('access');
    expect(newRefresh['kind']).toBe('refresh');
    // Rotation = new session id (jti), shared by the new pair.
    expect(newAccess['jti']).not.toBe(oldPayload['jti']);
    expect(newRefresh['jti']).toBe(newAccess['jti']);
  });

  it('returns null when asked to rotate an ACCESS token', async () => {
    const issuer = new SessionTokenIssuer(config);
    const tokens = await issuer.issue({ userId: 'user-1', username: 'alice' });

    expect(await issuer.rotate(tokens.accessToken)).toBeNull();
  });
});
