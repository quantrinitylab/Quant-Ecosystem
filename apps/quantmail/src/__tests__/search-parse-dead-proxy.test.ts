import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * QM-UIUX-070 — dead /api/search/parse proxy purge regression tests.
 *
 * The Next proxy surface for query parsing was dead API surface:
 *  - `src/app/api/search/parse/route.ts` proxied GET to the backend, and
 *  - the catch-all proxy allow-list (`backend/lib/routes-config.ts`) also
 *    exposed `search/parse`,
 * yet no web caller ever used either path. Verified by a repo-wide sweep:
 * the web search UI (`useUniversalSearch`, `api-client`) fans out to
 * POST /api/emails/search, GET /api/contacts/search, GET /api/events and
 * GET /api/search/all — never /api/search/parse — and no test, doc or
 * helper in the web app references it. The stale claim that it "powers
 * the query chips" described a sprint plan, not shipped behaviour.
 *
 * The honest fix is removal of the proxy surface only. The backend
 * endpoint itself (`GET /search/parse` in `backend/routes/search.ts`)
 * is NOT dead and stays: the Flutter client calls it directly on the
 * Fastify backend (`quant_core` `SearchApi.parseQuery` resolves against
 * `AppConfig.apiBaseUrl`, the backend base URL — it never transits the
 * Next `/api` layer).
 *
 * These tests pin the removal: the route file and the allow-list entry
 * must never come back, no shipped frontend source may reference the
 * dead path, and the real backend endpoint must remain in place.
 */

const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));
const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('QM-UIUX-070: dead /api/search/parse proxy is removed', () => {
  it('the dedicated Next route file no longer exists', () => {
    expect(existsSync(path.join(SRC_ROOT, 'app', 'api', 'search', 'parse', 'route.ts'))).toBe(false);
    expect(existsSync(path.join(SRC_ROOT, 'app', 'api', 'search', 'parse'))).toBe(false);
  });

  it('the catch-all proxy allow-list no longer exposes search/parse', () => {
    const routesConfig = readFileSync(
      path.join(APP_ROOT, 'backend', 'lib', 'routes-config.ts'),
      'utf8',
    );
    // The allow-list pattern literal for the dead route must stay gone.
    expect(routesConfig).not.toContain('^search\\/parse$');
  });

  it('no shipped frontend source references the dead proxy path', () => {
    const files = collectSourceFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(src, `search/parse found in ${path.relative(SRC_ROOT, file)}`).not.toContain(
        'search/parse',
      );
    }
  });

  it('the live sibling proxy /api/search/all is untouched', () => {
    // /search/all has a real web caller (api-client searchAll /
    // useUniversalSearch drive source) — only the dead parse route went.
    expect(existsSync(path.join(SRC_ROOT, 'app', 'api', 'search', 'all', 'route.ts'))).toBe(true);
  });
});

describe('QM-UIUX-070: the real backend endpoint is untouched', () => {
  it('backend GET /search/parse still exists for direct backend clients (Flutter)', () => {
    const backendSearch = readFileSync(path.join(APP_ROOT, 'backend', 'routes', 'search.ts'), 'utf8');
    expect(backendSearch).toContain("fastify.get('/parse'");
  });
});
