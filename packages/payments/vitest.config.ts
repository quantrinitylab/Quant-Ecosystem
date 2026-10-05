import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Only run source tests. turbo runs `test` concurrently with this package's
    // own `build` (dependsOn is only `^build`), so compiled copies under dist/
    // can appear mid-run and get double-executed as stale suites
    // (ERR_MODULE_NOT_FOUND on half-emitted dist). dist/** must never be
    // collected as test files.
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
