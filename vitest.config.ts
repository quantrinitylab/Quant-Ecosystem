import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'react',
    },
  },
  test: {
    globals: true,
    // Timing-sensitive suites (fast-check property tests, full Fastify app boots) can exceed
    // vitest's 5s default purely from CPU contention when the whole monorepo's suites run in
    // parallel under `turbo test`. Give explicit headroom so the gate is reliable in CI; this
    // does not relax any assertion (each suite passes well under this when run in isolation).
    testTimeout: 30000,
    hookTimeout: 30000,
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
        // Start conservative; actual coverage is ~30%. Increase over time.
        statements: 20,
        branches: 20,
        functions: 20,
        lines: 20,
      },
    },
  },
});
