import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        neon: {
          primary: '#a855f7',
          accent: '#ec4899',
          background: '#0F0F14',
          surface: '#1a1a24',
        },
      },
    },
  },
  plugins: [],
};

export default config;
