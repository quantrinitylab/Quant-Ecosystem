import { describe, it, expect } from 'vitest';
import { resolvePostSsoDestination } from '../lib/post-sso-destination';

const FALLBACK = '/';

describe('resolvePostSsoDestination (F-207)', () => {
  it('falls back on malformed percent-encoding instead of throwing', () => {
    // decodeURIComponent('%') and decodeURIComponent('%zz') both throw URIError
    expect(() => resolvePostSsoDestination('%', FALLBACK)).not.toThrow();
    expect(resolvePostSsoDestination('%', FALLBACK)).toBe(FALLBACK);
    expect(resolvePostSsoDestination('%zz', FALLBACK)).toBe(FALLBACK);
    expect(resolvePostSsoDestination('/ask%2', FALLBACK)).toBe(FALLBACK);
    expect(resolvePostSsoDestination('100%', FALLBACK)).toBe(FALLBACK);
  });

  it('decodes a valid percent-encoded returnTo with query params', () => {
    expect(resolvePostSsoDestination('%2Fsessions%3Ftab%3Dall', FALLBACK)).toBe('/sessions?tab=all');
    expect(resolvePostSsoDestination('%2Fvoice%3Fmode%3Dlive', FALLBACK)).toBe('/voice?mode=live');
  });

  it('accepts a plain (unencoded) same-origin path', () => {
    expect(resolvePostSsoDestination('/ask', FALLBACK)).toBe('/ask');
    expect(resolvePostSsoDestination('/', FALLBACK)).toBe('/');
  });

  it('falls back for missing or empty returnTo', () => {
    expect(resolvePostSsoDestination(null, FALLBACK)).toBe(FALLBACK);
    expect(resolvePostSsoDestination(undefined, FALLBACK)).toBe(FALLBACK);
    expect(resolvePostSsoDestination('', FALLBACK)).toBe(FALLBACK);
    expect(resolvePostSsoDestination('%20%20', FALLBACK)).toBe(FALLBACK); // decodes to whitespace
  });

  it('rejects open-redirect / unsafe targets that decode successfully', () => {
    expect(resolvePostSsoDestination('https%3A%2F%2Fevil.com%2Fsteal', FALLBACK)).toBe(FALLBACK);
    expect(resolvePostSsoDestination('https://evil.com/steal', FALLBACK)).toBe(FALLBACK);
    expect(resolvePostSsoDestination('%2F%2Fevil.com%2Fx', FALLBACK)).toBe(FALLBACK); // //evil.com/x
    expect(resolvePostSsoDestination('javascript%3Aalert(1)', FALLBACK)).toBe(FALLBACK);
  });

  it('never redirects back into /login (self-loop guard)', () => {
    expect(resolvePostSsoDestination('/login', FALLBACK)).toBe(FALLBACK);
    expect(resolvePostSsoDestination('%2Flogin', FALLBACK)).toBe(FALLBACK);
  });

  it('honors a caller-supplied non-root fallback', () => {
    expect(resolvePostSsoDestination('%', '/voice')).toBe('/voice');
    expect(resolvePostSsoDestination('https://evil.com/', '/sessions')).toBe('/sessions');
    expect(resolvePostSsoDestination(null, '/ask')).toBe('/ask');
  });

  it('always returns a string, never undefined', () => {
    const inputs = ['%', '%2Fask', '/ask', null, '', 'https://evil.com'];
    for (const input of inputs) {
      expect(typeof resolvePostSsoDestination(input, FALLBACK)).toBe('string');
    }
  });
});
