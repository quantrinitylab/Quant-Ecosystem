'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authSession, isTwoFactorChallenge, SessionUser, LoginOutcome } from '../services/auth-session';
import { quantSyncAPI } from '../services/api-client';

export type { LoginOutcome };

interface AuthContextValue {
  /** The verified user profile, or null when signed out. */
  user: SessionUser | null;
  /** True once GET /api/auth/session has verified a session this tab. */
  isAuthenticated: boolean;
  /** True during the initial session-restore, so guards can wait instead of flashing. */
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  /** Establish a session from a QuantMail /sso chooser ticket (?sso_ticket=). */
  completeSsoTicket: (ticket: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-resolve the session (used after an SSO round-trip completes). */
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    setUser(null);
  }, []);

  // A 401 from any API call means the session is dead (expired/revoked token).
  // Drop local auth state so AuthGuard bounces the visitor to /login instead
  // of stranding them on a raw backend error screen.
  useEffect(() => {
    return quantSyncAPI.onUnauthorized(() => {
      clearSession();
    });
  }, [clearSession]);

  // Restore the session on load from the httpOnly cookies via the server.
  // Fail closed and never hang: a 10s cap means a wedged identity service
  // drops us to logged-out, not to a spinner forever. No tokens are read from
  // the URL or storage — the server verifies the cookies back-channel.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    (async () => {
      try {
        const session = await authSession.getSession();
        if (!active) return;
        setUser(session.success ? (session.data?.user ?? null) : null);
      } catch {
        if (active) clearSession();
      } finally {
        clearTimeout(timeout);
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [clearSession]);

  // Re-verify the session before its ~15-minute lifetime ends. The server
  // self-heals OAuth sessions through the refresh cookie; a dead session
  // fails closed to signed-out.
  useEffect(() => {
    if (user === null) return;
    const timer = window.setInterval(
      async () => {
        const session = await authSession.getSession().catch(() => null);
        setUser(session?.success ? (session.data?.user ?? null) : null);
      },
      12 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, [user]);

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
        const nextUser = session.data.user ?? null;
        if (!nextUser) throw new Error('Sign-in failed.');
        setUser(nextUser);
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
    clearSession();
    setError(null);
  }, [clearSession]);

  // SSO return leg (Contract B): verify the /sso chooser ticket server-side
  // and flip the provider to authenticated. Called by the login page's return
  // handler AFTER it scrubs the ticket from the URL.
  const completeSsoTicket = useCallback(
    async (ticket: string): Promise<void> => {
      setError(null);
      setIsLoading(true);
      try {
        const session = await authSession.completeSsoTicket(ticket);
        if (!session.success || !session.data?.user) {
          throw new Error(session.error?.message ?? 'Quant SSO sign-in failed.');
        }
        setUser(session.data.user);
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

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const session = await authSession.getSession();
      setUser(session.success ? (session.data?.user ?? null) : null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        error,
        login,
        completeSsoTicket,
        logout,
        refreshSession,
      }}
    >
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
