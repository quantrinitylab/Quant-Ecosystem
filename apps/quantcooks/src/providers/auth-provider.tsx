import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { authSession, clearAccessToken, isTwoFactorChallenge } from '../services/auth-session';
import { readSsoTokenFromSearch, scrubSsoParamsFromUrl } from '../lib/sso-handoff';

export type LoginOutcome =
  | { status: 'signed-in' }
  | { status: 'two-factor-required'; challenge: string; expiresIn: number };

interface AuthContextValue {
  /** True once a session (access token) has been established this tab. */
  isAuthenticated: boolean;
  /** True during the initial session-restore, so guards can wait instead of flashing. */
  isLoading: boolean;
  error: string | null;
  /** Set when an SSO handoff (?token=...) was attempted but rejected. */
  ssoError: string | null;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ssoError, setSsoError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    clearAccessToken();
    setIsAuthenticated(false);
  }, []);

  // Guard so a React StrictMode double-effect (or a re-mount) never exchanges
  // the same one-shot handoff token twice.
  const ssoAttemptedRef = useRef(false);

  // Scrub SSO handoff params from the address bar. A token must never linger
  // in the URL (history, logs, shoulder-surfing) — scrub on success AND failure.
  const scrubSsoParams = useCallback(() => {
    try {
      window.history.replaceState(
        {},
        document.title,
        scrubSsoParamsFromUrl(window.location.href),
      );
    } catch {
      /* navigation API unavailable — nothing to scrub through */
    }
  }, []);

  // Restore a session on load. Step 1 consumes a QuantMail SSO handoff
  // (?token=...) if one is present in the URL — previously there was zero code
  // reading it, so SSO users were stranded on /login forever. Step 2 is the
  // existing HttpOnly-refresh-cookie restore. Fail closed and never hang: a
  // cap on each attempt means a wedged identity service drops us to
  // logged-out, not to a spinner forever.
  useEffect(() => {
    let active = true;
    (async () => {
      let sessionEstablished = false;
      try {
        // Step 1: SSO handoff consumer.
        if (typeof window !== 'undefined' && !ssoAttemptedRef.current) {
          const ssoToken = readSsoTokenFromSearch(window.location.search);
          if (ssoToken) {
            ssoAttemptedRef.current = true;
            try {
              const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('sso-timeout')), 10000),
              );
              const outcome = await Promise.race([authSession.exchangeSso(ssoToken), timeout]);
              scrubSsoParams();
              if (!active) return;
              if (outcome.success && outcome.data?.accessToken) {
                sessionEstablished = true;
              } else {
                setSsoError(
                  outcome.error?.message ?? 'Quant Account sign-in failed. Please try again.',
                );
              }
            } catch {
              // Exchange threw (network/timeout). Scrub anyway, then fall
              // through to the cookie restore — a stale token param must not
              // kill an otherwise valid session.
              scrubSsoParams();
              if (!active) return;
              setSsoError('Quant Account sign-in failed. Please try again.');
            }
          }
        }

        // Step 2: HttpOnly refresh-cookie restore (unchanged behavior).
        if (!sessionEstablished) {
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('auth-timeout')), 5000),
          );
          const session = await Promise.race([authSession.refresh(), timeout]);
          if (!active) return;
          sessionEstablished = Boolean(session.success && session.data?.accessToken);
        }

        if (!active) return;
        setIsAuthenticated(sessionEstablished);
        if (!sessionEstablished) clearSession();
      } catch {
        if (active) clearSession();
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clearSession, scrubSsoParams]);

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
      setSsoError(null);
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
    setSsoError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, error, ssoError, login, logout }}>
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
