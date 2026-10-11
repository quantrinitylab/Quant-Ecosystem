import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Never collect compiled copies of the tests from the tsc build output.
    // In the monorepo full-sweep, turbo can run this package's `test` while
    // its own `build` (tsc) is still emitting dist/ — vitest then executes
    // dist/__tests__/*.test.js against a half-written dist and fails with
    // ERR_MODULE_NOT_FOUND for not-yet-emitted modules. Tests run from src.
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
});
