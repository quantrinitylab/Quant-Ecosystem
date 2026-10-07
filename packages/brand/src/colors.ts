/** Brand color palette for the Quant ecosystem */

export const primary = {
  50: '#FFF7ED',
  100: '#FFEDD5',
  200: '#FED7AA',
  300: '#FFB875',
  400: '#FF9B5A',
  500: '#FF8C42', // Primary Brand Orange
  600: '#E8752F', // Pressed
  700: '#C75D1E',
  800: '#2B1A11', // Brand Soft
  900: '#1D1410', // Brand Subtle
  950: '#110C0A',
} as const;

export const accent = {
  50: '#FFFBEB',
  100: '#FEF3C7',
  200: '#FDE68A',
  300: '#FCD34D',
  400: '#FBBF24',
  500: '#F59E0B',
  600: '#D97706',
  700: '#B45309',
  800: '#92400E',
  900: '#78350F',
  950: '#451A03',
} as const;

export const neutral = {
  50: '#F5F5F5',
  100: '#E4E5E8',
  200: '#C5C7CD',
  300: '#A1A4AC',
  400: '#83868E',
  500: '#6B6E76',
  600: '#4A4D55',
  700: '#282C35', // Border Default
  800: '#16181D', // Elevated Surface
  900: '#111318', // Primary Surface
  950: '#090A0C', // Canvas
} as const;

export const semantic = {
  error: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    950: '#450A0A',
  },
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
    950: '#451A03',
  },
  success: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
    950: '#052E16',
  },
  info: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
    950: '#172554',
  },
} as const;

export const surface = {
  dark: '#090A0C', // Canvas
  darkElevated: '#111318', // Primary Surface
  darkOverlay: '#16181D', // Elevated Surface
  light: '#FFFFFF',
  lightElevated: '#F8F9FA',
  lightOverlay: '#F1F3F5',
} as const;

export const colors = {
  primary,
  accent,
  neutral,
  semantic,
  surface,
} as const;
