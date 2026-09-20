'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clearMailCache } from '../lib/offline/mail-cache';
import { clearOutbox } from '../lib/offline/outbox';
import { apiClient } from '../services/api-client';
import {
  browserAuthSession,
  cleanupLegacyBrowserTokens,
  isTwoFactorChallenge,
} from '../services/browser-auth-session';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
}

/**
 * `login` no longer implies a session. An account with a second factor stops
 * here and the caller has to decide what to render, so the outcome is returned
 * rather than signalled by a thrown error.
 */
export type LoginOutcome =
  | { status: 'signed-in' }
  | { status: 'two-factor-required'; expiresIn: number };

/** Structured error lets the form distinguish an expired challenge from a bad code. */
class AuthFlowError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AuthFlowError';
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  /** True between a password accepted and its second factor answered. */
  isTwoFactorPending: boolean;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  completeTwoFactor: (code: string) => Promise<void>;
  cancelTwoFactor: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTwoFactorPending, setIsTwoFactorPending] = useState(false);
  // A ref, not state, and never localStorage: the challenge is a credential in
  // its own right, and the only thing that should outlive this tab's memory is
  // the HttpOnly cookie the server sets once the second factor is answered.
  const challengeRef = useRef<string | null>(null);

  const clearMemorySession = useCallback(() => {
    browserAuthSession.clearAccessToken();
    challengeRef.current = null;
    setIsTwoFactorPending(false);
    setUser(null);
  }, []);

  const loadProfile = useCallback(async () => {
    const profile = await apiClient.getUserInfo();
    if (!profile.success || !profile.data) {
      throw new Error(profile.error?.message || 'Could not load your profile.');
    }
    setUser(profile.data);
  }, []);

  useEffect(() => {
    apiClient.onAuthenticationError(clearMemorySession);
    return () => apiClient.onAuthenticationError(undefined);
  }, [clearMemorySession]);

  // Fail closed on every load: erase all historical JavaScript-readable token
  // formats, then restore only from the server-managed HttpOnly refresh cookie.
  useEffect(() => {
    let active = true;

    async function hydrate() {
      cleanupLegacyBrowserTokens();
      clearMemorySession();
      try {
        // Timeout after 5 seconds — don't hang forever on auth check
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Auth timeout')), 5000),
        );
        const session = await Promise.race([browserAuthSession.refresh(), timeout]);
        if (!active || !session.success || !session.data?.accessToken) return;
        await loadProfile();
      } catch {
        // Auth failed or timed out — go to login
        if (active) clearMemorySession();
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, [clearMemorySession, loadProfile]);

  // Rotate before the 15-minute access token expires. The rotated refresh token
  // remains inside the HttpOnly cookie and never enters this provider.
  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(
      async () => {
        const session = await browserAuthSession.refresh();
        if (!session.success || !session.data?.accessToken) {
          clearMemorySession();
        }
      },
      12 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, [user, clearMemorySession]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => {
      setError(null);
      setIsLoading(true);
      cleanupLegacyBrowserTokens();
      try {
        const session = await browserAuthSession.login(email, password);
        if (!session.success || !session.data) {
          throw new Error(session.error?.message || 'Login failed');
        }

        if (isTwoFactorChallenge(session.data)) {
          challengeRef.current = session.data.challenge;
          setIsTwoFactorPending(true);
          return { status: 'two-factor-required', expiresIn: session.data.expiresIn };
        }

        if (!session.data.accessToken) {
          throw new Error('Login failed');
        }
        await loadProfile();
        return { status: 'signed-in' };
      } catch (caught) {
        clearMemorySession();
        const message = caught instanceof Error ? caught.message : 'Login failed';
        setError(message);
        throw caught;
      } finally {
        setIsLoading(false);
      }
    },
    [clearMemorySession, loadProfile],
  );

  const completeTwoFactor = useCallback(
    async (code: string) => {
      const challenge = challengeRef.current;
      if (!challenge) {
        const message = 'This sign-in attempt is no longer valid. Enter your password again.';
        setError(message);
        throw new AuthFlowError(message, 'CHALLENGE_EXPIRED');
      }

      setError(null);
      setIsLoading(true);
      let sessionIssued = false;
      try {
        const session = await browserAuthSession.completeTwoFactor(challenge, code);
        if (!session.success || !session.data?.accessToken) {
          throw new AuthFlowError(
            session.error?.message || 'That code was not accepted.',
            session.error?.code || 'TWO_FACTOR_FAILED',
          );
        }
        sessionIssued = true;
        try {
          await loadProfile();
        } catch {
          throw new AuthFlowError(
            'Your code was accepted, but the session could not be initialized. Sign in again.',
            'SESSION_INITIALIZATION_FAILED',
          );
        }
        // Drop the password-proof challenge only after the browser session and
        // profile are both ready. It carries no app authority by itself.
        challengeRef.current = null;
        setIsTwoFactorPending(false);
      } catch (caught) {
        const flowError =
          caught instanceof AuthFlowError
            ? caught
            : new AuthFlowError('That code was not accepted.', 'TWO_FACTOR_FAILED');

        if (sessionIssued) {
          // A refresh cookie and access token were minted before profile
          // hydration failed. Revoke/clear both so UI state cannot say signed
          // out while credentials remain live.
          try {
            await browserAuthSession.logout();
          } catch {
            browserAuthSession.clearAccessToken();
          }
          clearMemorySession();
        } else if (flowError.code === 'CHALLENGE_EXPIRED') {
          challengeRef.current = null;
          setIsTwoFactorPending(false);
        }

        setError(flowError.message);
        throw flowError;
      } finally {
        setIsLoading(false);
      }
    },
    [clearMemorySession, loadProfile],
  );

  const cancelTwoFactor = useCallback(() => {
    challengeRef.current = null;
    setIsTwoFactorPending(false);
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await browserAuthSession.logout();
    } finally {
      cleanupLegacyBrowserTokens();
      clearMemorySession();
      setError(null);
      // Offline-first means the previous account's mail is sitting in IndexedDB,
      // and its unsent archives are sitting in the outbox. Neither is scoped to a
      // session, so without this the next person to sign in on this browser opens
      // to someone else's inbox until the first fetch lands, and their queued
      // mutations replay against the new token.
      //
      // The outbox goes first: it is the half that can still make network calls.
      // A flush already in flight will fail against the revoked token, and its
      // entries are gone, so nothing is retried.
      //
      // Deliberately not awaited and never allowed to throw — a wedged IndexedDB
      // must not be able to strand someone in a signed-in shell.
      void clearOutbox()
        .then(() => clearMailCache())
        .catch(() => {
          /* best effort: the session is already gone either way */
        });
      queryClient.clear();
    }
  }, [clearMemorySession, queryClient]);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    error,
    isTwoFactorPending,
    login,
    completeTwoFactor,
    cancelTwoFactor,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
