import { describe, it, expect } from 'vitest';
import { buildSsoUrl, validateIdentifier } from '../LoginPage';

describe('buildSsoUrl', () => {
  it('builds the QuantMail SSO entry URL with an encoded /login returnTo', () => {
    const url = buildSsoUrl('https://quantchat.quantrinity.in', null);
    expect(url).toContain('/sso?returnTo=');
    expect(url).toContain('client_id=quantchat');
    const returnTo = new URL(url).searchParams.get('returnTo');
    expect(returnTo).toBe('https://quantchat.quantrinity.in/login');
  });

  it('preserves an in-app returnTo across the SSO round-trip', () => {
    const url = buildSsoUrl('https://quantchat.quantrinity.in', '/chat/conv_1');
    const returnTo = new URL(url).searchParams.get('returnTo');
    expect(returnTo).toBe('https://quantchat.quantrinity.in/login?returnTo=%2Fchat%2Fconv_1');
  });

  it('drops a returnTo that points back at /login itself (no loop)', () => {
    const url = buildSsoUrl('https://quantchat.quantrinity.in', '/login');
    const returnTo = new URL(url).searchParams.get('returnTo');
    expect(returnTo).toBe('https://quantchat.quantrinity.in/login');
  });
});

describe('validateIdentifier', () => {
  it('requires a value', () => {
    expect(validateIdentifier('')).toBe('Enter your email or username');
    expect(validateIdentifier('   ')).toBe('Enter your email or username');
  });

  it('accepts well-formed emails and usernames', () => {
    expect(validateIdentifier('user@quantmail.in')).toBeNull();
    expect(validateIdentifier('alice.smith')).toBeNull();
    expect(validateIdentifier('alice_09-x')).toBeNull();
  });

  it('rejects malformed emails honestly instead of blaming the password later', () => {
    // The live audit: 'not-an-email' was silently accepted as a "username"
    // and the failure surfaced as a generic credentials error.
    expect(validateIdentifier('not-an-email@')).toBe('Enter a valid email address');
    expect(validateIdentifier('user@quantmail')).toBe('Enter a valid email address');
    expect(validateIdentifier('user@@quantmail.in')).toBe('Enter a valid email address');
    expect(validateIdentifier('user @quantmail.in')).toBe('Enter a valid email address');
  });

  it('rejects malformed usernames with the account rules', () => {
    expect(validateIdentifier('ab')).toMatch(/Usernames are 3–30 characters/);
    expect(validateIdentifier('has space')).toMatch(/Usernames are 3–30 characters/);
    expect(validateIdentifier('a'.repeat(31))).toMatch(/Usernames are 3–30 characters/);
  });
});
