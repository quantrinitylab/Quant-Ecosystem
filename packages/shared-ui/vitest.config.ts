import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    // `tsc` compiles `src/**/*` — tests included — into `dist/`, and vitest's
    // default `include` matches `dist/__tests__/*.test.js` as well as the
    // sources. Without this every test ran twice, and a stale compiled copy
    // could keep failing after its source was fixed. Collect from `src` only.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
