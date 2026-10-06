// ============================================================================
// QuantCooks — SSO handoff helper tests (P0-1).
//
// The QuantMail SSO chooser returns the user with a handoff JWT in the URL
// (?token=...). These helpers are the consumer half: read the token out of the
// query string, and scrub the token (and handoff PII) from the address bar so
// it never lingers in history/logs.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readSsoTokenFromSearch, scrubSsoParamsFromUrl } from '../sso-handoff';

describe('readSsoTokenFromSearch', () => {
  it('reads the primary ?token= param', () => {
    expect(readSsoTokenFromSearch('?returnTo=%2F&token=eyJhbGciOiJIUzI1NiJ9')).toBe(
      'eyJhbGciOiJIUzI1NiJ9',
    );
  });

  it('accepts a bare query string without a leading ?', () => {
    expect(readSsoTokenFromSearch('token=abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('falls back to accessToken / access_token / __quant_sso_ticket', () => {
    expect(readSsoTokenFromSearch('?accessToken=tok1234567')).toBe('tok1234567');
    expect(readSsoTokenFromSearch('?access_token=tok1234567')).toBe('tok1234567');
    expect(readSsoTokenFromSearch('?__quant_sso_ticket=tok1234567')).toBe('tok1234567');
  });

  it('prefers the first non-empty token param', () => {
    expect(readSsoTokenFromSearch('?token=&accessToken=tok1234567')).toBe('tok1234567');
  });

  it('returns null when no handoff token is present', () => {
    expect(readSsoTokenFromSearch('')).toBeNull();
    expect(readSsoTokenFromSearch('?returnTo=%2Feditor')).toBeNull();
    expect(readSsoTokenFromSearch('?token=')).toBeNull();
    expect(readSsoTokenFromSearch('?token=%20%20')).toBeNull();
  });

  it('never matches lookalike params (e.g. refreshToken, __quant_return)', () => {
    expect(readSsoTokenFromSearch('?refreshToken=tok1234567')).toBeNull();
    expect(readSsoTokenFromSearch('?__quant_return=%2F')).toBeNull();
  });
});

describe('scrubSsoParamsFromUrl', () => {
  it('removes token params but preserves returnTo and other params', () => {
    const scrubbed = scrubSsoParamsFromUrl(
      'https://quantcooks.quantrinity.in/login?returnTo=%2Feditor&token=eyJ.secret&accessToken=eyJ.secret',
    );
    expect(scrubbed).not.toContain('token=');
    expect(scrubbed).not.toContain('eyJ.secret');
    expect(scrubbed).toBe('/login?returnTo=%2Feditor');
  });

  it('removes __quant_sso_ticket, __quant_return and the chooser PII hints', () => {
    const scrubbed = scrubSsoParamsFromUrl(
      'https://quantcooks.quantrinity.in/login?__quant_sso_ticket=tok1234567&__quant_return=%2F&userId=u1&email=a%40b.c&displayName=Al',
    );
    expect(scrubbed).not.toContain('tok1234567');
    expect(scrubbed).not.toContain('userId=');
    expect(scrubbed).not.toContain('email=');
    expect(scrubbed).not.toContain('displayName=');
    expect(scrubbed).toBe('/login');
  });

  it('preserves the hash fragment', () => {
    const scrubbed = scrubSsoParamsFromUrl(
      'https://quantcooks.quantrinity.in/login?token=tok1234567#section',
    );
    expect(scrubbed).toBe('/login#section');
  });

  it('is a no-op when no handoff params exist', () => {
    expect(scrubSsoParamsFromUrl('https://quantcooks.quantrinity.in/login?returnTo=%2F')).toBe(
      '/login?returnTo=%2F',
    );
  });
});
