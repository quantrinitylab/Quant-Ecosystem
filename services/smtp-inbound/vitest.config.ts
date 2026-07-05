import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Only run TypeScript sources; never the compiled `*.test.js` emitted into
    // dist/ by `tsc` builds. Mirrors the root vitest config's exclude list.
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  },
});
