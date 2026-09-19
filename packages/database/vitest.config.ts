import { defineConfig } from 'vitest/config';

const hasDatabase = Boolean(
  process.env['DATABASE_URL'] || process.env['MEMORY_SHADOW_TEST_DATABASE_URL'],
);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [...(hasDatabase ? [] : ['**/*.postgres.test.*']), 'dist/**', 'node_modules/**'],
  },
});
