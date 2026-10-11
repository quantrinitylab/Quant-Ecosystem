'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  authSession,
  isTwoFactorChallenge,
  SessionUser,
  LoginOutcome,
} from '../services/auth-session';

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
  logout: () => Promise<void>;
  /** Re-resolve the session (used after an SSO ticket completes). */
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applySession = useCallback((user: SessionUser | null) => {
    setUser(user);
  }, []);

  // Restore the session on load from the httpOnly cookies via the server.
  // Fail-closed and never hanging: a 10s cap means a wedged identity service
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
        applySession(session.success ? (session.data?.user ?? null) : null);
      } catch {
        if (active) applySession(null);
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
  }, [applySession]);

  // Re-verify the session before its ~15-minute lifetime ends. The server
  // self-heals OAuth sessions through the refresh cookie; a dead session
  // fails closed to signed-out.
  const authedRef = useRef(false);
  authedRef.current = user !== null;
  useEffect(() => {
    if (!authedRef.current) return;
    const timer = window.setInterval(
      async () => {
        const session = await authSession.getSession().catch(() => null);
        if (!session?.success) applySession(null);
        else applySession(session.data?.user ?? null);
      },
      12 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, [user, applySession]);

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
        applySession(nextUser);
        return { status: 'signed-in' };
      } catch (caught) {
        applySession(null);
        const message = caught instanceof Error ? caught.message : 'Sign-in failed.';
        setError(message);
        throw caught;
      } finally {
        setIsLoading(false);
      }
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await authSession.logout();
    applySession(null);
    setError(null);
  }, [applySession]);

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const session = await authSession.getSession();
      applySession(session.success ? (session.data?.user ?? null) : null);
    } finally {
      setIsLoading(false);
    }
  }, [applySession]);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: user !== null, isLoading, error, login, logout, refreshSession }}
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
