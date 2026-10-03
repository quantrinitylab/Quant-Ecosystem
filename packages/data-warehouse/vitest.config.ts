import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Only run TypeScript sources under src/. Without this, vitest's defaults also
    // match compiled test files emitted into dist/ (the package runs `tsc` builds),
    // which re-runs stale duplicate suites. Mirrors server-core/agentic convention.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  },
});
