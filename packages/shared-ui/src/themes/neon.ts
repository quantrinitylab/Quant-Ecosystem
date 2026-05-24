// ============================================================================
// Shared UI - Neon Theme (QuantNeon brand theme)
// ============================================================================

import type { ThemeConfig } from '@quant/common';

export const neonTheme: ThemeConfig = {
  name: 'neon',
  mode: 'dark',
  colors: {
    primary: '#00D4AA',
    secondary: '#FF6B9D',
    accent: '#7C3AED',
    background: '#0A0A1A',
    surface: '#14142B',
    text: '#FFFFFF',
    textSecondary: '#B0B0D0',
    border: '#2A2A4A',
    error: '#FF4757',
    warning: '#FFA502',
    success: '#2ED573',
    info: '#00D4AA',
  },
  fonts: {
    heading: 'Inter, system-ui, -apple-system, sans-serif',
    body: 'Inter, system-ui, -apple-system, sans-serif',
    mono: 'JetBrains Mono, Fira Code, monospace',
    sizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      md: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '2rem',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
    '3xl': '4rem',
  },
  borderRadius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    full: '9999px',
  },
};
