import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { UniversalSSOTokenBridge } from '@quant/shared-ui';
import {
  authSession,
  clearAccessToken,
  isTwoFactorChallenge,
  ingestSSOToken,
} from '../services/auth-session';
import { getAuthToken } from '../lib/auth';

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
  logout: () => Promise<void>;
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
          const consumed = bridge.consumeHandoffTicket();
          const params = new URLSearchParams(window.location.search);
          const ticketParam = params.get('__quant_sso_ticket');
          const tokenParam =
            params.get('token') || params.get('accessToken') || params.get('access_token');

          const resolvedToken =
            consumed?.session?.token ||
            consumed?.ticket ||
            (ticketParam ? bridge.verifyHandoffTicket(ticketParam)?.token || ticketParam : null) ||
            tokenParam;

          if (resolvedToken) {
            ingestSSOToken(resolvedToken);
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
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
        if (!session.success || !session.data?.accessToken) clearSession();
      },
      12 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, [isAuthenticated, clearSession]);

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

  const logout = useCallback(async () => {
    await authSession.logout();
    setIsAuthenticated(false);
    setError(null);
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
