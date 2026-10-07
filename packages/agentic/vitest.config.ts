import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Only run TypeScript sources; never the compiled output in dist/.
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
