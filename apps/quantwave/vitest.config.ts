import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The app tsconfig sets `jsx: "preserve"` for Next.js builds; vitest must
  // transform JSX itself or .tsx test files fail to parse. (Vite 8 transforms
  // via oxc — the legacy `esbuild` key is ignored.)
  oxc: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
  },
});
