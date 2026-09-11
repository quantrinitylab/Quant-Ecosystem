import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  oxc: false,
  // The app's tsconfig sets jsx:"preserve" (required by Next.js), which leaves JSX
  // untransformed and breaks vitest's import analysis on .tsx test suites. Overriding
  // the esbuild JSX transform here compiles JSX during tests without touching the
  // Next.js tsconfig. (Requires a Vite version that honors this override; vitest 3.x.)
  esbuild: {
    jsx: 'automatic',
    tsconfigRaw: {
      compilerOptions: {
        jsx: 'react-jsx',
      },
    },
  },
  resolve: {
    alias: {
      // `@quant/payment` is a source-only engine (no published package / not linked
      // into this app's node_modules), so vitest cannot resolve the bare specifier
      // the payments route imports. Map it to its source entry so the route's seam
      // (real PaymentEngine + PaymentValidationError) can be exercised in tests.
      // This is test-only resolution and does not change runtime packaging.
      '@quant/payment': fileURLToPath(
        new URL('../../packages/payment/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // ---------------------------------------------------------------------------
    // Boot the REAL `buildApp()` under vitest (engine-wiring-bugs-fix, Task 7.4/7.5).
    //
    // The `@quant/*` workspace packages are consumed from TS source (`main: src/index.ts`,
    // `"type": "module"`, with NodeNext-style relative imports written using `.js` specifiers).
    // The production backend runs them through a global TS ESM loader
    // (`node --loader ts-node/esm`), so Node's own resolver maps each `.js` specifier onto its
    // on-disk `.ts` source and loads the unbuilt sources directly.
    //
    // Under vitest those packages reach Node's native module loader along paths that BYPASS
    // Vite's transform pipeline — so `server.deps.inline` / `ssr.noExternal` cannot fix them:
    //   1. vite-node externalizes the symlinked workspace packages and hands them to Node, and
    //   2. product code performs a synchronous `require('@quant/agentic')`
    //      (apps/quantai/backend/routes/collaboration.ts) during `buildApp()` registration.
    // In both cases Node sees `import './orchestrator/orchestrator.js'` inside an unbuilt `.ts`
    // package and throws `Cannot find module '.../orchestrator.js'` before any route registers.
    //
    // Registering `tsx` as a Node import hook in each test worker reproduces the production
    // loader exactly: Node natively resolves the `.ts` sources and maps the `.js` specifiers
    // onto them, for BOTH the externalized import path and the literal `require(...)`. This is a
    // test-tooling change only — no product source is touched, and no assertion is relaxed.
    pool: 'forks',
    execArgv: ['--import', 'tsx'],
    // Booting the full Fastify app (createApp substrate + ~36 route plugins + engine
    // construction) through the tsx loader is heavier than a unit test, so give the boot
    // suites headroom over the 5s default when the whole suite runs in parallel.
    testTimeout: 60000,
    hookTimeout: 60000,
    include: [
      'src/__tests__/**/*.test.ts',
      'src/__tests__/**/*.test.tsx',
      'backend/__tests__/**/*.test.ts',
    ],
  },
});
