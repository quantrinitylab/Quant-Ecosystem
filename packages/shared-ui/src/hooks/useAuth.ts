// ============================================================================
// Shared UI - useAuth Hook
// ============================================================================

import { useState, useCallback, useEffect } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
}

export interface UseAuthReturn {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: { email: string; username: string; password: string; displayName: string }) => Promise<void>;
  refreshToken: () => Promise<void>;
}

/**
 * Authentication hook for managing user auth state across all Quant apps
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = getStoredToken();
        if (token) {
          const userData = await fetchUserFromToken(token);
          setUser(userData);
        }
      } catch {
        clearStoredToken();
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // In production, call auth API
      const mockUser: AuthUser = {
        id: `user_${Date.now().toString(36)}`,
        email,
        username: email.split('@')[0],
        displayName: email.split('@')[0],
        role: 'user',
      };
      setUser(mockUser);
      storeToken(`mock_token_${Date.now()}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    clearStoredToken();
  }, []);

  const register = useCallback(async (data: { email: string; username: string; password: string; displayName: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const mockUser: AuthUser = {
        id: `user_${Date.now().toString(36)}`,
        email: data.email,
        username: data.username,
        displayName: data.displayName,
        role: 'user',
      };
      setUser(mockUser);
      storeToken(`mock_token_${Date.now()}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      // In production, call refresh token API
      storeToken(`mock_token_refreshed_${Date.now()}`);
    } catch {
      setUser(null);
      clearStoredToken();
    }
  }, []);

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    login,
    logout,
    register,
    refreshToken,
  };
}

// Storage helpers
function getStoredToken(): string | null {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    return (globalThis as unknown as { localStorage: Storage }).localStorage.getItem('quant_access_token');
  }
  return null;
}

function storeToken(token: string): void {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    (globalThis as unknown as { localStorage: Storage }).localStorage.setItem('quant_access_token', token);
  }
}

function clearStoredToken(): void {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    (globalThis as unknown as { localStorage: Storage }).localStorage.removeItem('quant_access_token');
  }
}

async function fetchUserFromToken(_token: string): Promise<AuthUser> {
  // In production, validate token with API
  return {
    id: 'user_restored',
    email: 'user@quant.app',
    username: 'user',
    displayName: 'User',
    role: 'user',
  };
}
