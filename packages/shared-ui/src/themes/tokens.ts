// ============================================================================
// Shared UI - Design Tokens (CSS Variables Map)
// ============================================================================

import { primary, accent, surface } from '@quant/brand';

export interface DensityTokens {
  compact: { spacing: string; fontSize: string };
  normal: { spacing: string; fontSize: string };
  comfortable: { spacing: string; fontSize: string };
}

export interface ElevationTokens {
  0: string;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
}

export interface BreakpointTokens {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
}

export interface AccessibilityTokens {
  focus: string;
  hover: string;
  active: string;
  disabled: string;
}

export interface MotionTokens {
  default: string;
  reduced: string;
}

export interface DesignTokens {
  colors: Record<string, string>;
  spacing: Record<string, string>;
  typography: Record<string, string>;
  shadows: Record<string, string>;
  transitions: Record<string, string>;
  borderRadius: Record<string, string>;
}

export const density: DensityTokens = {
  compact: { spacing: '0.25rem', fontSize: '0.8125rem' },
  normal: { spacing: '0.5rem', fontSize: '0.875rem' },
  comfortable: { spacing: '0.75rem', fontSize: '1rem' },
};

export const elevation: ElevationTokens = {
  0: 'none',
  1: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  2: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  3: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  4: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  5: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
};

export const breakpoints: BreakpointTokens = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

// Accessibility tokens use Tailwind CSS utility classes by design since the entire
// UI layer is built on Tailwind. These values are not raw CSS properties.
export const accessibility: AccessibilityTokens = {
  focus: 'ring-2 ring-blue-500 ring-offset-2',
  hover: 'brightness-95',
  active: 'brightness-90',
  disabled: 'opacity-50 cursor-not-allowed',
};

export const motion: MotionTokens = {
  default: '200ms ease-in-out',
  reduced: '0ms',
};

export const lightTokens: DesignTokens = {
  colors: {
    '--color-primary': primary[600],
    '--color-primary-hover': primary[700],
    '--color-secondary': '#6B7280',
    '--color-accent': accent[500],
    '--color-background': '#FFFFFF',
    '--color-surface': '#F9FAFB',
    '--color-text': '#111827',
    '--color-text-secondary': '#6B7280',
    '--color-border': '#E5E7EB',
    '--color-error': '#EF4444',
    '--color-warning': '#F59E0B',
    '--color-success': '#10B981',
    '--color-info': '#3B82F6',
  },
  spacing: {
    '--spacing-xs': '0.25rem',
    '--spacing-sm': '0.5rem',
    '--spacing-md': '1rem',
    '--spacing-lg': '1.5rem',
    '--spacing-xl': '2rem',
    '--spacing-2xl': '3rem',
    '--spacing-3xl': '4rem',
  },
  typography: {
    '--font-heading': 'Inter, system-ui, -apple-system, sans-serif',
    '--font-body': 'Inter, system-ui, -apple-system, sans-serif',
    '--font-mono': 'JetBrains Mono, Fira Code, monospace',
    '--font-size-xs': '0.75rem',
    '--font-size-sm': '0.875rem',
    '--font-size-md': '1rem',
    '--font-size-lg': '1.125rem',
    '--font-size-xl': '1.25rem',
    '--font-size-2xl': '1.5rem',
    '--font-size-3xl': '2rem',
    '--font-weight-normal': '400',
    '--font-weight-medium': '500',
    '--font-weight-semibold': '600',
    '--font-weight-bold': '700',
    '--line-height-tight': '1.25',
    '--line-height-normal': '1.5',
    '--line-height-relaxed': '1.75',
  },
  shadows: {
    '--shadow-sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    '--shadow-md': '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    '--shadow-lg': '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    '--shadow-xl': '0 20px 25px -5px rgb(0 0 0 / 0.1)',
  },
  transitions: {
    '--transition-fast': '150ms ease-in-out',
    '--transition-normal': '200ms ease-in-out',
    '--transition-slow': '300ms ease-in-out',
  },
  borderRadius: {
    '--radius-sm': '0.25rem',
    '--radius-md': '0.5rem',
    '--radius-lg': '0.75rem',
    '--radius-xl': '1rem',
    '--radius-full': '9999px',
  },
};

export const darkTokens: DesignTokens = {
  colors: {
    '--color-primary': primary[400],
    '--color-primary-hover': primary[300],
    '--color-secondary': '#9CA3AF',
    '--color-accent': accent[400],
    '--color-background': surface.dark,
    '--color-surface': surface.darkElevated,
    '--color-text': '#F9FAFB',
    '--color-text-secondary': '#9CA3AF',
    '--color-border': '#374151',
    '--color-error': '#F87171',
    '--color-warning': '#FBBF24',
    '--color-success': '#34D399',
    '--color-info': '#60A5FA',
  },
  spacing: {
    '--spacing-xs': '0.25rem',
    '--spacing-sm': '0.5rem',
    '--spacing-md': '1rem',
    '--spacing-lg': '1.5rem',
    '--spacing-xl': '2rem',
    '--spacing-2xl': '3rem',
    '--spacing-3xl': '4rem',
  },
  typography: {
    '--font-heading': 'Inter, system-ui, -apple-system, sans-serif',
    '--font-body': 'Inter, system-ui, -apple-system, sans-serif',
    '--font-mono': 'JetBrains Mono, Fira Code, monospace',
    '--font-size-xs': '0.75rem',
    '--font-size-sm': '0.875rem',
    '--font-size-md': '1rem',
    '--font-size-lg': '1.125rem',
    '--font-size-xl': '1.25rem',
    '--font-size-2xl': '1.5rem',
    '--font-size-3xl': '2rem',
    '--font-weight-normal': '400',
    '--font-weight-medium': '500',
    '--font-weight-semibold': '600',
    '--font-weight-bold': '700',
    '--line-height-tight': '1.25',
    '--line-height-normal': '1.5',
    '--line-height-relaxed': '1.75',
  },
  shadows: {
    '--shadow-sm': '0 1px 2px 0 rgb(0 0 0 / 0.1)',
    '--shadow-md': '0 4px 6px -1px rgb(0 0 0 / 0.2)',
    '--shadow-lg': '0 10px 15px -3px rgb(0 0 0 / 0.2)',
    '--shadow-xl': '0 20px 25px -5px rgb(0 0 0 / 0.2)',
  },
  transitions: {
    '--transition-fast': '150ms ease-in-out',
    '--transition-normal': '200ms ease-in-out',
    '--transition-slow': '300ms ease-in-out',
  },
  borderRadius: {
    '--radius-sm': '0.25rem',
    '--radius-md': '0.5rem',
    '--radius-lg': '0.75rem',
    '--radius-xl': '1rem',
    '--radius-full': '9999px',
  },
};

export const neonTokens: DesignTokens = {
  colors: {
    '--color-primary': '#22D3EE',
    '--color-primary-hover': '#67E8F9',
    '--color-secondary': '#A855F7',
    '--color-accent': '#F472B6',
    '--color-background': '#0F0F23',
    '--color-surface': '#1A1A2E',
    '--color-text': '#E0E7FF',
    '--color-text-secondary': '#94A3B8',
    '--color-border': '#334155',
    '--color-error': '#FB7185',
    '--color-warning': '#FCD34D',
    '--color-success': '#4ADE80',
    '--color-info': '#22D3EE',
  },
  spacing: {
    '--spacing-xs': '0.25rem',
    '--spacing-sm': '0.5rem',
    '--spacing-md': '1rem',
    '--spacing-lg': '1.5rem',
    '--spacing-xl': '2rem',
    '--spacing-2xl': '3rem',
    '--spacing-3xl': '4rem',
  },
  typography: {
    '--font-heading': 'Inter, system-ui, -apple-system, sans-serif',
    '--font-body': 'Inter, system-ui, -apple-system, sans-serif',
    '--font-mono': 'JetBrains Mono, Fira Code, monospace',
    '--font-size-xs': '0.75rem',
    '--font-size-sm': '0.875rem',
    '--font-size-md': '1rem',
    '--font-size-lg': '1.125rem',
    '--font-size-xl': '1.25rem',
    '--font-size-2xl': '1.5rem',
    '--font-size-3xl': '2rem',
    '--font-weight-normal': '400',
    '--font-weight-medium': '500',
    '--font-weight-semibold': '600',
    '--font-weight-bold': '700',
    '--line-height-tight': '1.25',
    '--line-height-normal': '1.5',
    '--line-height-relaxed': '1.75',
  },
  shadows: {
    '--shadow-sm': '0 1px 2px 0 rgb(0 0 0 / 0.2)',
    '--shadow-md': '0 4px 6px -1px rgb(0 0 0 / 0.3)',
    '--shadow-lg': '0 10px 15px -3px rgb(0 0 0 / 0.3)',
    '--shadow-xl': '0 20px 25px -5px rgb(0 0 0 / 0.3)',
  },
  transitions: {
    '--transition-fast': '150ms ease-in-out',
    '--transition-normal': '200ms ease-in-out',
    '--transition-slow': '300ms ease-in-out',
  },
  borderRadius: {
    '--radius-sm': '0.25rem',
    '--radius-md': '0.5rem',
    '--radius-lg': '0.75rem',
    '--radius-xl': '1rem',
    '--radius-full': '9999px',
  },
};

/**
 * Converts design tokens to a CSS variables string for injection into :root or a theme scope.
 */
export function tokensToCssVariables(tokens: DesignTokens): Record<string, string> {
  return {
    ...tokens.colors,
    ...tokens.spacing,
    ...tokens.typography,
    ...tokens.shadows,
    ...tokens.transitions,
    ...tokens.borderRadius,
  };
}
