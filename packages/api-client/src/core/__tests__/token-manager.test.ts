import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenManager } from '../token-manager';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });
Object.defineProperty(globalThis, 'window', { value: globalThis });

describe('TokenManager', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('setTokens', () => {
    it('stores access and refresh tokens in memory', () => {
      const tm = new TokenManager({ persist: false });
      tm.setTokens('access-123', 'refresh-456');

      expect(tm.getAccessToken()).toBe('access-123');
      expect(tm.getRefreshToken()).toBe('refresh-456');
    });

    it('persists tokens to localStorage when persist is true', () => {
      const tm = new TokenManager({ persist: true });
      tm.setTokens('access-abc', 'refresh-def');

      expect(localStorageMock.setItem).toHaveBeenCalledWith('token', 'access-abc');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshToken', 'refresh-def');
    });

    it('does not persist to localStorage when persist is false', () => {
      const tm = new TokenManager({ persist: false });
      tm.setTokens('access-xyz', 'refresh-xyz');

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('uses custom storage keys', () => {
      const tm = new TokenManager({
        storageKey: 'custom_token',
        refreshStorageKey: 'custom_refresh',
        persist: true,
      });
      tm.setTokens('tok', 'ref');

      expect(localStorageMock.setItem).toHaveBeenCalledWith('custom_token', 'tok');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('custom_refresh', 'ref');
    });

    it('allows setting access token without refresh token', () => {
      const tm = new TokenManager({ persist: false });
      tm.setTokens('access-only');

      expect(tm.getAccessToken()).toBe('access-only');
      expect(tm.getRefreshToken()).toBeNull();
    });

    it('calls onTokenChange callback', () => {
      const onChange = vi.fn();
      const tm = new TokenManager({ persist: false, onTokenChange: onChange });
      tm.setTokens('a', 'b');

      expect(onChange).toHaveBeenCalledWith({ accessToken: 'a', refreshToken: 'b' });
    });
  });

  describe('getAccessToken', () => {
    it('returns null when no token is set', () => {
      const tm = new TokenManager({ persist: false });
      expect(tm.getAccessToken()).toBeNull();
    });

    it('returns the set access token', () => {
      const tm = new TokenManager({ persist: false });
      tm.setTokens('my-token', 'my-refresh');
      expect(tm.getAccessToken()).toBe('my-token');
    });
  });

  describe('clearTokens', () => {
    it('removes tokens from memory', () => {
      const tm = new TokenManager({ persist: false });
      tm.setTokens('access', 'refresh');
      tm.clearTokens();

      expect(tm.getAccessToken()).toBeNull();
      expect(tm.getRefreshToken()).toBeNull();
    });

    it('removes tokens from localStorage', () => {
      const tm = new TokenManager({ persist: true });
      tm.setTokens('access', 'refresh');
      tm.clearTokens();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refreshToken');
    });

    it('calls onTokenChange with null values', () => {
      const onChange = vi.fn();
      const tm = new TokenManager({ persist: false, onTokenChange: onChange });
      tm.setTokens('a', 'b');
      onChange.mockClear();
      tm.clearTokens();

      expect(onChange).toHaveBeenCalledWith({ accessToken: null, refreshToken: null });
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when no token is set', () => {
      const tm = new TokenManager({ persist: false });
      expect(tm.isAuthenticated()).toBe(false);
    });

    it('returns true when access token is set', () => {
      const tm = new TokenManager({ persist: false });
      tm.setTokens('token');
      expect(tm.isAuthenticated()).toBe(true);
    });

    it('returns false after clearTokens', () => {
      const tm = new TokenManager({ persist: false });
      tm.setTokens('token', 'refresh');
      tm.clearTokens();
      expect(tm.isAuthenticated()).toBe(false);
    });
  });

  describe('hydration from localStorage', () => {
    it('hydrates tokens on construction when persist is true', () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'token') return 'stored-access';
        if (key === 'refreshToken') return 'stored-refresh';
        return null;
      });

      const tm = new TokenManager({ persist: true });
      expect(tm.getAccessToken()).toBe('stored-access');
      expect(tm.getRefreshToken()).toBe('stored-refresh');
    });
  });

  describe('static create', () => {
    it('returns a TokenManager instance', () => {
      const tm = TokenManager.create({ persist: false });
      expect(tm).toBeInstanceOf(TokenManager);
    });
  });
});
