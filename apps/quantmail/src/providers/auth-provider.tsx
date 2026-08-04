'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient } from '../services/api-client';
import { browserAuthSession, cleanupLegacyBrowserTokens } from '../services/browser-auth-session';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearMemorySession = useCallback(() => {
    browserAuthSession.clearAccessToken();
    apiClient.clearTokens();
    setUser(null);
  }, []);

  const loadProfile = useCallback(async () => {
    const profile = await apiClient.getUserInfo();
    if (!profile.success || !profile.data) {
      throw new Error(profile.error?.message || 'Could not load your profile.');
    }
    setUser(profile.data);
  }, []);

  // Fail closed on every load: erase all historical JavaScript-readable token
  // formats, then restore only from the server-managed HttpOnly refresh cookie.
  useEffect(() => {
    let active = true;

    async function hydrate() {
      cleanupLegacyBrowserTokens();
      clearMemorySession();
      try {
        const session = await browserAuthSession.refresh();
        if (!active || !session.success || !session.data?.accessToken) return;
        apiClient.setTokens(session.data.accessToken);
        await loadProfile();
      } catch {
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
  // remains inside the HttpOnly cookie and is never included in this callback.
  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(async () => {
      const session = await browserAuthSession.refresh();
      if (session.success && session.data?.accessToken) {
        apiClient.setTokens(session.data.accessToken);
      } else {
        clearMemorySession();
      }
    }, 12 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [user, clearMemorySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setIsLoading(true);
      cleanupLegacyBrowserTokens();
      try {
        const session = await browserAuthSession.login(email, password);
        if (!session.success || !session.data?.accessToken) {
          throw new Error(session.error?.message || 'Login failed');
        }
        apiClient.setTokens(session.data.accessToken);
        await loadProfile();
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

  const logout = useCallback(async () => {
    try {
      await browserAuthSession.logout();
    } finally {
      cleanupLegacyBrowserTokens();
      clearMemorySession();
      setError(null);
    }
  }, [clearMemorySession]);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    error,
    login,
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
