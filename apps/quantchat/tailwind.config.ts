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
          surface: 'var(--quant-card)',
          text: 'var(--quant-foreground)',
          border: 'var(--quant-border)',
          background: 'var(--quant-background)',
        },
        emerald: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
          950: '#022C22',
        },
        indigo: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          950: '#1E1B4B',
        },
        amber: {
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
      },
      keyframes: {
        progress: {
          '0%': { width: '0%' },
          '100%': { width: '100%' },
        },
      },
      animation: {
        progress: 'progress 5s linear forwards',
      },
    },
  },
  plugins: [],
};

export default config;
