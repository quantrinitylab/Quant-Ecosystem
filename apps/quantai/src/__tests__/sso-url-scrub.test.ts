import { describe, it, expect } from 'vitest';
import { SSO_HANDOFF_URL_PARAMS, scrubSsoHandoffParams } from '../lib/sso-url-params';

describe('SSO handoff URL scrubbing (P1: token + PII must not linger in URL)', () => {
  it('covers every legacy token alias', () => {
    for (const param of ['__quant_sso_ticket', 'token', 'accessToken', 'access_token']) {
      expect(SSO_HANDOFF_URL_PARAMS).toContain(param);
    }
  });

  it('covers the misleading refreshToken param and all PII params', () => {
    // refreshToken was a misnomer for the access token; userId/email/displayName
    // were appended by the account chooser but never consumed by any app.
    for (const param of ['refreshToken', 'userId', 'email', 'displayName', '__quant_return']) {
      expect(SSO_HANDOFF_URL_PARAMS).toContain(param);
    }
  });

  it('removes tokens and PII from a handoff URL but keeps safe params', () => {
    const url = new URL(
      'https://quantai.quantrinity.in/login?__quant_sso_ticket=tok123&token=tok123' +
        '&accessToken=tok123&refreshToken=tok123&userId=u1&email=a%40b.c' +
        '&displayName=Ab&__quant_return=%2Fchat&returnTo=%2Fchat&theme=dark',
    );
    scrubSsoHandoffParams(url);

    for (const param of SSO_HANDOFF_URL_PARAMS) {
      expect(url.searchParams.has(param)).toBe(false);
    }
    // Non-sensitive params survive.
    expect(url.searchParams.get('returnTo')).toBe('/chat');
    expect(url.searchParams.get('theme')).toBe('dark');
    expect(url.search).not.toContain('tok123');
    expect(url.search).not.toContain('a%40b.c');
  });

  it('is a no-op on URLs without handoff params', () => {
    const url = new URL('https://quantai.quantrinity.in/login?returnTo=%2F');
    scrubSsoHandoffParams(url);
    expect(url.search).toBe('?returnTo=%2F');
  });
});
