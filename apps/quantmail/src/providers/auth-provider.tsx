'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient } from '../services/api-client';

// ============================================================================
// Types
// ============================================================================

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

const STORAGE_KEY = 'quant_auth_tokens';

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    async function hydrate() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
          setIsLoading(false);
          return;
        }

        const { accessToken, refreshToken } = JSON.parse(stored) as {
          accessToken: string;
          refreshToken: string;
        };

        apiClient.setTokens(accessToken, refreshToken);

        const res = await apiClient.getUserInfo();
        if (res.success && res.data) {
          setUser(res.data);
        } else {
          // Tokens invalid, clear storage
          localStorage.removeItem(STORAGE_KEY);
          apiClient.clearTokens();
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        apiClient.clearTokens();
      } finally {
        setIsLoading(false);
      }
    }

    hydrate();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await apiClient.login({ email, password });
      if (res.success && res.data) {
        const { accessToken, refreshToken } = res.data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, refreshToken }));

        const userRes = await apiClient.getUserInfo();
        if (userRes.success && userRes.data) {
          setUser(userRes.data);
        } else {
          throw new Error(userRes.error?.message || 'Could not load your profile.');
        }
      } else {
        const message = res.error?.message || 'Login failed';
        setError(message);
        // Surface to the caller (the login page) so it can render the reason,
        // instead of silently redirecting on a failed sign-in.
        throw new Error(message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch {
      // Proceed even if revocation fails
    }
    localStorage.removeItem(STORAGE_KEY);
    apiClient.clearTokens();
    setUser(null);
    setError(null);
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
