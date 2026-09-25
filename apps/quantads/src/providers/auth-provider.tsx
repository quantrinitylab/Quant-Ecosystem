'use client';

// ============================================================================
// QuantAds — auth provider.
//
// QuantAds had no provider. Every call site used the shared @quant/shared-ui
// useAuth hook directly, so each one kept its own copy of the session and made
// its own /api/auth/userinfo round trip, and that hook reports a two-factor
// response as a generic failure (the 2FA response carries no accessToken, so
// the hook's "missing access token" branch swallows it). This context owns one
// session for the tree and surfaces the two-factor outcome honestly.
//
// Follows apps/quantsync/src/providers/auth-provider.tsx. It deliberately does
// not run a refresh/rotation loop: QuantAds exposes no /api/auth/refresh proxy,
// and adding one while logout still revokes via /oauth/revoke (which leaves the
// refresh-cookie family alive) would let a signed-out tab resurrect its
// session. Rotation belongs in its own change, with logout revoking the family.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthUser } from '@quant/shared-ui';
import {
  authSession,
  clearStoredTokens,
  fetchVerifiedUser,
  getAccessToken,
  isTwoFactorChallenge,
} from '../services/auth-session';

export type LoginOutcome =
  | { status: 'signed-in' }
  | { status: 'two-factor-required'; challenge: string; expiresIn: number };

export interface AuthContextValue {
  /** The backend-verified user, or null. Never a fabricated one. */
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True during the initial session restore, so guards can wait instead of flashing. */
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** A wedged identity service must not pin the app on a spinner forever. */
const RESTORE_TIMEOUT_MS = 5000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    clearStoredTokens();
    setUser(null);
  }, []);

  // Restore on load by asking the backend to verify the stored token. Fail
  // closed: no token, an unverifiable token, or a timeout all resolve to
  // signed-out rather than to an assumed session.
  useEffect(() => {
    let active = true;
    void (async () => {
      const token = getAccessToken();
      if (!token) {
        if (active) setIsLoading(false);
        return;
      }
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('auth-timeout')), RESTORE_TIMEOUT_MS),
        );
        const verified = await Promise.race([fetchVerifiedUser(token), timeout]);
        if (!active) return;
        if (verified) setUser(verified);
        else clearSession();
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
          // The password was accepted, but a password alone is not a session:
          // no token was issued, so nothing is stored and nobody is signed in.
          clearSession();
          return {
            status: 'two-factor-required',
            challenge: session.data.challenge,
            expiresIn: session.data.expiresIn ?? 300,
          };
        }
        if (!session.data.accessToken) throw new Error('Sign-in failed.');
        const verified = await fetchVerifiedUser(session.data.accessToken);
        if (!verified) throw new Error('Signed in, but your account could not be verified.');
        setUser(verified);
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
    setUser(null);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: user !== null, isLoading, error, login, logout }}
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
