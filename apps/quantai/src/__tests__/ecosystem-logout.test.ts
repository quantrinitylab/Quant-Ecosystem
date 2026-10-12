import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UniversalSSOTokenBridge } from '@quant/shared-ui';
import type { SSOEventMessage } from '@quant/shared-ui';
import {
  broadcastGlobalLogout,
  subscribeToGlobalLogout,
  isGenuineGlobalLogout,
  ECOSYSTEM_LOGOUT_MARKER,
} from '../services/ecosystem-logout';
import { authSession, clearAccessToken, setAccessToken } from '../services/auth-session';
import { setAuthToken, getAuthToken, clearAuthSession } from '../lib/auth';

/** The bridge is a process-wide singleton — reset it so tests never leak sessions. */
function resetBridgeSingleton() {
  (UniversalSSOTokenBridge as unknown as { instance: null }).instance = null;
}

function seedBridgeSession(sourceApp: 'quantai' | 'quantmail' = 'quantmail') {
  UniversalSSOTokenBridge.getInstance().setCurrentSession(
    { userId: 'u-seed', email: 'u@quant.test', displayName: 'U', currentApp: sourceApp },
    3600,
  );
}

function okFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }),
  );
}

describe('F-182 ecosystem single logout', () => {
  beforeEach(() => {
    resetBridgeSingleton();
    localStorage.clear();
    clearAccessToken();
    clearAuthSession();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    localStorage.clear();
    clearAccessToken();
    clearAuthSession();
    resetBridgeSingleton();
    vi.unstubAllGlobals();
  });

  describe('broadcastGlobalLogout', () => {
    it('emits GLOBAL_LOGOUT on the bus with the ecosystem marker', () => {
      const seen: SSOEventMessage[] = [];
      UniversalSSOTokenBridge.getInstance().on('GLOBAL_LOGOUT', (e) => seen.push(e));

      const result = broadcastGlobalLogout({ id: 'u1', email: 'u1@q.test', name: 'U1' });

      expect(result.broadcasted).toBe(true);
      expect(seen).toHaveLength(1);
      expect(seen[0].type).toBe('GLOBAL_LOGOUT');
      expect(seen[0].sourceApp).toBe('quantai');
      expect(seen[0].payload?.[ECOSYSTEM_LOGOUT_MARKER]).toBe(true);
    });

    it('broadcasts even with no known user (tombstone seed), still marked', () => {
      const seen: SSOEventMessage[] = [];
      UniversalSSOTokenBridge.getInstance().on('GLOBAL_LOGOUT', (e) => seen.push(e));

      const result = broadcastGlobalLogout(null);

      expect(result.broadcasted).toBe(true);
      expect(seen).toHaveLength(1);
      expect(seen[0].payload?.[ECOSYSTEM_LOGOUT_MARKER]).toBe(true);
    });

    it('never throws and reports BUS_UNAVAILABLE when the bridge is broken', () => {
      vi.spyOn(UniversalSSOTokenBridge, 'getInstance').mockImplementation(() => {
        throw new Error('bus down');
      });

      const result = broadcastGlobalLogout({ id: 'u1' });

      expect(result).toEqual({ broadcasted: false, reason: 'BUS_UNAVAILABLE' });
    });
  });

  describe('isGenuineGlobalLogout', () => {
    const base: SSOEventMessage = {
      type: 'GLOBAL_LOGOUT',
      userId: 'u1',
      sourceApp: 'quantmail',
      timestamp: Date.now(),
    };

    it('honors remote apps unconditionally (QuantMail-side logout logs QuantAI out)', () => {
      expect(isGenuineGlobalLogout(base)).toBe(true);
      expect(
        isGenuineGlobalLogout({ ...base, sourceApp: 'quantchat', payload: undefined }),
      ).toBe(true);
    });

    it('honors our own marked broadcast (cross-tab QuantAI logout)', () => {
      expect(
        isGenuineGlobalLogout({
          ...base,
          sourceApp: 'quantai',
          payload: { [ECOSYSTEM_LOGOUT_MARKER]: true },
        }),
      ).toBe(true);
    });

    it('ignores our own marker-less echo (bridge refresh-timer fail-closed emission)', () => {
      expect(isGenuineGlobalLogout({ ...base, sourceApp: 'quantai' })).toBe(false);
      expect(
        isGenuineGlobalLogout({ ...base, sourceApp: 'quantai', payload: { at: Date.now() } }),
      ).toBe(false);
    });
  });

  describe('subscribeToGlobalLogout', () => {
    it('fires the handler on a genuine remote GLOBAL_LOGOUT', () => {
      const handler = vi.fn();
      const unsub = subscribeToGlobalLogout(handler);
      seedBridgeSession('quantmail');

      UniversalSSOTokenBridge.getInstance().broadcastSSOEvent('GLOBAL_LOGOUT', 'quantmail');

      expect(handler).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('does NOT fire on our own marker-less echo', () => {
      const handler = vi.fn();
      const unsub = subscribeToGlobalLogout(handler);
      seedBridgeSession('quantai');

      UniversalSSOTokenBridge.getInstance().broadcastSSOEvent('GLOBAL_LOGOUT', 'quantai');

      expect(handler).not.toHaveBeenCalled();
      unsub();
    });

    it('fires on our own marked broadcast (other-tab logout)', () => {
      const handler = vi.fn();
      const unsub = subscribeToGlobalLogout(handler);
      seedBridgeSession('quantai');

      UniversalSSOTokenBridge.getInstance().broadcastSSOEvent('GLOBAL_LOGOUT', 'quantai', {
        [ECOSYSTEM_LOGOUT_MARKER]: true,
      });

      expect(handler).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('unsubscribing stops delivery', () => {
      const handler = vi.fn();
      const unsub = subscribeToGlobalLogout(handler);
      unsub();
      seedBridgeSession('quantmail');

      UniversalSSOTokenBridge.getInstance().broadcastSSOEvent('GLOBAL_LOGOUT', 'quantmail');

      expect(handler).not.toHaveBeenCalled();
    });

    it('returns a safe no-op when the bridge throws', () => {
      vi.spyOn(UniversalSSOTokenBridge, 'getInstance').mockImplementation(() => {
        throw new Error('bus down');
      });
      const unsub = subscribeToGlobalLogout(vi.fn());
      expect(() => unsub()).not.toThrow();
    });
  });

  describe('authSession.logout (F-182 wiring)', () => {
    it('clears local tokens, posts server logout, and broadcasts the ecosystem logout', async () => {
      okFetch();
      setAuthToken('jwt-live-1', { id: 'u1', email: 'u1@q.test', name: 'U1' });
      setAccessToken('jwt-live-1');
      const seen: SSOEventMessage[] = [];
      const unsub = subscribeToGlobalLogout(() => seen.push({} as SSOEventMessage));
      const busSeen: SSOEventMessage[] = [];
      UniversalSSOTokenBridge.getInstance().on('GLOBAL_LOGOUT', (e) => busSeen.push(e));

      const result = await authSession.logout();

      expect(result.broadcasted).toBe(true);
      expect(result.broadcastError).toBeUndefined();
      expect(getAuthToken()).toBeNull();
      expect(localStorage.getItem('quant_access_token')).toBeNull();
      expect(localStorage.getItem('quant_auth_token')).toBeNull();
      // The bus really carried it, marked, from quantai …
      expect(busSeen).toHaveLength(1);
      expect(busSeen[0].payload?.[ECOSYSTEM_LOGOUT_MARKER]).toBe(true);
      // … and our own subscription honored it (self-echo is idempotent, not dropped).
      expect(seen).toHaveLength(1);
      unsub();
    });

    it('still completes the local logout when the bus is unavailable, reporting honestly', async () => {
      okFetch();
      setAuthToken('jwt-live-2', { id: 'u2', email: 'u2@q.test' });
      vi.spyOn(UniversalSSOTokenBridge, 'getInstance').mockImplementation(() => {
        throw new Error('bus down');
      });

      const result = await authSession.logout();

      expect(result.broadcasted).toBe(false);
      expect(result.broadcastError).toBe('BUS_UNAVAILABLE');
      expect(getAuthToken()).toBeNull();
    });

    it('completes logout when the identity service is down (fetch rejects)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      setAuthToken('jwt-live-3', { id: 'u3', email: 'u3@q.test' });

      const result = await authSession.logout();

      expect(result.broadcasted).toBe(true);
      expect(getAuthToken()).toBeNull();
    });

    it('double logout is idempotent: both resolve, tokens stay cleared', async () => {
      okFetch();
      setAuthToken('jwt-live-4', { id: 'u4', email: 'u4@q.test' });

      const first = await authSession.logout();
      const second = await authSession.logout();

      expect(first.broadcasted).toBe(true);
      expect(second.broadcasted).toBe(true);
      expect(getAuthToken()).toBeNull();
    });

    it('GLOBAL_LOGOUT while already logged out is a safe no-op', () => {
      const handler = vi.fn(() => {
        clearAccessToken();
      });
      const unsub = subscribeToGlobalLogout(handler);
      seedBridgeSession('quantmail');

      expect(() =>
        UniversalSSOTokenBridge.getInstance().broadcastSSOEvent('GLOBAL_LOGOUT', 'quantmail'),
      ).not.toThrow();
      expect(handler).toHaveBeenCalledTimes(1);
      // A second remote logout while logged out: still no throw, still handled.
      expect(() =>
        UniversalSSOTokenBridge.getInstance().broadcastSSOEvent('GLOBAL_LOGOUT', 'quantmail'),
      ).not.toThrow();
      expect(handler).toHaveBeenCalledTimes(2);
      unsub();
    });
  });
});
