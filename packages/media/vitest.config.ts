import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Only run TypeScript sources; never the compiled `*.test.js` emitted into
    // dist/ by `tsc` builds (they go stale and double-run). Mirrors the root
    // vitest config's exclude list.
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  },
});
