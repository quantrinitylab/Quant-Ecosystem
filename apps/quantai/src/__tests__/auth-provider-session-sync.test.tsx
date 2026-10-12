// F-189: AuthProvider subscribes to the ecosystem bus (SESSION_INITIALIZED /
// TOKEN_REFRESHED) — cross-tab session adoption + stale-token re-sync.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { UniversalSSOTokenBridge } from '@quant/shared-ui';
import type { SSOEventMessage } from '@quant/shared-ui';
import { AuthProvider, useAuth } from '../providers/auth-provider';
import type { LoginOutcome } from '../providers/auth-provider';
import { clearAuthSession, getAuthToken, setAuthToken } from '../lib/auth';
import { clearAccessToken, getAccessToken } from '../services/auth-session';

interface ProbeCtx {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
}

function resetBridgeSingleton() {
  (UniversalSSOTokenBridge as unknown as { instance: null }).instance = null;
}

function seedBridgeSession(userId: string, app: 'quantai' | 'quantmail' = 'quantai') {
  UniversalSSOTokenBridge.getInstance().setCurrentSession(
    { userId, email: `${userId}@quant.test`, displayName: 'Seed', currentApp: app },
    3600,
  );
}

/** No session anywhere: refresh/login endpoints report unauthenticated. */
function stubFetchUnauthenticated() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) }),
  );
}

describe('F-189 AuthProvider bus session sync', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ProbeCtx | null = null;

  function Probe() {
    const ctx = useAuth();
    latest = {
      isAuthenticated: ctx.isAuthenticated,
      isLoading: ctx.isLoading,
      login: ctx.login,
      logout: ctx.logout,
    };
    return null;
  }

  async function mountProvider() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
      // Let the async mount-restore (ticket check -> storage -> refresh) settle.
      await new Promise((r) => setTimeout(r, 50));
    });
  }

  /** Broadcast a bus event the way another tab would (needs a bridge session). */
  function emitFromSiblingTab(type: 'SESSION_INITIALIZED' | 'TOKEN_REFRESHED', userId: string) {
    seedBridgeSession(userId);
    act(() => {
      UniversalSSOTokenBridge.getInstance().broadcastSSOEvent(type, 'quantai');
    });
  }

  beforeEach(() => {
    resetBridgeSingleton();
    localStorage.clear();
    clearAccessToken();
    clearAuthSession();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    latest = null;
    stubFetchUnauthenticated();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
    localStorage.clear();
    clearAccessToken();
    clearAuthSession();
    resetBridgeSingleton();
    vi.unstubAllGlobals();
  });

  it('adopts a session when a sibling tab announces SESSION_INITIALIZED', async () => {
    await mountProvider();
    expect(latest!.isLoading).toBe(false);
    expect(latest!.isAuthenticated).toBe(false);

    // Sibling tab signed in: token landed in shared localStorage, bus announced.
    localStorage.setItem('quant_access_token', 'tok-sibling-1');
    await act(async () => {
      emitFromSiblingTab('SESSION_INITIALIZED', 'u-sib');
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(latest!.isAuthenticated).toBe(true);
    expect(getAccessToken()).toBe('tok-sibling-1');
  });

  it('ignores SESSION_INITIALIZED when no token exists in storage (no fabricated session)', async () => {
    await mountProvider();
    expect(latest!.isAuthenticated).toBe(false);

    await act(async () => {
      emitFromSiblingTab('SESSION_INITIALIZED', 'u-ghost');
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(latest!.isAuthenticated).toBe(false);
    // The handler must not have ingested the token: ingestSSOToken would have
    // written the auth cookie back (localStorage alone does not set cookies).
    expect(document.cookie).not.toContain('quant_access_token=tok-lingering');
  });

  it('ignores SESSION_INITIALIZED when this tab is already authenticated', async () => {
    setAuthToken('tok-mine', { id: 'u-me', email: 'me@quant.test', name: 'Me' });
    await mountProvider();
    expect(latest!.isAuthenticated).toBe(true);

    localStorage.setItem('quant_access_token', 'tok-other');
    await act(async () => {
      emitFromSiblingTab('SESSION_INITIALIZED', 'u-other');
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(latest!.isAuthenticated).toBe(true);
    expect(getAccessToken()).toBe('tok-mine');
  });

  it('re-syncs a stale in-memory token on TOKEN_REFRESHED (stale memoryToken race)', async () => {
    // This tab authenticated earlier; its memoryToken cache is now stale while
    // another tab rotated the token in shared storage.
    setAuthToken('tok-old', { id: 'u-a', email: 'a@quant.test', name: 'A' });
    await mountProvider();
    expect(latest!.isAuthenticated).toBe(true);
    expect(getAccessToken()).toBe('tok-old');

    localStorage.setItem('quant_access_token', 'tok-new');
    localStorage.setItem('quant_auth_token', 'tok-new');
    await act(async () => {
      emitFromSiblingTab('TOKEN_REFRESHED', 'u-a');
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(getAccessToken()).toBe('tok-new');
    // Prove the stale in-memory cache (not just the storage fallback) was
    // corrected: with storage wiped, only a refreshed memoryToken answers.
    localStorage.clear();
    expect(getAuthToken()).toBe('tok-new');
  });

  it('TOKEN_REFRESHED never resurrects a logged-out tab', async () => {
    await mountProvider();
    expect(latest!.isAuthenticated).toBe(false);

    localStorage.setItem('quant_access_token', 'tok-lingering');
    await act(async () => {
      emitFromSiblingTab('TOKEN_REFRESHED', 'u-x');
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(latest!.isAuthenticated).toBe(false);
    // The handler must not have ingested the token: ingestSSOToken would have
    // written the auth cookie back (localStorage alone does not set cookies).
    expect(document.cookie).not.toContain('quant_access_token=tok-after-logout');
  });

  it('ignores TOKEN_REFRESHED announced for a different user id', async () => {
    setAuthToken('tok-a', { id: 'u-a', email: 'a@quant.test', name: 'A' });
    await mountProvider();
    expect(latest!.isAuthenticated).toBe(true);

    localStorage.setItem('quant_access_token', 'tok-b-fresh');
    await act(async () => {
      emitFromSiblingTab('TOKEN_REFRESHED', 'u-b');
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(getAccessToken()).toBe('tok-a');
  });

  it('TOKEN_REFRESHED arriving after logout is ignored (logout-during-refresh race)', async () => {
    setAuthToken('tok-mine', { id: 'u-me', email: 'me@quant.test', name: 'Me' });
    await mountProvider();
    expect(latest!.isAuthenticated).toBe(true);

    await act(async () => {
      await latest!.logout();
    });
    expect(latest!.isAuthenticated).toBe(false);

    localStorage.setItem('quant_access_token', 'tok-after-logout');
    await act(async () => {
      emitFromSiblingTab('TOKEN_REFRESHED', 'u-me');
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(latest!.isAuthenticated).toBe(false);
    // The handler must not have ingested the token: ingestSSOToken would have
    // written the auth cookie back (localStorage alone does not set cookies).
    expect(document.cookie).not.toContain('quant_access_token=tok-after-logout');
  });

  it('login() broadcasts SESSION_INITIALIZED so sibling tabs adopt the session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes('/auth/login')) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: {
                accessToken: 'tok-login-1',
                user: { id: 'u-login', email: 'l@quant.test', name: 'Login' },
              },
            }),
          };
        }
        return { ok: true, json: async () => ({ success: false }) };
      }),
    );
    await mountProvider();
    expect(latest!.isAuthenticated).toBe(false);

    const seen: SSOEventMessage[] = [];
    UniversalSSOTokenBridge.getInstance().on('SESSION_INITIALIZED', (e) => seen.push(e));

    await act(async () => {
      await latest!.login('l@quant.test', 'secret');
    });

    expect(latest!.isAuthenticated).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].sourceApp).toBe('quantai');
  });

  it('works when the bus is unavailable (subscriptions are safe no-ops)', async () => {
    vi.spyOn(UniversalSSOTokenBridge, 'getInstance').mockImplementation(() => {
      throw new Error('bus down');
    });

    // Mount + login must not throw even with the bus dead.
    await mountProvider();
    expect(latest!.isLoading).toBe(false);
  });
});
