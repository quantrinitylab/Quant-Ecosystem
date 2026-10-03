import { defineConfig } from 'vitest/config';

export default defineConfig({
  // apps/quantube tsconfig uses `jsx: preserve` (Next.js convention), but vitest's
  // esbuild transform must compile JSX away — otherwise vite:import-analysis fails
  // with "Failed to parse source ... invalid JS syntax" on .tsx components.
  // Vitest 4 defaults to the oxc transformer, so force esbuild for the override
  // below to take effect. (Mirrors apps/quantmail/vitest.config.ts.)
  oxc: false,
  esbuild: {
    jsx: 'automatic',
    tsconfigRaw: {
      compilerOptions: {
        jsx: 'react-jsx',
      },
    },
  },
  test: {
    globals: true,
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'backend/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
  },
});
