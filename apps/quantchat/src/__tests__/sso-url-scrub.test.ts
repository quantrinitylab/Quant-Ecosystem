// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { SSO_HANDOFF_URL_PARAMS, scrubSsoHandoffParams } from '../lib/sso-url-params';

describe('QuantChat SSO handoff URL scrubbing', () => {
  it('covers the Contract-B sso_ticket param and the OAuth2 code/state params', () => {
    for (const param of ['sso_ticket', 'code', 'state']) {
      expect(SSO_HANDOFF_URL_PARAMS).toContain(param);
    }
  });

  it('covers every legacy token alias', () => {
    for (const param of ['__quant_sso_ticket', 'token', 'accessToken', 'access_token']) {
      expect(SSO_HANDOFF_URL_PARAMS).toContain(param);
    }
  });

  it('removes tickets, codes, and tokens from a handoff URL but keeps safe params', () => {
    const url = new URL(
      'https://quantchat.quantrinity.in/login?sso_ticket=tick123&code=code123&state=st123' +
        '&token=tok123&__quant_sso_ticket=tok123&__quant_return=%2Fchat&returnTo=%2Fchat&theme=dark',
    );
    scrubSsoHandoffParams(url);

    for (const param of SSO_HANDOFF_URL_PARAMS) {
      expect(url.searchParams.has(param)).toBe(false);
    }
    // No credential material may remain anywhere in the URL.
    expect(url.search).not.toContain('tick123');
    expect(url.search).not.toContain('code123');
    expect(url.search).not.toContain('tok123');
    // Non-sensitive params survive.
    expect(url.searchParams.get('returnTo')).toBe('/chat');
    expect(url.searchParams.get('theme')).toBe('dark');
  });

  it('is a no-op on URLs without handoff params', () => {
    const url = new URL('https://quantchat.quantrinity.in/login?returnTo=%2F');
    scrubSsoHandoffParams(url);
    expect(url.search).toBe('?returnTo=%2F');
  });
});
