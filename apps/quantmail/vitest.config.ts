import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: false,
  esbuild: {
    jsx: 'automatic',
    tsconfigRaw: {
      compilerOptions: {
        jsx: 'react-jsx',
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    reporters: ['default', 'github-actions'],
    // ---------------------------------------------------------------------------
    // Boot the REAL `buildApp()` under vitest (engine-wiring-bugs-fix, Task 8.2).
    //
    // quantmail's `buildApp()` registers `oauthRoutes`/`authRoutes`, which import deep
    // subpaths of `@quant/auth` (`services/token-service`, `lib/secrets`, `lib/prisma`,
    // `crypto/secure-random`), and `createApp()` from `@quant/server-core` registers the
    // prisma plugin that imports `@quant/database`. The `@quant/*` workspace packages are
    // consumed from TS source (`main: src/index.ts`, `"type": "module"`, with NodeNext-style
    // relative imports written using `.js` specifiers), and `@quant/database` is a
    // build-output package (`main: dist/index.js`). The production backend runs them through
    // a global TS ESM loader (`node --loader ts-node/esm`), so Node's own resolver maps each
    // `.js` specifier onto its on-disk `.ts` source and loads the unbuilt sources directly.
    //
    // Under vitest those packages reach Node's native module loader along paths that BYPASS
    // Vite's transform pipeline — so `server.deps.inline` / `ssr.noExternal` cannot fix them:
    // vite-node externalizes the symlinked workspace packages and hands them to Node, and
    // Node sees `import './foo.js'` inside an unbuilt `.ts` package and throws
    // `Cannot find module '.../foo.js'` before any route registers.
    //
    // Registering `tsx` as a Node import hook in each test worker reproduces the production
    // loader exactly: Node natively resolves the `.ts` sources and maps the `.js` specifiers
    // onto them. This is a test-tooling change only — no product source is touched, and no
    // assertion is relaxed. (Mirrors apps/quantai/vitest.config.ts, the reference; quantmail
    // runs Vitest 4 where `poolOptions.forks.execArgv` is now the top-level `execArgv` option
    // — see the Vitest 4 "Pool Rework" migration note.)
    pool: 'forks',
    execArgv: ['--import', 'tsx'],
    // Booting the full Fastify app (createApp substrate + route plugins + engine
    // construction) through the tsx loader is heavier than a unit test, so give the boot
    // suites headroom over the 5s default when the whole suite runs in parallel.
    testTimeout: 30000,
    hookTimeout: 30000,
    include: [
      'api-v2/**/__tests__/**/*.test.ts',
      'backend/__tests__/**/*.test.ts',
      'src/__tests__/**/*.test.ts',
    ],
  },
});
