import type { Config } from 'tailwindcss';

// QuantWave Tailwind theme. Colors resolve to the CSS variables declared in
// src/app/globals.css (same token contract as the other Quant apps), so the
// design system stays in one place.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/shared-ui/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--quant-background)',
        foreground: 'var(--quant-foreground)',
        surface: 'var(--quant-surface)',
        primary: {
          DEFAULT: 'var(--quant-primary)',
          foreground: 'var(--quant-foreground)',
        },
        accent: {
          DEFAULT: 'var(--brand-accent)',
          foreground: 'var(--quant-foreground)',
        },
        muted: {
          DEFAULT: 'var(--quant-muted)',
          foreground: 'var(--quant-muted-foreground)',
        },
        border: 'var(--quant-border)',
        ring: 'var(--quant-ring)',
        destructive: {
          DEFAULT: 'var(--quant-destructive)',
          foreground: 'var(--quant-destructive-foreground)',
        },
        brand: {
          primary: 'var(--brand-primary)',
          'primary-hover': 'var(--brand-primary-hover)',
          accent: 'var(--brand-accent)',
          'accent-hover': 'var(--brand-accent-hover)',
          app: 'var(--brand-app-color)',
        },
        quant: {
          primary: 'var(--quant-primary)',
          secondary: '#8b5cf6',
          surface: 'var(--quant-card)',
          text: 'var(--quant-foreground)',
          border: 'var(--quant-border)',
          background: 'var(--quant-background)',
        },
      },
      keyframes: {
        progress: {
          '0%': { width: '0%' },
          '100%': { width: '100%' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        progress: 'progress 5s linear forwards',
        fadeIn: 'fadeIn 0.2s ease-out',
        slideUp: 'slideUp 0.3s ease-out',
        scaleIn: 'scaleIn 0.2s ease-out',
      },
      minWidth: {
        touch: '44px',
      },
      minHeight: {
        touch: '44px',
      },
    },
  },
  plugins: [],
};

export default config;
