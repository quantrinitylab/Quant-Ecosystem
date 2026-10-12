import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getAuthToken,
  setAuthToken,
  clearAuthSession,
  getAuthUser,
} from '../lib/auth';
import { clearAccessToken, getAccessToken, ingestSSOToken } from '../services/auth-session';

/**
 * WR-SEC-001 guard: QuantAI-side legacy SSO bridge unsafe paths.
 *
 * Invariants enforced here (CEO-mandated direction):
 *  1. No access token is written to JS-readable persistence
 *     (localStorage / document.cookie) by QuantAI code.
 *  2. Logout clears every known token alias, including the JS-readable
 *     keys/cookies the legacy bridge writes.
 *  3. A static scan fails CI if a token write sneaks back into the
 *     auth modules.
 */
describe('WR-SEC-001 SSO security guard', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie.split(';').forEach(() => {});
    clearAccessToken();
    clearAuthSession();
  });

  afterEach(() => {
    localStorage.clear();
    clearAccessToken();
    clearAuthSession();
  });

  it('setAuthToken never persists the access token to localStorage or cookies', () => {
    const token = 'wrsec001-secret-token-aaa';
    setAuthToken(token, { id: 'u1', email: 'a@b.c' });

    for (const key of [
      'quant_access_token',
      'quant_auth_token',
      'token',
      'quant_token',
      'quantchat_access_token',
    ]) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    expect(document.cookie).not.toContain(token);
    // Usable in-memory for the tab lifetime.
    expect(getAuthToken()).toBe(token);
    // Profile (non-secret) still persisted for the UI.
    expect(getAuthUser()?.email).toBe('a@b.c');
  });

  it('clearAuthSession removes every bridge token alias (localStorage + JS cookies)', () => {
    // Seed everything the legacy bridge is known to write.
    localStorage.setItem('quant_access_token', 't1');
    localStorage.setItem('quant_auth_token', 't2');
    localStorage.setItem('token', 't3');
    localStorage.setItem('quant_token', 't4');
    localStorage.setItem('quantchat_access_token', 't5');
    localStorage.setItem('quant_auth_tokens', 't6');
    localStorage.setItem('quant_refresh_token', 't7');
    localStorage.setItem('quant_sso_sync_event', 't8');
    document.cookie = 'quant_access_token=t9; path=/';
    document.cookie = 'quant_auth_token=t10; path=/';
    document.cookie = 'token=t11; path=/';
    setAuthToken('memory-token', { id: 'u1', email: 'a@b.c' });

    clearAuthSession();

    for (const key of [
      'quant_access_token',
      'quant_auth_token',
      'token',
      'quant_token',
      'quantchat_access_token',
      'quant_auth_tokens',
      'quant_refresh_token',
      'quant_sso_sync_event',
      'quant_user',
    ]) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    expect(document.cookie).not.toContain('t9');
    expect(document.cookie).not.toContain('t10');
    expect(document.cookie).not.toContain('t11');
    expect(getAuthToken()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('logout-during-handoff: full clear mid-ingest leaves no session', () => {
    ingestSSOToken('inflight-token');
    expect(getAuthToken()).toBe('inflight-token');
    // clearAccessToken is the full-clear entry point (module token + storage);
    // bare clearAuthSession() is lib-level only by design.
    clearAccessToken();
    expect(getAuthToken()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('getAuthToken still reads bridge-written keys (SSO keeps working until bridge migration)', () => {
    // Simulates what the legacy bridge does today on consumeHandoffTicket.
    localStorage.setItem('quant_access_token', 'bridge-written-token');
    expect(getAuthToken()).toBe('bridge-written-token');
  });

  it('static guard: no token writes to localStorage/document.cookie in auth modules', () => {
    const files = [
      path.resolve(__dirname, '../lib/auth.ts'),
      path.resolve(__dirname, '../services/auth-session.ts'),
    ];
    const forbidden: Array<{ file: string; line: number; text: string }> = [];
    const tokenKeyPattern =
      /localStorage\.setItem\(\s*['"](quant_access_token|quant_auth_token|token|quant_token|quantchat_access_token)['"]/;
    const cookieTokenPattern = /document\.cookie\s*=\s*[^;]*\$\{(token|candidateToken|resolvedToken)/;
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((text, i) => {
        if (tokenKeyPattern.test(text) || cookieTokenPattern.test(text)) {
          forbidden.push({ file: path.basename(file), line: i + 1, text: text.trim() });
        }
      });
    }
    expect(forbidden).toEqual([]);
  });
});
