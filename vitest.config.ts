import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // The root config is also picked up by per-package `vitest run` (turbo test) when a
    // package has no local config. Use a cwd-relative glob so tests are found whether vitest
    // runs from the repo root (coverage job) or a package dir. Playwright specs under e2e/
    // require the Playwright runner, not vitest, and are dropped via `exclude` below.
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', 'e2e/**'],
    // Per-package configs set environment: 'jsdom' for UI tests. The root config must honor
    // that for DOM-dependent tests (e.g. shared-ui sanitize/DOMPurify), else they run in node
    // and silently no-op. Default to node; use jsdom for UI code and component tests.
    environmentMatchGlobs: [
      ['**/shared-ui/**', 'jsdom'],
      ['**/*.tsx', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html'],
      // Exclude non-product code from the coverage denominator so the metric is meaningful:
      // test/spec files, e2e specs, build output, configs, type decls, scripts, generated.
      exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '**/__tests__/**',
        '**/*.{test,spec}.{ts,tsx}',
        'e2e/**',
        'scripts/**',
        '**/*.config.{ts,js,mjs,cjs}',
        '**/*.d.ts',
      ],
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
  },
});
