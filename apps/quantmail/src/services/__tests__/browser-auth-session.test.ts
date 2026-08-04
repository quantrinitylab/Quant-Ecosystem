import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_TOKEN_KEYS,
  browserAuthSession,
  cleanupLegacyBrowserTokens,
} from '../browser-auth-session';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
};

const localStorage = createStorage();
const sessionStorage = createStorage();

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage, sessionStorage },
  });
});

describe('browserAuthSession', () => {
  it('deletes every legacy JavaScript-readable token key', () => {
    for (const key of LEGACY_TOKEN_KEYS) {
      localStorage.setItem(key, 'secret');
      sessionStorage.setItem(key, 'secret');
    }

    cleanupLegacyBrowserTokens();

    for (const key of LEGACY_TOKEN_KEYS) {
      expect(localStorage.getItem(key)).toBeNull();
      expect(sessionStorage.getItem(key)).toBeNull();
    }
  });

  it('uses credentialed login without persisting returned access state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { accessToken: 'short-lived-access', expiresIn: 900, tokenType: 'Bearer' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await browserAuthSession.login('user@quantmail.in', 'password');

    expect(response.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'user@quantmail.in', password: 'password' }),
      }),
    );
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('restores through the cookie-only refresh endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { accessToken: 'rotated-access', expiresIn: 900 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await browserAuthSession.refresh();

    expect(response.data?.accessToken).toBe('rotated-access');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    );
  });
});
