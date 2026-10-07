'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { authSession, clearAccessToken, hasRefreshCookie, isTwoFactorChallenge } from '../services/auth-session';
import { quantSyncAPI } from '../services/api-client';

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
  /** Establish a session from a QuantMail SSO handoff token (the ?token= param). */
  loginWithSSO: (quantMailToken: string) => Promise<void>;
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

  // A 401 from any API call means the session is dead (expired/revoked token).
  // Drop local auth state so AuthGuard bounces the visitor to /login instead
  // of stranding them on a raw backend error screen.
  useEffect(() => {
    return quantSyncAPI.onUnauthorized(() => {
      clearSession();
    });
  }, [clearSession]);

  // Restore a session on load from the HttpOnly refresh cookie. Fail closed and
  // never hang: a 5s cap means a wedged identity service drops us to logged-out,
  // not to a spinner forever.
  useEffect(() => {
    let active = true;
    (async () => {
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
  // SSO-established sessions have no refresh cookie: skip rotation for them, or
  // the cookie-less /auth/refresh (NO_SESSION) would nuke a good session. The
  // token lives its natural life; API 401s still clear via onUnauthorized.
  const authedRef = useRef(isAuthenticated);
  authedRef.current = isAuthenticated;
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = window.setInterval(
      async () => {
        if (!hasRefreshCookie()) return;
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

  // SSO return leg: exchange the QuantMail handoff token for a session and flip
  // the provider to authenticated. Called by the login page's return handler.
  const loginWithSSO = useCallback(
    async (quantMailToken: string): Promise<void> => {
      setError(null);
      setIsLoading(true);
      try {
        const session = await authSession.loginWithSSO(quantMailToken);
        if (!session.success || !session.data?.accessToken) {
          throw new Error(session.error?.message ?? 'Quant SSO sign-in failed.');
        }
        setIsAuthenticated(true);
      } catch (caught) {
        clearSession();
        const message = caught instanceof Error ? caught.message : 'Quant SSO sign-in failed.';
        setError(message);
        throw caught;
      } finally {
        setIsLoading(false);
      }
    },
    [clearSession],
  );

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, error, login, loginWithSSO, logout }}>
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
