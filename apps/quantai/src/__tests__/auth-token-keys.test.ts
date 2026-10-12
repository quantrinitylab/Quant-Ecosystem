// F-204: auth token-source audit.
// getAuthToken() reads a cross-app SSO key ('quantchat_access_token'); these
// tests pin the DOCUMENTED behavior: tokens are ecosystem-scoped (QuantMail
// identity root; server-verified by the SSO bridge before storage), the
// cross-app key is an explicit opt-in in AUTHORIZED_TOKEN_KEYS, own keys win
// on conflict, and the memory cache is never poisoned by a foreign key.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AUTHORIZED_TOKEN_KEYS,
  getAuthToken,
  setAuthToken,
  clearAuthSession,
} from '../lib/auth';

const CROSS_APP_KEY = 'quantchat_access_token';
const OWN_KEY = 'quant_access_token';

describe('AUTHORIZED_TOKEN_KEYS registry (F-204)', () => {
  it('is frozen — keys cannot be added or mutated at runtime', () => {
    expect(Object.isFrozen(AUTHORIZED_TOKEN_KEYS)).toBe(true);
  });

  it('every entry has a unique key, a valid scope, and a written reason', () => {
    const keys = AUTHORIZED_TOKEN_KEYS.map((e) => e.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of AUTHORIZED_TOKEN_KEYS) {
      expect(entry.key.trim().length).toBeGreaterThan(0);
      expect(['quantai', 'ecosystem-sso', 'cross-app-sso']).toContain(entry.scope);
      expect(entry.reason.trim().length).toBeGreaterThan(20);
    }
  });

  it('cross-app SSO keys are an explicit opt-in snapshot — update me if you add one', () => {
    // If this fails because you legitimately added a cross-app key: update this
    // snapshot AND add the honest JSDoc `reason` explaining why the foreign key
    // is trusted on QuantAI's origin. Do not add a cross-app key casually.
    const crossApp = AUTHORIZED_TOKEN_KEYS.filter((e) => e.scope === 'cross-app-sso').map(
      (e) => e.key,
    );
    expect(crossApp).toEqual([CROSS_APP_KEY]);
  });
});

describe('getAuthToken token-source behavior (F-204)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAuthSession();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Unstub FIRST: localStorage/window may be stubbed undefined by edge tests.
    vi.unstubAllGlobals();
    localStorage.clear();
    clearAuthSession();
    vi.restoreAllMocks();
  });

  it('returns null when no token is stored anywhere', () => {
    expect(getAuthToken()).toBeNull();
  });

  it('consults the documented cross-app key when own keys are absent', () => {
    localStorage.setItem(CROSS_APP_KEY, 'ecosystem-verified-token');
    expect(getAuthToken()).toBe('ecosystem-verified-token');
  });

  it('own keys take precedence over the cross-app key on conflicting values', () => {
    localStorage.setItem(CROSS_APP_KEY, 'cross-app-value');
    localStorage.setItem('token', 'third-precedence');
    localStorage.setItem('quant_auth_token', 'second-precedence');
    localStorage.setItem(OWN_KEY, 'first-precedence');
    expect(getAuthToken()).toBe('first-precedence');
  });

  it('empty-string values fall through to the next authorized key', () => {
    localStorage.setItem(OWN_KEY, '');
    localStorage.setItem(CROSS_APP_KEY, 'real-token');
    expect(getAuthToken()).toBe('real-token');
  });

  it('memory cache is not poisoned by a foreign key arriving later', () => {
    localStorage.setItem(OWN_KEY, 'own-token');
    expect(getAuthToken()).toBe('own-token'); // populates the memory cache
    localStorage.setItem(CROSS_APP_KEY, 'foreign-looking-token');
    expect(getAuthToken()).toBe('own-token'); // cache wins, not the foreign key
  });

  it('memory cache survives removal of the own key without flipping to the foreign key', () => {
    localStorage.setItem(OWN_KEY, 'own-token');
    expect(getAuthToken()).toBe('own-token');
    localStorage.removeItem(OWN_KEY);
    localStorage.setItem(CROSS_APP_KEY, 'foreign-looking-token');
    expect(getAuthToken()).toBe('own-token');
  });

  it('clearAuthSession clears memory cache AND every registry key including cross-app', () => {
    setAuthToken('own-token');
    localStorage.setItem(CROSS_APP_KEY, 'cross-app-token');
    clearAuthSession();
    expect(getAuthToken()).toBeNull();
    for (const entry of AUTHORIZED_TOKEN_KEYS) {
      expect(localStorage.getItem(entry.key)).toBeNull();
    }
  });

  it('returns null when localStorage throws (locked/private mode)', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(getAuthToken()).toBeNull();
  });

  it('returns null when localStorage is missing entirely', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(getAuthToken()).toBeNull();
  });

  it('returns null on SSR (window undefined)', () => {
    vi.stubGlobal('window', undefined);
    expect(getAuthToken()).toBeNull();
  });
});
