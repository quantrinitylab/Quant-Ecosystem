// @vitest-environment node
// ============================================================================
// Bug 2 — quantmail cannot boot (deep `@quant/auth` subpath imports)
// engine-wiring-bugs-fix · Task 2 (Phase 1: exploratory bug-condition check)
// ============================================================================
//
// METHODOLOGY (bugfix exploration):
//   This suite asserts the *fixed* (correct) behavior. On the CURRENT (unfixed)
//   code it is EXPECTED TO FAIL — that failure is the SUCCESS outcome of this
//   task: it reproduces Bug 2 and yields the counterexamples (the four
//   unresolved deep `@quant/auth/*` specifiers). DO NOT "fix" this test or the
//   code from here — the fix is Task 8 (add an `exports` map to `@quant/auth`).
//
//   This SAME suite is re-run in Task 8.3 (fix-check) and is expected to PASS
//   once `packages/auth/package.json` gains an `exports` map exposing the four
//   subpaths (and `.`) mapped to their `./src/...` TypeScript sources.
//
// Bug Condition (design `isBugConditionBug2`): an import is a deep subpath of
//   `@quant/auth` (`services/token-service`, `lib/secrets`, `lib/prisma`,
//   `crypto/secure-random`) that the package's resolution config does not
//   expose. `@quant/auth` declares `"main": "src/index.ts"` with NO `"exports"`
//   map, so Node resolves each subpath against the package ROOT
//   (`@quant/auth/services/...`, no `src/`) — a path that does not exist
//   (the real files live under `packages/auth/src/...`).
//
// Why a resolution probe is the primary check: the bug is a *package subpath
//   resolution* failure. Probing whether each deep specifier resolves (via the
//   package's own `package.json` exports rules, WITHOUT executing the module)
//   isolates `isBugConditionBug2` exactly — independent of whether unrelated
//   build-output packages (e.g. `@quant/database`, whose `main` is
//   `dist/index.js` and which is NOT built in this environment) happen to be
//   compiled. A full `buildApp()` import would surface that unrelated
//   "Failed to resolve entry for package @quant/database" noise and would also
//   execute `@prisma/client`; the pure resolution probe avoids both and pins
//   the failure to the deep `@quant/auth` subpaths specifically.
//
// Validates: Requirements 1.3, 1.4

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// apps/quantmail/backend/__tests__  ->  repo root (../../../..)
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

// Resolver anchored at the REAL oauth.ts route module, so the node_modules
// resolution chain (apps/quantmail/node_modules/@quant/auth -> packages/auth)
// is identical to the one `buildApp()`'s oauth/auth route imports use.
const requireFromOauth = createRequire(new URL('../routes/oauth.ts', import.meta.url));

// The four deep `@quant/auth` subpaths imported by oauth.ts AND auth.ts, paired
// with the `./src/...` module each MUST resolve to once the exports map is added
// (Task 8). The symbols each subpath is depended upon for are noted for clarity.
const DEEP_SUBPATHS = [
  {
    specifier: '@quant/auth/services/token-service', // TokenService
    expectedSrc: 'packages/auth/src/services/token-service.ts',
  },
  {
    specifier: '@quant/auth/lib/secrets', // getJwtSecret, getJwtRefreshSecret
    expectedSrc: 'packages/auth/src/lib/secrets.ts',
  },
  {
    specifier: '@quant/auth/lib/prisma', // prisma (default + named — used by e2e)
    expectedSrc: 'packages/auth/src/lib/prisma.ts',
  },
  {
    specifier: '@quant/auth/crypto/secure-random', // generateId
    expectedSrc: 'packages/auth/src/crypto/secure-random.ts',
  },
] as const;

function resolveDeepSubpath(specifier: string): { path: string | null; error: string | null } {
  try {
    // Resolving the deep specifier exercises @quant/auth's subpath-exposure
    // rules WITHOUT executing the target module (no Prisma client construction,
    // no transitive build-output package resolution).
    return { path: requireFromOauth.resolve(specifier), error: null };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    return {
      path: null,
      error: `${e.code ?? 'ERROR'}: ${(e.message ?? String(err)).split('\n')[0]}`,
    };
  }
}

describe('Bug 2 — quantmail buildApp() deep @quant/auth subpath resolution failure', () => {
  // --------------------------------------------------------------------------
  // PRIMARY bug-condition check (canonical counterexample set).
  // FIXED expectation: every deep `@quant/auth/*` subpath resolves to its
  //   `./src/...` module.
  // UNFIXED outcome: all four throw (`Cannot find module '@quant/auth/...'` /
  //   no exports entry) — this test FAILS and the error list is the
  //   counterexample set. These are the exact specifiers oauth.ts & auth.ts
  //   import; the first surfaces as
  //   `Cannot find package '@quant/auth/services/token-service' imported from
  //   .../oauth.ts` at ESM load time.
  // --------------------------------------------------------------------------
  it('resolves every deep @quant/auth subpath imported by oauth.ts / auth.ts', () => {
    const unresolved = DEEP_SUBPATHS.map(({ specifier }) => ({
      specifier,
      ...resolveDeepSubpath(specifier),
    })).filter((r) => r.error !== null);

    const report = unresolved.map((r) => `${r.specifier} -> ${r.error}`).join('\n  ');
    // On unfixed code `unresolved` contains all four subpaths -> fails,
    // surfacing the counterexamples. On fixed code (Task 8) it is empty -> passes.
    expect(unresolved, `Unresolvable deep @quant/auth subpaths:\n  ${report}`).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // FIXED expectation: each resolved subpath points at the SAME `./src/...`
  // module the routes (and the e2e `vi.mock(...)` targets) depend on, so the
  // fix preserves identity (does not rename the specifiers). On unfixed code
  // resolution throws, so this fails alongside the primary check.
  // --------------------------------------------------------------------------
  it('resolves each deep @quant/auth subpath to its packages/auth/src/<subpath> module', () => {
    for (const { specifier, expectedSrc } of DEEP_SUBPATHS) {
      const { path, error } = resolveDeepSubpath(specifier);
      expect(error, `${specifier} should resolve, got: ${error}`).toBeNull();
      // Normalize to a repo-relative comparison. Normalize path separators to
      // forward slashes first so the strip works on Windows (backslash) too —
      // otherwise the replace no-ops and `rel` stays absolute (Windows-only fail).
      const toPosix = (p: string): string => p.replace(/\\/g, '/');
      const rel = path
        ? toPosix(resolve(path)).replace(`${toPosix(resolve(repoRoot))}/`, '')
        : null;
      expect(rel, `${specifier} resolved to unexpected path: ${path}`).toBe(expectedSrc);
    }
  });

  // --------------------------------------------------------------------------
  // Documents the root cause + FIXED expectation on the manifest.
  //   - `main`/`types` stay `src/index.ts` (preservation — the bare `@quant/auth`
  //     import used elsewhere must keep resolving via the `"."` entry). This
  //     holds on BOTH unfixed and fixed code.
  //   - An `exports` map MUST exist and expose the four subpaths + `"."` to
  //     their `./src/...` sources (FIXED expectation). On UNFIXED code there is
  //     NO `exports` field, so this FAILS — confirming the bug condition
  //     "`@quant/auth` has `main: src/index.ts` and no `exports` map".
  // --------------------------------------------------------------------------
  it('exposes the deep subpaths via an exports map while keeping main = src/index.ts', () => {
    const authManifest = JSON.parse(
      readFileSync(resolve(repoRoot, 'packages/auth/package.json'), 'utf8'),
    ) as { name?: string; main?: string; types?: string; exports?: Record<string, string> };

    // Preservation invariants (true on unfixed and fixed code).
    expect(authManifest.name).toBe('@quant/auth');
    expect(authManifest.main).toBe('src/index.ts');
    expect(authManifest.types).toBe('src/index.ts');

    // FIXED expectation (Task 8.1): the exports map exists and maps each deep
    // subpath (and ".") to its ./src/... source. FAILS on unfixed code (no
    // exports field), which is the manifest-level counterexample for Bug 2.
    // NOTE: exports keys are dotted (".", "./services/token-service"), so we use
    // direct key access — NOT `toHaveProperty`, which treats dots as a nested
    // property path and would mis-handle these keys.
    const exportsMap = authManifest.exports ?? {};
    const exportKeys = Object.keys(exportsMap);
    expect(
      exportKeys,
      'packages/auth/package.json is missing an "exports" map exposing "."',
    ).toContain('.');
    expect(exportsMap['.']).toBe('./src/index.ts');
    for (const { specifier, expectedSrc } of DEEP_SUBPATHS) {
      const subpathKey = `.${specifier.slice('@quant/auth'.length)}`; // e.g. ./services/token-service
      expect(exportKeys, `exports map is missing entry for ${subpathKey}`).toContain(subpathKey);
      expect(exportsMap[subpathKey]).toBe(`./${expectedSrc.replace('packages/auth/', '')}`);
    }
  });
});
