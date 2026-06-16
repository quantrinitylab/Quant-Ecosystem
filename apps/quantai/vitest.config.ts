import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The app's tsconfig sets jsx:"preserve" (required by Next.js), which leaves JSX
  // untransformed and breaks vitest's import analysis on .tsx test suites. Overriding
  // the esbuild JSX transform here compiles JSX during tests without touching the
  // Next.js tsconfig. (Requires a Vite version that honors this override; vitest 3.x.)
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/__tests__/**/*.test.ts',
      'src/__tests__/**/*.test.tsx',
      'backend/__tests__/**/*.test.ts',
    ],
  },
});
