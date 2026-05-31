import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    '../../packages/shared-ui/src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
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
          background: 'var(--quant-background)',
          foreground: 'var(--quant-foreground)',
          surface: 'var(--quant-surface)',
          'surface-elevated': 'var(--quant-surface-elevated)',
          muted: 'var(--quant-muted)',
          'muted-foreground': 'var(--quant-muted-foreground)',
          border: 'var(--quant-border)',
          ring: 'var(--quant-ring)',
          card: 'var(--quant-card)',
          'card-foreground': 'var(--quant-card-foreground)',
          destructive: 'var(--quant-destructive)',
          'destructive-foreground': 'var(--quant-destructive-foreground)',
        },
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 200ms cubic-bezier(0.0, 0.0, 0.2, 1.0) forwards',
        'slide-up': 'slideUp 300ms cubic-bezier(0.0, 0.0, 0.2, 1.0) forwards',
        'scale-in': 'scaleIn 200ms cubic-bezier(0.0, 0.0, 0.2, 1.0) forwards',
      },
    },
  },
  plugins: [],
};

export default config;
