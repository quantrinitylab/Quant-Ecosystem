// ============================================================================
// QuantChat - route gating coverage (regression net for the 2026-10-11 P0)
// ============================================================================
//
// /settings, /calls and /discover shipped UNGATED because they live in the
// legacy Pages Router, whose shell (src/pages/_app.tsx) mounted no auth
// gate, while the App Router layout mounted one only for its own routes.
//
// This suite makes that class of bug unshippable:
//   1. It walks the filesystem for EVERY page in both routers and asserts
//      the route registry (src/lib/route-access.ts) classifies it — a new
//      page added without a registry entry FAILS here instead of shipping
//      ungated (or misclassified as a 404).
//   2. It asserts the registry carries no stale entries (routes that no
//      longer exist), so the registry stays a truthful map of the app.
//   3. It asserts both shells actually mount a gate: the App Router layout
//      via AppProviders+AuthGate, the Pages Router via PagesAuthGate.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyPath, isPublicPath, APP_ROUTES } from '../lib/route-access';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appDir = join(appRoot, 'src', 'app');
const pagesDir = join(appRoot, 'src', 'pages');

/** Recursively collect page.tsx files under src/app (excluding the api tree). */
function collectAppPages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'api' || entry.name === '__tests__') continue;
      collectAppPages(full, acc);
    } else if (entry.name === 'page.tsx') {
      acc.push(full);
    }
  }
  return acc;
}

/** Convert a src/app page.tsx path to its URL path ('[id]' -> 'sample'). */
function appPageToRoute(file: string): string {
  const rel = relative(appDir, dirname(file)).split(sep).join('/');
  if (!rel) return '/';
  return (
    '/' +
    rel
      .split('/')
      .map((seg) => (seg.startsWith('[') && seg.endsWith(']') ? 'sample' : seg))
      .join('/')
  );
}

/** Pages Router page files (excluding the shell and the 404 page itself). */
function collectPagesRoutes(): string[] {
  return readdirSync(pagesDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.tsx'))
    .map((e) => e.name.replace(/\.tsx$/, ''))
    .filter((name) => name !== '_app' && name !== '404')
    .map((name) => `/${name}`);
}

describe('route gating coverage', () => {
  const appRoutes = collectAppPages(appDir).map(appPageToRoute);
  const pagesRoutes = collectPagesRoutes();
  const allRoutes = [...appRoutes, ...pagesRoutes];

  it('finds pages in both routers (sanity: the walk itself works)', () => {
    expect(appRoutes).toContain('/');
    expect(appRoutes).toContain('/stories');
    expect(appRoutes).toContain('/chat/sample');
    expect(pagesRoutes).toContain('/settings');
    expect(pagesRoutes).toContain('/calls');
    expect(pagesRoutes).toContain('/discover');
  });

  it.each(allRoutes)('route %s is classified by the registry (no ungated-by-omission)', (route) => {
    expect(classifyPath(route)).not.toBe('unknown');
  });

  it.each(allRoutes)('route %s is gated unless it is explicitly public', (route) => {
    if (isPublicPath(route)) {
      expect(classifyPath(route)).toBe('public');
    } else {
      expect(classifyPath(route)).toBe('app');
    }
  });

  it('registry has no stale app routes (every entry maps to a real page)', () => {
    for (const route of APP_ROUTES) {
      const asAppPage = join(appDir, route === '/' ? '' : route, 'page.tsx');
      const asPagesRoute = join(pagesDir, `${route.replace(/^\//, '')}.tsx`);
      expect(
        existsSync(asAppPage) || existsSync(asPagesRoute),
        `APP_ROUTES entry ${route} has no page on disk`,
      ).toBe(true);
    }
  });

  it('App Router shell mounts the gate (layout -> AppProviders -> AuthGate)', () => {
    const layout = readFileSync(join(appDir, 'layout.tsx'), 'utf8');
    expect(layout).toContain('AppProviders');
    const providers = readFileSync(join(appRoot, 'src', 'providers', 'app-providers.tsx'), 'utf8');
    expect(providers).toContain('AuthGate');
  });

  it('Pages Router shell mounts the gate (_app -> PagesAuthGate -> AuthGateCore)', () => {
    const appShell = readFileSync(join(pagesDir, '_app.tsx'), 'utf8');
    expect(appShell).toContain('PagesAuthGate');
    const pagesGate = readFileSync(
      join(appRoot, 'src', 'providers', 'auth-gate-pages.tsx'),
      'utf8',
    );
    expect(pagesGate).toContain('AuthGateCore');
  });
});
