// F-189: cross-tab / cross-app session sync over the ecosystem bus.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UniversalSSOTokenBridge } from '@quant/shared-ui';
import type { SSOEventMessage } from '@quant/shared-ui';
import {
  broadcastSessionInitialized,
  broadcastTokenRefreshed,
  subscribeToSessionInitialized,
  subscribeToTokenRefreshed,
} from '../services/ecosystem-session-sync';
import { clearAuthSession, setAuthToken } from '../lib/auth';
import { clearAccessToken } from '../services/auth-session';

/** The bridge is a process-wide singleton — reset it so tests never leak sessions. */
function resetBridgeSingleton() {
  (UniversalSSOTokenBridge as unknown as { instance: null }).instance = null;
}

function seedBridgeSession(userId = 'u-seed', app: 'quantai' | 'quantmail' = 'quantai') {
  UniversalSSOTokenBridge.getInstance().setCurrentSession(
    { userId, email: `${userId}@quant.test`, displayName: 'Seed', currentApp: app },
    3600,
  );
}

describe('F-189 ecosystem session sync', () => {
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

  describe('broadcastSessionInitialized', () => {
    it('emits SESSION_INITIALIZED on the bus from quantai', () => {
      const seen: SSOEventMessage[] = [];
      UniversalSSOTokenBridge.getInstance().on('SESSION_INITIALIZED', (e) => seen.push(e));

      const result = broadcastSessionInitialized();

      expect(result).toEqual({ broadcasted: true });
      expect(seen).toHaveLength(1);
      expect(seen[0].type).toBe('SESSION_INITIALIZED');
      expect(seen[0].sourceApp).toBe('quantai');
    });

    it('seeds a broadcast-only bridge session only when none exists', () => {
      seedBridgeSession('u-real', 'quantai');
      const before = UniversalSSOTokenBridge.getInstance().getCurrentSession();

      broadcastSessionInitialized();

      // The real session is never clobbered by the seed.
      expect(UniversalSSOTokenBridge.getInstance().getCurrentSession()).toBe(before);
      expect(before?.userId).toBe('u-real');
    });

    it('seeds with the real signed-in user, never a fabricated identity', () => {
      setAuthToken('tok-1', { id: 'u-real-1', email: 'r@quant.test', name: 'Real' });

      broadcastSessionInitialized();

      const session = UniversalSSOTokenBridge.getInstance().getCurrentSession();
      expect(session?.userId).toBe('u-real-1');
      expect(session?.email).toBe('r@quant.test');
      expect(session?.currentApp).toBe('quantai');
    });

    it('never throws and reports BUS_UNAVAILABLE when the bridge is broken', () => {
      vi.spyOn(UniversalSSOTokenBridge, 'getInstance').mockImplementation(() => {
        throw new Error('bus down');
      });

      expect(broadcastSessionInitialized()).toEqual({
        broadcasted: false,
        reason: 'BUS_UNAVAILABLE',
      });
      expect(broadcastTokenRefreshed()).toEqual({
        broadcasted: false,
        reason: 'BUS_UNAVAILABLE',
      });
    });
  });

  describe('broadcastTokenRefreshed', () => {
    it('emits TOKEN_REFRESHED on the bus from quantai', () => {
      const seen: SSOEventMessage[] = [];
      UniversalSSOTokenBridge.getInstance().on('TOKEN_REFRESHED', (e) => seen.push(e));

      const result = broadcastTokenRefreshed();

      expect(result).toEqual({ broadcasted: true });
      expect(seen).toHaveLength(1);
      expect(seen[0].type).toBe('TOKEN_REFRESHED');
      expect(seen[0].sourceApp).toBe('quantai');
    });
  });

  describe('subscribe helpers', () => {
    it('delivers SESSION_INITIALIZED to the subscriber', () => {
      const seen: SSOEventMessage[] = [];
      const unsub = subscribeToSessionInitialized((e) => seen.push(e));
      seedBridgeSession('u-x');

      UniversalSSOTokenBridge.getInstance().broadcastSSOEvent('SESSION_INITIALIZED', 'quantai');

      expect(seen).toHaveLength(1);
      expect(seen[0].type).toBe('SESSION_INITIALIZED');
      unsub();
    });

    it('delivers TOKEN_REFRESHED to the subscriber', () => {
      const seen: SSOEventMessage[] = [];
      const unsub = subscribeToTokenRefreshed((e) => seen.push(e));
      seedBridgeSession('u-x');

      UniversalSSOTokenBridge.getInstance().broadcastSSOEvent('TOKEN_REFRESHED', 'quantai');

      expect(seen).toHaveLength(1);
      unsub();
    });

    it('unsubscribing stops delivery', () => {
      const handler = vi.fn();
      const unsub = subscribeToTokenRefreshed(handler);
      unsub();
      seedBridgeSession('u-x');

      UniversalSSOTokenBridge.getInstance().broadcastSSOEvent('TOKEN_REFRESHED', 'quantai');

      expect(handler).not.toHaveBeenCalled();
    });

    it('a throwing handler does not break the bus for other subscribers', () => {
      const seen: SSOEventMessage[] = [];
      const unsub1 = subscribeToTokenRefreshed(() => {
        throw new Error('listener bug');
      });
      const unsub2 = subscribeToTokenRefreshed((e) => seen.push(e));
      seedBridgeSession('u-x');

      expect(() =>
        UniversalSSOTokenBridge.getInstance().broadcastSSOEvent('TOKEN_REFRESHED', 'quantai'),
      ).not.toThrow();
      expect(seen).toHaveLength(1);
      unsub1();
      unsub2();
    });

    it('returns a safe no-op when the bridge is broken', () => {
      vi.spyOn(UniversalSSOTokenBridge, 'getInstance').mockImplementation(() => {
        throw new Error('bus down');
      });

      const unsub1 = subscribeToSessionInitialized(vi.fn());
      const unsub2 = subscribeToTokenRefreshed(vi.fn());
      expect(() => unsub1()).not.toThrow();
      expect(() => unsub2()).not.toThrow();
    });
  });
});
