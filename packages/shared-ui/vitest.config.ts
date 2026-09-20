import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    // A local config REPLACES the root one, so the root's explicit 30s budget does not
    // apply here. With vitest's 5s default, this suite reported ~19 phantom failures under
    // `turbo test --concurrency=4`: booting jsdom plus mounting these components costs
    // seconds per file, so plain render assertions timed out purely from CPU contention
    // while passing in isolation. This relaxes no assertion — it only stops the gate from
    // lying about which tests are broken.
    testTimeout: 30000,
    hookTimeout: 30000,
    // `tsc` compiles `src/**/*` — tests included — into `dist/`, and vitest's
    // default `include` matches `dist/__tests__/*.test.js` as well as the
    // sources. Without this every test ran twice, and a stale compiled copy
    // could keep failing after its source was fixed. Collect from `src` only.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
