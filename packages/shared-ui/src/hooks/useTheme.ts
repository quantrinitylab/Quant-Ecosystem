// ============================================================================
// Shared UI - useTheme Hook
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import type { ThemeConfig } from '@quant/common';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface UseThemeReturn {
  theme: ThemeConfig;
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const lightTheme: ThemeConfig = {
  name: 'light',
  mode: 'light',
  colors: {
    primary: '#3B82F6',
    secondary: '#6B7280',
    accent: '#8B5CF6',
    background: '#FFFFFF',
    surface: '#F9FAFB',
    text: '#111827',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    error: '#EF4444',
    warning: '#F59E0B',
    success: '#10B981',
    info: '#3B82F6',
  },
  fonts: {
    heading: 'Inter, system-ui, sans-serif',
    body: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, monospace',
    sizes: { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '2rem' },
  },
  spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem', '2xl': '3rem', '3xl': '4rem' },
  borderRadius: { sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', full: '9999px' },
};

const darkTheme: ThemeConfig = {
  ...lightTheme,
  name: 'dark',
  mode: 'dark',
  colors: {
    primary: '#60A5FA',
    secondary: '#9CA3AF',
    accent: '#A78BFA',
    background: '#111827',
    surface: '#1F2937',
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    border: '#374151',
    error: '#F87171',
    warning: '#FBBF24',
    success: '#34D399',
    info: '#60A5FA',
  },
};

/**
 * Theme management hook for consistent styling across Quant apps
 */
export function useTheme(): UseThemeReturn {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

  useEffect(() => {
    // Check system preference
    if (typeof globalThis !== 'undefined' && 'matchMedia' in globalThis) {
      const mediaQuery = (globalThis as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia('(prefers-color-scheme: dark)');
      setSystemPrefersDark(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, []);

  // Load saved preference
  useEffect(() => {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      const stored = (globalThis as unknown as { localStorage: Storage }).localStorage.getItem('quant_theme_mode') as ThemeMode | null;
      if (stored) setModeState(stored);
    }
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && systemPrefersDark);
  const theme = isDark ? darkTheme : lightTheme;

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      (globalThis as unknown as { localStorage: Storage }).localStorage.setItem('quant_theme_mode', newMode);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  return { theme, mode, isDark, setMode, toggleTheme };
}
