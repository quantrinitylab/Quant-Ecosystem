// @vitest-environment node
// ============================================================================
// Bug 1 — quantai cannot boot (phantom / undeclared `@quant/*` packages)
// engine-wiring-bugs-fix · Task 1 (Phase 1: exploratory bug-condition check)
// ============================================================================
//
// METHODOLOGY (bugfix exploration):
//   This suite asserts the *fixed* (correct) behavior. On the CURRENT (unfixed)
//   code it is EXPECTED TO FAIL — that failure is the SUCCESS outcome of this
//   task: it reproduces Bug 1 and yields the counterexamples (the unresolved
//   `@quant/*` engine specifiers, the first being `@quant/cache`). DO NOT "fix"
//   this test or the code from here — the fix is Task 7.
//
//   This SAME suite is re-run in Task 7.5 (fix-check) and is expected to PASS
//   once the 8 source-only engines are promoted to real packages and all 9
//   `@quant/*` deps are declared in quantai + re-linked.
//
// Bug Condition (design `isBugConditionBug1`): an import reachable from
//   `buildApp()` targets a `@quant/*` package whose folder has NO package.json
//   (cache, cdn, events, ml, payment, recommendation, scaling, ab-testing) OR
//   is undeclared in the app's package.json (agentic) — i.e. it is not a
//   resolvable, declared/linked workspace package.
//
// Why a resolution probe is the primary check: the bug is a *package
//   resolution* failure. Probing whether each engine specifier resolves (via
//   the package's own `package.json`, which never executes the module) isolates
//   `isBugConditionBug1` exactly — independent of whether unrelated build-output
//   packages (e.g. `@quant/database`, whose `main` is `dist/index.js`) happen to
//   be compiled in a given environment. Declared/linked packages resolve;
//   phantom/undeclared ones throw `Cannot find module '@quant/<x>'`.
//
// Validates: Requirements 1.1, 1.2

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { AppConfig } from '@quant/server-core';
import { buildApp } from '../app';

// apps/quantai/backend/__tests__  ->  repo root (../../../..)
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

// Resolver anchored at a real quantai route module, so the node_modules
// resolution chain is identical to the one buildApp()'s route imports use.
const requireFromRoutes = createRequire(new URL('../routes/cache.ts', import.meta.url));

// The 8 source-only engines whose route modules buildApp() statically imports;
// each currently maps to a packages/<x>/ folder with NO package.json (phantom).
const PHANTOM_ENGINE_SPECIFIERS = [
  '@quant/cache',
  '@quant/cdn',
  '@quant/events',
  '@quant/ml',
  '@quant/payment',
  '@quant/recommendation',
  '@quant/scaling',
  '@quant/ab-testing',
] as const;

// agentic is a *real* package (packages/agentic/package.json exists) but is
// undeclared in apps/quantai/package.json, so it is unlinked/unresolvable.
const UNDECLARED_ENGINE_SPECIFIER = '@quant/agentic';

const ALL_ENGINE_SPECIFIERS = [...PHANTOM_ENGINE_SPECIFIERS, UNDECLARED_ENGINE_SPECIFIER] as const;

// The prefixes buildApp() registers each engine's route module at; asserted
// once the app can actually boot (fix-check, Task 7.5).
const ENGINE_PREFIXES = [
  '/cache',
  '/cdn',
  '/events',
  '/ml',
  '/payments',
  '/recommendations',
  '/scaling',
  '/ab-testing',
  '/agentic',
] as const;

const testConfig: AppConfig = {
  port: 3004,
  host: '0.0.0.0',
  logLevel: 'silent',
  corsOrigins: ['http://localhost:3000'],
  rateLimitMax: 1000,
  rateLimitWindow: '1 minute',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

function resolutionError(specifier: string): string | null {
  try {
    // Resolving the package's own manifest proves the package is a resolvable,
    // declared/linked workspace package WITHOUT executing it (no build needed).
    requireFromRoutes.resolve(`${specifier}/package.json`);
    return null;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    return `${e.code ?? 'ERROR'}: ${(e.message ?? String(err)).split('\n')[0]}`;
  }
}

describe('Bug 1 — quantai buildApp() phantom/undeclared @quant/* boot failure', () => {
  // --------------------------------------------------------------------------
  // PRIMARY bug-condition check (canonical counterexample).
  // FIXED expectation: every engine specifier reachable from buildApp() resolves.
  // UNFIXED outcome: all 9 throw `Cannot find module '@quant/<x>'` — the test
  //   FAILS and the error list is the counterexample set (first: @quant/cache).
  // --------------------------------------------------------------------------
  it('resolves every @quant/* engine package reachable from buildApp()', () => {
    const unresolved = ALL_ENGINE_SPECIFIERS.map((spec) => ({
      spec,
      error: resolutionError(spec),
    })).filter((r) => r.error !== null);

    const report = unresolved.map((r) => `${r.spec} -> ${r.error}`).join('\n  ');
    // On unfixed code `unresolved` is non-empty -> fails, surfacing the
    // counterexamples. On fixed code (Task 7) it is empty -> passes.
    expect(unresolved, `Unresolvable @quant/* engine specifiers:\n  ${report}`).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // Documents the undeclared half of the bug condition (agentic): the package
  // exists on disk but is NOT declared in the app's dependencies. The existence
  // assertion holds on both unfixed and fixed code; the declaration assertion
  // encodes the FIXED expectation and FAILS on unfixed code — proving
  // "@quant/agentic is absent from quantai deps even though
  // packages/agentic/package.json exists".
  // --------------------------------------------------------------------------
  it('declares @quant/agentic in quantai deps even though packages/agentic/package.json exists', () => {
    const agenticManifest = JSON.parse(
      readFileSync(resolve(repoRoot, 'packages/agentic/package.json'), 'utf8'),
    ) as { name?: string };
    // The real workspace package exists and is named @quant/agentic.
    expect(agenticManifest.name).toBe('@quant/agentic');

    const quantaiManifest = JSON.parse(
      readFileSync(resolve(repoRoot, 'apps/quantai/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    const deps = quantaiManifest.dependencies ?? {};

    // FIXED expectation (Task 7.2): @quant/agentic must be a declared dependency.
    // On unfixed code this FAILS, confirming the undeclared-package bug condition.
    expect(deps).toHaveProperty(UNDECLARED_ENGINE_SPECIFIER);
  });

  // --------------------------------------------------------------------------
  // Reusable fix-check (design Unit Test for Bug 1 / Task 7.5): import the REAL
  // app and boot it. UNFIXED outcome: the import graph fails at module
  // resolution before any route registers -> this FAILS (bug confirmed). FIXED
  // outcome: resolves, boots, and registers every previously-broken prefix.
  // --------------------------------------------------------------------------
  it('imports the real buildApp() and boots with all engine prefixes registered', async () => {
    expect(typeof buildApp).toBe('function');

    const app = await buildApp(testConfig);
    try {
      await app.ready();
      // Fastify's default `printRoutes()` collapses shared path segments into a
      // compressed radix tree, so a registered prefix like `/agentic` is NOT present
      // as a literal substring. `{ commonPrefix: false }` prints each route's full
      // path, which is what lets us assert the previously-broken engine prefixes are
      // actually registered (the routes themselves are exercised via inject in
      // agent-surfaces.seam.test.ts).
      const routes = app.printRoutes({ commonPrefix: false });
      for (const prefix of ENGINE_PREFIXES) {
        expect(routes).toContain(prefix);
      }
    } finally {
      await app.close();
    }
  });
});
