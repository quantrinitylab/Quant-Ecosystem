import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0D1117',
        'card-bg': '#161B22',
        border: '#30363D',
        'accent-blue': '#58A6FF',
        'accent-orange': '#FF8C42',
        'accent-green': '#238636',
        quant: {
          dark: '#0D1117',
          surface: '#161B22',
          border: '#30363D',
          blue: '#58A6FF',
          orange: '#FF8C42',
          green: '#238636',
        },
      },
    },
  },
  plugins: [],
};

export default config;
