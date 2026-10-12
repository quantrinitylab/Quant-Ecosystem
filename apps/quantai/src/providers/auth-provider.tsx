import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { UniversalSSOTokenBridge } from '@quant/shared-ui';
import type { SSOEventMessage } from '@quant/shared-ui';
import {
  authSession,
  clearAccessToken,
  isTwoFactorChallenge,
  ingestSSOToken,
} from '../services/auth-session';
import type { LogoutResult } from '../services/auth-session';
import { subscribeToGlobalLogout } from '../services/ecosystem-logout';
import {
  broadcastSessionInitialized,
  broadcastTokenRefreshed,
  subscribeToSessionInitialized,
  subscribeToTokenRefreshed,
} from '../services/ecosystem-session-sync';
import { getAuthToken, getAuthUser, readStoredAuthToken } from '../lib/auth';

export type LoginOutcome =
  | { status: 'signed-in' }
  | { status: 'two-factor-required'; challenge: string; expiresIn: number };

interface AuthContextValue {
  /** True once a session (access token) has been established this tab. */
  isAuthenticated: boolean;
  /** True during the initial session-restore, so guards can wait instead of flashing. */
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  /** Logs out locally AND broadcasts ecosystem single-logout; resolves with how far the broadcast got. */
  logout: () => Promise<LogoutResult>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    clearAccessToken();
    setIsAuthenticated(false);
  }, []);

  // Restore a session on load: first check for incoming SSO tickets/tokens,
  // then check stored tokens in localStorage/cookies, and finally check the HttpOnly refresh cookie.
  useEffect(() => {
    let active = true;
    (async () => {
      // 1. Check for incoming SSO ticket or token in URL or UniversalSSOTokenBridge
      if (typeof window !== 'undefined') {
        try {
          const bridge = UniversalSSOTokenBridge.getInstance();
          // Fail-closed: consumeHandoffTicket re-verifies the ticket's token
          // server-side and returns null for forged/tampered/expired tickets,
          // so isAuthenticated is only set on a server-verified identity.
          const consumed = await bridge.consumeHandoffTicket();

          const resolvedToken = consumed?.session?.token;

          if (resolvedToken) {
            ingestSSOToken(resolvedToken);
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete('__quant_sso_ticket');
              url.searchParams.delete('token');
              url.searchParams.delete('accessToken');
              url.searchParams.delete('access_token');
              url.searchParams.delete('__quant_return');
              const cleanUrl = url.pathname + (url.search ? url.search : '') + url.hash;
              window.history.replaceState({}, document.title, cleanUrl);
            } catch {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            if (active) {
              setIsAuthenticated(true);
              setIsLoading(false);
            }
            return;
          }
        } catch {
          // Sandboxed environment
        }
      }

      // 2. Check if a valid token is already cached in localStorage / cookie
      const existingToken = getAuthToken();
      if (existingToken) {
        ingestSSOToken(existingToken);
        if (active) {
          setIsAuthenticated(true);
          setIsLoading(false);
        }
        // Background verify/refresh
        authSession.refresh().catch(() => null);
        return;
      }

      // 3. Fall back to refresh endpoint with 5s timeout
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('auth-timeout')), 5000),
        );
        const session = await Promise.race([authSession.refresh(), timeout]);
        if (!active) return;
        setIsAuthenticated(Boolean(session.success && session.data?.accessToken));
      } catch {
        if (active) clearSession();
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clearSession]);

  // Rotate the access token before its ~15-minute lifetime ends. The rotated
  // refresh token stays inside the HttpOnly cookie and never reaches this provider.
  const authedRef = useRef(isAuthenticated);
  authedRef.current = isAuthenticated;
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = window.setInterval(
      async () => {
        const session = await authSession.refresh();
        if (!session.success || !session.data?.accessToken) {
          clearSession();
          return;
        }
        // F-189: tell sibling tabs the token rotated so they drop their stale
        // in-memory copy instead of calling APIs with it until their own
        // rotation. Never throws; a dead bus must not break the refresh cycle.
        broadcastTokenRefreshed();
      },
      12 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, [isAuthenticated, clearSession]);

  // F-189: adopt a session announced on the ecosystem bus when this tab is
  // signed out. Bus events carry NO token (bridge design), so adoption is
  // always gated on a real token in this origin's storage — a forged event
  // can only trigger a no-op re-read, never a fabricated session.
  const tryAdoptSession = useCallback(
    async (event: SSOEventMessage): Promise<boolean> => {
      if (authedRef.current) return false;
      // Same-origin case: a sibling QuantAI tab just signed in and the token
      // is already in shared localStorage (written by the fail-closed SSO
      // handoff or the login flow).
      const stored = readStoredAuthToken();
      if (stored) {
        ingestSSOToken(stored);
        setIsAuthenticated(true);
        return true;
      }
      // Cross-app case (no shared storage): one honest background attempt via
      // the HttpOnly refresh cookie, adopted only on real success.
      if (event.sourceApp !== 'quantai') {
        try {
          const session = await authSession.refresh();
          if (session.success && session.data?.accessToken) {
            setIsAuthenticated(true);
            return true;
          }
        } catch {
          // Stay signed out; the login page remains the honest entry point.
        }
      }
      return false;
    },
    [],
  );

  // F-189: cross-tab / cross-app session sync over the `quant_sso_bus`.
  // GLOBAL_LOGOUT is wired separately (F-182); this effect covers the other
  // two directions. TOKEN_REFRESHED never resurrects a logged-out tab, and a
  // refresh announced for a different user id is ignored.
  useEffect(() => {
    const unsubSession = subscribeToSessionInitialized((event) => {
      if (authedRef.current) return;
      void tryAdoptSession(event);
    });
    const unsubRefresh = subscribeToTokenRefreshed((event) => {
      if (!authedRef.current) return;
      const me = getAuthUser()?.id;
      if (event.userId && me && event.userId !== me) return;
      const stored = readStoredAuthToken();
      if (stored) ingestSSOToken(stored);
    });
    return () => {
      unsubSession();
      unsubRefresh();
    };
  }, [tryAdoptSession]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => {
      setError(null);
      setIsLoading(true);
      try {
        const session = await authSession.login(email, password);
        if (!session.success || !session.data) {
          throw new Error(session.error?.message ?? 'Sign-in failed.');
        }
        if (isTwoFactorChallenge(session.data)) {
          return {
            status: 'two-factor-required',
            challenge: session.data.challenge,
            expiresIn: session.data.expiresIn ?? 300,
          };
        }
        if (!session.data.accessToken) throw new Error('Sign-in failed.');
        setIsAuthenticated(true);
        // F-189: announce the new session so sibling tabs adopt it instead of
        // sitting signed-out. Never throws; a dead bus must not break login.
        broadcastSessionInitialized();
        return { status: 'signed-in' };
      } catch (caught) {
        clearSession();
        const message = caught instanceof Error ? caught.message : 'Sign-in failed.';
        setError(message);
        throw caught;
      } finally {
        setIsLoading(false);
      }
    },
    [clearSession],
  );

  // Defense direction of ecosystem single-logout (F-182): when any other
  // Quant app (e.g. QuantMail) logs out, GLOBAL_LOGOUT arrives on the shared
  // bus and this tab must drop its session too. Idempotent — a logout while
  // already logged out is a no-op.
  useEffect(() => {
    return subscribeToGlobalLogout(() => {
      clearSession();
    });
  }, [clearSession]);

  const logout = useCallback(async (): Promise<LogoutResult> => {
    const result = await authSession.logout();
    setIsAuthenticated(false);
    setError(null);
    return result;
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
