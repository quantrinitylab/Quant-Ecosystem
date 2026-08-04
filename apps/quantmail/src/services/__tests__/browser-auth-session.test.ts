import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sessionSource = readFileSync(new URL('../browser-auth-session.ts', import.meta.url), 'utf8');
const providerSource = readFileSync(
  new URL('../../providers/auth-provider.tsx', import.meta.url),
  'utf8',
);

describe('browserAuthSession source boundary', () => {
  it('deletes every legacy JavaScript-readable token key', () => {
    for (const key of [
      'quant_auth_tokens',
      'quant_access_token',
      'quant_refresh_token',
      'token',
      'refreshToken',
    ]) {
      expect(sessionSource).toContain(`'${key}'`);
    }
    expect(sessionSource).toContain('window.localStorage.removeItem(key)');
    expect(sessionSource).toContain('window.sessionStorage.removeItem(key)');
    expect(sessionSource).not.toContain('localStorage.setItem');
    expect(providerSource).not.toContain('localStorage.setItem');
  });

  it('uses credentialed login without persisting returned access state', () => {
    expect(sessionSource).toContain("'/auth/login'");
    expect(sessionSource).toContain("credentials: 'include'");
    expect(providerSource).toContain('browserAuthSession.login(email, password)');
    expect(providerSource).toContain('apiClient.setTokens(session.data.accessToken)');
    expect(providerSource).not.toContain('refreshToken } =');
    expect(providerSource).not.toContain('JSON.stringify({ accessToken');
  });

  it('restores through the cookie-only refresh endpoint', () => {
    expect(sessionSource).toContain("'/auth/refresh'");
    expect(providerSource).toContain('browserAuthSession.refresh()');
    expect(providerSource).toContain('cleanupLegacyBrowserTokens()');
    expect(sessionSource).not.toContain("refresh_token: this.refreshToken");
  });
});
