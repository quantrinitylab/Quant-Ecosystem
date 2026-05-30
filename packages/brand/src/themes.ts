/** Theme system for the Quant ecosystem - 6 curated themes */

export interface Theme {
  name: string;
  background: string;
  foreground: string;
  surface: string;
  surfaceElevated: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  muted: string;
  mutedForeground: string;
  destructive: string;
  destructiveForeground: string;
  ring: string;
}

export const dark: Theme = {
  name: 'dark',
  background: '#0F0F14',
  foreground: '#F8FAFC',
  surface: '#16161D',
  surfaceElevated: '#1C1C26',
  primary: '#818CF8',
  primaryForeground: '#0F0F14',
  accent: '#FBBF24',
  accentForeground: '#0F0F14',
  border: '#334155',
  muted: '#1E293B',
  mutedForeground: '#94A3B8',
  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',
  ring: '#6366F1',
};

export const light: Theme = {
  name: 'light',
  background: '#FFFFFF',
  foreground: '#0F172A',
  surface: '#F8FAFC',
  surfaceElevated: '#FFFFFF',
  primary: '#4F46E5',
  primaryForeground: '#FFFFFF',
  accent: '#D97706',
  accentForeground: '#FFFFFF',
  border: '#E2E8F0',
  muted: '#F1F5F9',
  mutedForeground: '#64748B',
  destructive: '#DC2626',
  destructiveForeground: '#FFFFFF',
  ring: '#4F46E5',
};

export const neon: Theme = {
  name: 'neon',
  background: '#0A0A0F',
  foreground: '#E0FFE0',
  surface: '#0F1A0F',
  surfaceElevated: '#142014',
  primary: '#00FF88',
  primaryForeground: '#0A0A0F',
  accent: '#FF00FF',
  accentForeground: '#0A0A0F',
  border: '#1A3A1A',
  muted: '#0F1A0F',
  mutedForeground: '#7AE07A',
  destructive: '#FF3366',
  destructiveForeground: '#0A0A0F',
  ring: '#00FF88',
};

export const bharat: Theme = {
  name: 'bharat',
  background: '#FFF9F0',
  foreground: '#1A0F00',
  surface: '#FFF5E6',
  surfaceElevated: '#FFFFFF',
  primary: '#D94F00',
  primaryForeground: '#FFFFFF',
  accent: '#7B2D8B',
  accentForeground: '#FFFFFF',
  border: '#F5D5B0',
  muted: '#FFF0DB',
  mutedForeground: '#6B4700',
  destructive: '#B91C1C',
  destructiveForeground: '#FFFFFF',
  ring: '#D94F00',
};

export const highContrast: Theme = {
  name: 'highContrast',
  background: '#000000',
  foreground: '#FFFFFF',
  surface: '#0A0A0A',
  surfaceElevated: '#1A1A1A',
  primary: '#FFFF00',
  primaryForeground: '#000000',
  accent: '#00FFFF',
  accentForeground: '#000000',
  border: '#FFFFFF',
  muted: '#1A1A1A',
  mutedForeground: '#E0E0E0',
  destructive: '#FF4444',
  destructiveForeground: '#000000',
  ring: '#FFFF00',
};

export const colorblindSafe: Theme = {
  name: 'colorblindSafe',
  background: '#FFFFFF',
  foreground: '#1A1A2E',
  surface: '#F5F5FA',
  surfaceElevated: '#FFFFFF',
  primary: '#0077BB',
  primaryForeground: '#FFFFFF',
  accent: '#EE7733',
  accentForeground: '#FFFFFF',
  border: '#CCCCDD',
  muted: '#EEEEF5',
  mutedForeground: '#555577',
  destructive: '#CC3311',
  destructiveForeground: '#FFFFFF',
  ring: '#0077BB',
};

export const themes: Record<string, Theme> = {
  dark,
  light,
  neon,
  bharat,
  highContrast,
  colorblindSafe,
};
