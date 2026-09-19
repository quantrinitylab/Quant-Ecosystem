// @vitest-environment node
// ============================================================================
// QuantWave — proxy/backend route contract
// ============================================================================
//
// Every Next route handler under `src/app/api/**` forwards to a backend path. Nothing
// previously checked that a backend route actually answers that path, so 21 proxies pointed
// at routes that did not exist and the Spaces, search, explore, trending and auth-session
// surfaces all returned 404 while typecheck, lint and the unit suite stayed green.
//
// This test closes that hole structurally: it reads the proxy sources and the backend route
// modules and asserts the two line up. It is deliberately static analysis rather than an app
// boot, so it needs no database and cannot be skipped by a missing env var.
//
// It also pins the backend origin default, because the same class of bug appeared there: all
// 40 proxies defaulted to port 3003 (Next's own port) instead of 3004 (the Fastify port), so
// the app proxied to itself.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const APP_ROOT = resolve(__dirname, '..', '..');
const API_DIR = join(APP_ROOT, 'src', 'app', 'api');
const BACKEND_DIR = join(APP_ROOT, 'backend');

function walk(dir: string, match: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, match));
    else if (match(entry)) out.push(full);
  }
  return out;
}

/**
 * Normalise a path for comparison by collapsing every dynamic segment to `*`.
 * `/spaces/${id}/join` and `/spaces/:id/join` both become `/spaces/*\/join`.
 */
function normalise(path: string): string {
  return path
    .replace(/\$\{[^}]*\}/g, '*') // template literal interpolation
    .replace(/:[A-Za-z0-9_]+/g, '*') // fastify params
    .replace(/\/+$/, '') // trailing slash
    .trim();
}

interface ProxyTarget {
  file: string;
  path: string;
}

/** Collect every `path:` passed to `proxyToBackend` across the proxy layer. */
function collectProxyTargets(): ProxyTarget[] {
  const targets: ProxyTarget[] = [];
  for (const file of walk(API_DIR, (n) => n === 'route.ts')) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/path:\s*(`[^`]*`|'[^']*'|"[^"]*")/g)) {
      const raw = m[1]!.slice(1, -1);
      if (raw.startsWith('/')) targets.push({ file: file.replace(`${APP_ROOT}/`, ''), path: raw });
    }
  }
  return targets;
}

/**
 * Collect every path the backend serves, as `prefix + route`.
 *
 * Prefixes come from the `app.register(mod, { prefix })` calls in `backend/app.ts`; a
 * registration with no prefix (the top-level discovery routes) contributes its routes at the
 * root. Route modules are matched to registrations by their import path.
 */
function collectBackendRoutes(): string[] {
  const appSrc = readFileSync(join(BACKEND_DIR, 'app.ts'), 'utf8');

  // import <local> [, { named }] from './routes/<file>'
  const importedModules = new Map<string, string>(); // local identifier -> routes file
  for (const m of appSrc.matchAll(
    /import\s+([A-Za-z0-9_]+)\s*(?:,\s*\{([^}]*)\})?\s*from\s*'\.\/routes\/([A-Za-z0-9_-]+)'/g,
  )) {
    const [, defaultName, named, file] = m;
    importedModules.set(defaultName!, file!);
    for (const n of (named ?? '').split(',')) {
      const name = n.trim();
      if (name) importedModules.set(name, file!);
    }
  }

  // app.register(<local>[, { prefix: '<p>' }])
  const registrations: Array<{ file: string; prefix: string }> = [];
  for (const m of appSrc.matchAll(
    /app\.register\(\s*([A-Za-z0-9_]+)\s*(?:,\s*\{[^}]*prefix:\s*'([^']*)'[^}]*\})?\s*\)/g,
  )) {
    const [, local, prefix] = m;
    const file = importedModules.get(local!);
    if (file) registrations.push({ file, prefix: prefix ?? '' });
  }

  expect(registrations.length).toBeGreaterThan(0);

  const paths: string[] = [];
  for (const { file, prefix } of registrations) {
    const src = readFileSync(join(BACKEND_DIR, 'routes', `${file}.ts`), 'utf8');
    for (const m of src.matchAll(
      /fastify\.(get|post|put|patch|delete)(?:<[^>]*>)?\(\s*'([^']*)'/g,
    )) {
      const route = m[2]!;
      const full = `${prefix}${route === '/' ? '' : route}`;
      paths.push(full === '' ? '/' : full);
    }
  }
  return paths;
}

describe('QuantWave API proxy/backend contract', () => {
  const proxyTargets = collectProxyTargets();
  const backendPaths = collectBackendRoutes();
  const backendNormalised = new Set(backendPaths.map(normalise));

  it('discovers the proxy layer and the backend route table', () => {
    // Guard the parsers themselves: if either regex stops matching, the suite must fail
    // loudly rather than vacuously passing on two empty sets.
    expect(proxyTargets.length).toBeGreaterThan(30);
    expect(backendPaths.length).toBeGreaterThan(30);
  });

  it('every proxied path is served by a backend route', () => {
    const dangling = proxyTargets
      .filter((t) => !backendNormalised.has(normalise(t.path)))
      .map((t) => `${t.path}  (${t.file})`);

    expect(dangling, `Proxies with no matching backend route:\n${dangling.join('\n')}`).toEqual([]);
  });

  it.each([
    '/spaces',
    '/spaces/live',
    '/spaces/:id',
    '/spaces/:id/join',
    '/spaces/:id/leave',
    '/spaces/:id/raise-hand',
    '/spaces/:id/invite-speaker',
    '/spaces/:id/remove-speaker',
    '/spaces/:id/mute-speaker',
    '/spaces/:id/end',
    '/spaces/:id/recording/start',
    '/spaces/:id/recording/stop',
    '/search',
    '/search/suggestions',
    '/explore',
    '/trending',
    '/auth/session',
    '/auth/refresh',
    '/auth/logout',
    '/notifications/read',
    '/notifications/preferences',
    '/posts/quote',
    '/posts/repost',
    '/feed/engagement',
    '/communities/:id',
  ])('backend serves %s', (path) => {
    expect(backendNormalised.has(normalise(path))).toBe(true);
  });
});

describe('QuantWave backend origin', () => {
  it('defaults to the Fastify port, not the Next port', async () => {
    // Imported dynamically so the module reads the current env.
    const { BACKEND_URL } = await import('../app/api/_lib/backend');
    expect(BACKEND_URL).toBe('http://localhost:3004');
  });

  it('no route handler re-declares its own BACKEND_URL', () => {
    const offenders = walk(API_DIR, (n) => n === 'route.ts')
      .filter((f) => /const\s+BACKEND_URL\s*=/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(`${APP_ROOT}/`, ''));

    expect(
      offenders,
      `These files shadow the shared BACKEND_URL and will drift:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
