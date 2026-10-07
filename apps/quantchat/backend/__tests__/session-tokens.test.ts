import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { SessionTokenIssuer, verifyHs256 } from '../lib/session-tokens';

const config = {
  jwtSecret: 'test-secret-at-least-32-chars-long-000',
  jwtIssuer: 'quantchat',
  jwtAudience: 'quant-ecosystem',
};

function decodePayload(token: string): Record<string, unknown> {
  const p = token.split('.')[1]!;
  return JSON.parse(Buffer.from(p, 'base64').toString('utf8')) as Record<string, unknown>;
}

describe('SessionTokenIssuer', () => {
  it('rejects a weak secret', () => {
    expect(() => new SessionTokenIssuer({ ...config, jwtSecret: 'short' })).toThrow();
  });

  it('issues a well-formed 3-part HS256 JWT with the expected claims', async () => {
    const issuer = new SessionTokenIssuer(config);
    const tokens = await issuer.issue({ userId: 'user-1', username: 'alice' });

    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.expiresIn).toBeGreaterThan(0);
    expect(tokens.accessToken.split('.')).toHaveLength(3);

    const payload = decodePayload(tokens.accessToken);
    expect(payload['sub']).toBe('user-1');
    expect(payload['username']).toBe('alice');
    expect(payload['app']).toBe('quantchat');
    expect(payload['kind']).toBe('access');
    expect(payload['iss']).toBe('quantchat');
    expect(payload['aud']).toBe('quant-ecosystem');
    expect(payload['jti']).toBeTruthy();
  });

  it('produces a signature the verifier (and server-core auth plugin) accepts', async () => {
    const issuer = new SessionTokenIssuer(config);
    const tokens = await issuer.issue({ userId: 'u', username: 'bob' });
    const v = verifyHs256(tokens.accessToken, config);
    expect(v.valid).toBe(true);
    expect(v.payload?.['sub']).toBe('u');

    // Independently recompute the HMAC to prove the signing is correct HS256.
    const [h, p, sig] = tokens.accessToken.split('.') as [string, string, string];
    const expected = createHmac('sha256', config.jwtSecret)
      .update(`${h}.${p}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(sig).toBe(expected);
  });

  it('access + refresh share the same session id (jti)', async () => {
    const issuer = new SessionTokenIssuer(config);
    const tokens = await issuer.issue({ userId: 'u', username: 'u' });
    expect(decodePayload(tokens.accessToken)['jti']).toBe(
      decodePayload(tokens.refreshToken)['jti'],
    );
    expect(decodePayload(tokens.refreshToken)['kind']).toBe('refresh');
  });

  it('rejects tokens signed with a different secret', async () => {
    const issuer = new SessionTokenIssuer({
      ...config,
      jwtSecret: 'a-completely-different-secret-32x',
    });
    const tokens = await issuer.issue({ userId: 'u', username: 'u' });
    expect(verifyHs256(tokens.accessToken, config).valid).toBe(false);
  });

  it('rejects tampered payloads', async () => {
    const issuer = new SessionTokenIssuer(config);
    const tokens = await issuer.issue({ userId: 'u', username: 'u' });
    const [h, , sig] = tokens.accessToken.split('.') as [string, string, string];
    const forged = Buffer.from(
      JSON.stringify({ sub: 'admin', iss: 'quantchat', aud: 'quant-ecosystem' }),
    )
      .toString('base64')
      .replace(/=+$/, '');
    expect(verifyHs256(`${h}.${forged}.${sig}`, config).valid).toBe(false);
  });

  it('rejects expired tokens', async () => {
    const issuer = new SessionTokenIssuer({ ...config, accessTtlSec: -10 });
    const tokens = await issuer.issue({ userId: 'u', username: 'u' });
    const v = verifyHs256(tokens.accessToken, config);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('expired');
  });
});
