import { describe, it, expect } from 'vitest';
import { SessionTokenIssuer, verifyHs256 } from '../lib/session-tokens';

const CONFIG = {
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quantai',
  jwtAudience: 'quant-ecosystem',
};

describe('SessionTokenIssuer (quantai)', () => {
  it('issues a Bearer <redacted> our own verifier accepts', async () => {
    const issuer = new SessionTokenIssuer(CONFIG);
    const tokens = await issuer.issue({
      userId: 'sso:u-1',
      username: 'alex',
      email: 'alex@quantmail.in',
      displayName: 'Alex',
    });
    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    const check = verifyHs256(tokens.accessToken, CONFIG);
    expect(check.valid).toBe(true);
    expect(check.payload?.['sub']).toBe('sso:u-1');
    expect(check.payload?.['email']).toBe('alex@quantmail.in');
    expect(check.payload?.['iss']).toBe('quantai');
    expect(check.payload?.['aud']).toBe('quant-ecosystem');
  });

  it('rejects tokens signed with a different secret', async () => {
    const issuer = new SessionTokenIssuer(CONFIG);
    const tokens = await issuer.issue({ userId: 'sso:u-1', username: 'a', email: 'a@b.c' });
    const check = verifyHs256(tokens.accessToken, { ...CONFIG, jwtSecret: 'wrong-secret-1234567890' });
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('bad-signature');
  });

  it('requires a strong secret', () => {
    expect(() => new SessionTokenIssuer({ ...CONFIG, jwtSecret: 'short' })).toThrow();
  });
});
