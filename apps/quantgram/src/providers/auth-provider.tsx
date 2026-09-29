import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { UniversalSSOTokenBridge } from '@quant/shared-ui';
import {
  authSession,
  clearAccessToken,
  getAccessToken,
  isTwoFactorChallenge,
  setAccessToken,
} from '../services/auth-session';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    clearAccessToken();
    setIsAuthenticated(false);
  }, []);

  // Restore a session on load from the HttpOnly refresh cookie. Fail closed and
  // never hang: a 5s cap means a wedged identity service drops us to logged-out,
  // not to a spinner forever.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken =
          urlParams.get('token') ||
          urlParams.get('accessToken') ||
          urlParams.get('__quant_sso_ticket');
        const ssoResult = UniversalSSOTokenBridge.getInstance().consumeHandoffTicket();
        const finalToken = ssoResult?.ticket || urlToken;

        if (finalToken) {
          setAccessToken(finalToken);
          setIsAuthenticated(true);
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.delete('token');
          currentUrl.searchParams.delete('accessToken');
          currentUrl.searchParams.delete('__quant_sso_ticket');
          window.history.replaceState({}, document.title, currentUrl.pathname + currentUrl.search);
          if (active) setIsLoading(false);
          return;
        }

        const localToken =
          typeof window !== 'undefined'
            ? getAccessToken() || localStorage.getItem('quant_access_token')
            : null;
        if (localToken) {
          setIsAuthenticated(true);
          if (active) setIsLoading(false);
        }

        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('auth-timeout')), 5000),
        );
        const session = await Promise.race([authSession.refresh(), timeout]);
        if (!active) return;
        if (session.success && session.data?.accessToken) {
          setIsAuthenticated(true);
        } else if (!localToken) {
          setIsAuthenticated(false);
        }
      } catch {
        const localToken =
          typeof window !== 'undefined'
            ? getAccessToken() || localStorage.getItem('quant_access_token')
            : null;
        if (!localToken && active) clearSession();
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
