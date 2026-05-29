// ============================================================================
// Shared UI - ThemeProvider Component
// ============================================================================

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeModeValue = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  theme: ThemeModeValue;
  setTheme: (theme: ThemeModeValue) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  defaultTheme?: ThemeModeValue;
  children: React.ReactNode;
}

const STORAGE_KEY = 'quant-theme';

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  defaultTheme = 'system',
  children,
}) => {
  const [theme, setThemeState] = useState<ThemeModeValue>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeModeValue | null;
      return stored || defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  const [systemDark, setSystemDark] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: 'light' | 'dark' = useMemo(() => {
    if (theme === 'system') return systemDark ? 'dark' : 'light';
    return theme;
  }, [theme, systemDark]);

  // Apply theme to documentElement
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedTheme);
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    // Add transition styles to prevent flash
    root.style.setProperty('transition', 'background-color 0.3s, color 0.3s');
  }, [resolvedTheme]);

  const setTheme = useCallback((newTheme: ThemeModeValue) => {
    setThemeState(newTheme);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, newTheme);
      } catch {
        // localStorage unavailable
      }
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/**
 * Hook to access theme mode and setter from ThemeProvider context.
 */
export function useThemeMode(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeMode must be used within a ThemeProvider');
  }
  return ctx;
}
