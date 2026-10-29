// ============================================================================
// API contract test (P0-2, Group 8) — the permanent guard against the
// proxy ↔ backend contract rotting again.
//
// The P0-2 inventory found 25 of 36 api-client methods dead or shape-broken
// across five failure patterns (missing backend endpoint, missing/misfiled
// proxy, singular/plural split, body-field mismatch, envelope wrapping).
// This test encodes the reconciled contract as data and asserts the chain
// for every entry point:
//
//   api-client method / direct call site → Next proxy route → backend route
//
// Tables are derived from the real sources (api-client.ts, src/app/api/**,
// backend/app.ts + backend/routes/*), so a rename on any layer fails here
// until the other layers — or this test's declared expectations — move too.
// Intentional backend-only endpoints are declared in BACKEND_ONLY_ALLOWLIST;
// orphans must be declared, never silent.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

type Endpoint = { method: string; path: string };

function normalizePath(path: string): string {
  const clean = path.split('?')[0]!.replace(/\/+$/, '') || '/';
  return clean
    .split('/')
    .map((seg) => (seg.startsWith(':') || seg.startsWith('[') ? ':' : seg))
    .join('/');
}

function key(e: Endpoint): string {
  return `${e.method} ${normalizePath(e.path)}`;
}

// ---------------------------------------------------------------------------
// Backend table: backend/app.ts prefixes + backend/routes/*.ts declarations
// ---------------------------------------------------------------------------

function backendEndpoints(): Endpoint[] {
  const appTs = readFileSync(join(APP_ROOT, 'backend/app.ts'), 'utf8');
  const importFile = new Map<string, string>();
  for (const m of appTs.matchAll(/import\s+(\w+)\s+from\s+'\.\/routes\/([\w-]+)'/g)) {
    importFile.set(m[1]!, m[2]!);
  }
  const endpoints: Endpoint[] = [];
  for (const m of appTs.matchAll(/register\((\w+),\s*\{\s*prefix:\s*'([^']+)'\s*\}\)/g)) {
    const file = importFile.get(m[1]!);
    const prefix = m[2]!;
    if (!file) continue;
    const src = readFileSync(join(APP_ROOT, 'backend/routes', `${file}.ts`), 'utf8');
    for (const r of src.matchAll(
      /fastify\.(get|post|put|patch|delete)\s*(?:<[\s\S]*?>)?\s*\(\s*'([^']+)'/g,
    )) {
      const routePath = r[2]!;
      endpoints.push({
        method: r[1]!.toUpperCase(),
        path: routePath === '/' ? prefix : `${prefix}${routePath}`,
      });
    }
  }
  return endpoints;
}

// ---------------------------------------------------------------------------
// Proxy table: src/app/api/**/route.ts (path from file location, target from
// the proxyToBackend call). Files without proxyToBackend (health, SSO
// exchange) are self-contained and out of this contract.
// ---------------------------------------------------------------------------

type ProxyRoute = Endpoint & { target: string; file: string };

function proxyRoutes(): ProxyRoute[] {
  const apiDir = join(APP_ROOT, 'src/app/api');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'route.ts') files.push(full);
    }
  };
  walk(apiDir);

  const routes: ProxyRoute[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const targetMatch = src.match(
      /proxyToBackend\(\s*request,\s*(?:`([^`]+)`|'([^']+)')/,
    );
    if (!targetMatch) continue;
    const target = (targetMatch[1] ?? targetMatch[2]!).replace(/\$\{[^}]+\}/g, ':param');
    const rel = file.slice(apiDir.length).replace(/\/route\.ts$/, '');
    const nextPath = `/api${rel.replace(/\[(\w+)\]/g, ':$1')}`;
    for (const h of src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/g)) {
      routes.push({ method: h[1]!, path: nextPath, target, file });
    }
  }
  return routes;
}

// ---------------------------------------------------------------------------
// Api-client calls: this.request('METHOD', path) in src/services/api-client.ts
// ---------------------------------------------------------------------------

function apiClientCalls(): Endpoint[] {
  const src = readFileSync(join(APP_ROOT, 'src/services/api-client.ts'), 'utf8');
  const calls: Endpoint[] = [];
  for (const m of src.matchAll(
    /this\.request(?:<[^>]*>)?\(\s*'(GET|POST|PUT|PATCH|DELETE)',\s*(?:`([^`]+)`|'([^']+)')/g,
  )) {
    const raw = (m[2] ?? m[3]!).split('?')[0]!.replace(/\$\{[^}]+\}/g, ':param');
    calls.push({ method: m[1]!, path: `/api${raw}` });
  }
  return calls;
}

function apiClientMethodNames(): string[] {
  const src = readFileSync(join(APP_ROOT, 'src/services/api-client.ts'), 'utf8');
  return [...src.matchAll(/^\s+async\s+(\w+)\(/gm)].map((m) => m[1]!).sort();
}

// Direct (non-api-client) frontend call sites, from inventory §5. The SSO
// exchange call is excluded: it is served by a self-contained Next route
// against the identity service, not by this contract.
const DIRECT_CALL_SITES: (Endpoint & { sourceFile: string; sourceNeedle: string })[] = [
  { method: 'POST', path: '/api/ai/captions', sourceFile: 'src/components/AITools.tsx', sourceNeedle: '/api/ai/captions' },
  { method: 'POST', path: '/api/exports', sourceFile: 'src/hooks/useExport.ts', sourceNeedle: '/api/exports' },
  { method: 'GET', path: '/api/exports/:id/status', sourceFile: 'src/hooks/useExport.ts', sourceNeedle: '/status' },
  { method: 'POST', path: '/api/exports/:id/cancel', sourceFile: 'src/hooks/useExport.ts', sourceNeedle: '/cancel' },
  { method: 'GET', path: '/api/brand-kit', sourceFile: 'src/pages/brand-kit.tsx', sourceNeedle: '/api/brand-kit' },
  { method: 'POST', path: '/api/brand-kit', sourceFile: 'src/pages/brand-kit.tsx', sourceNeedle: '/api/brand-kit' },
  { method: 'PUT', path: '/api/brand-kit/:id', sourceFile: 'src/pages/brand-kit.tsx', sourceNeedle: '/api/brand-kit/' },
  { method: 'DELETE', path: '/api/brand-kit/:id', sourceFile: 'src/pages/brand-kit.tsx', sourceNeedle: '/api/brand-kit/' },
  { method: 'GET', path: '/api/collaboration/:id/members', sourceFile: 'src/pages/collaborate.tsx', sourceNeedle: '/members' },
  { method: 'POST', path: '/api/collaboration/:id/invite', sourceFile: 'src/pages/collaborate.tsx', sourceNeedle: '/invite' },
  { method: 'GET', path: '/api/collaboration/:id/comments', sourceFile: 'src/pages/collaborate.tsx', sourceNeedle: '/comments' },
  { method: 'POST', path: '/api/collaboration/:id/comments', sourceFile: 'src/pages/collaborate.tsx', sourceNeedle: '/comments' },
  { method: 'DELETE', path: '/api/collaboration/:id/members/:userId', sourceFile: 'src/pages/collaborate.tsx', sourceNeedle: '/members/' },
  { method: 'PATCH', path: '/api/collaboration/:id/comments/:commentId/resolve', sourceFile: 'src/pages/collaborate.tsx', sourceNeedle: '/resolve' },
];

// Backend endpoints intentionally reachable without any proxy/frontend
// caller (ops or catalogue surface). Anything else unproxied fails the test.
const BACKEND_ONLY_ALLOWLIST: Endpoint[] = [
  { method: 'POST', path: '/auto-edit/scheduler/run' }, // ops/cron by design
  { method: 'GET', path: '/effects/categories' },
  { method: 'GET', path: '/effects/:id' },
  { method: 'GET', path: '/export/project/:projectId' },
  { method: 'GET', path: '/assets/project/:projectId' },
];

const EXPECTED_CLIENT_METHODS = [
  'addComment', 'addLayer', 'applyBrandKit', 'applyTemplate', 'autoEdit',
  'cancelExport', 'cancelJob', 'checkBrandConsistency', 'createBrandKit', 'createCraftRender',
  'createPhotoEdit', 'createProject',
  'deleteAsset', 'deleteBrandKit', 'deleteLayer', 'deleteProject',
  'duplicateLayer', 'getBrandKit', 'getCollaborators', 'getComments',
  'getCraftRender', 'getExportJob', 'getJob', 'getPhotoEdit', 'getProject', 'getProjectState', 'getTemplate', 'getTool',
  'inviteCollaborator', 'invokeTool',
  'listAssets', 'listBrandKits', 'listCraftRenders', 'listEffects', 'listLayers',
  'listJobs', 'listPhotoEdits', 'listProjects', 'listTools',
  'listTemplates', 'quoteTool', 'registerAsset', 'reorderLayers', 'requestUploadUrl',
  'saveProjectState', 'startExport', 'suggestTitles', 'updateBrandKit',
  'updateLayer', 'updateProject', 'completeUpload',
].sort();

describe('api contract (client → proxy → backend)', () => {
  const backend = backendEndpoints();
  const proxies = proxyRoutes();
  const backendKeys = new Set(backend.map(key));
  const proxyByKey = new Map(proxies.map((p) => [key(p), p]));

  function resolves(call: Endpoint): boolean {
    const proxy = proxyByKey.get(key(call));
    if (!proxy) return false;
    return backendKeys.has(key({ method: call.method, path: proxy.target }));
  }

  it('backend exposes the expected endpoint count', () => {
    // 39 at inventory time + 6 layer routes + GET /assets (P0-2)
    // + POST /assets/:id/complete (P0-3)
    // + GET /export/:id/download (P0-4, landed with its proxy below)
    // + GET/PUT /projects/:id/state (P0-5)
    // + POST /craft/effects/render + GET /craft/effects/renders/:id
    //   + GET /craft/effects/renders (C-2) = 53
    // + POST /photo/edits + GET /photo/edits/:id + GET /photo/edits (C-3B) = 56
    // + GET /tools + GET /tools/openapi.json + GET /tools/:name
    //   + POST /tools/:name/quote + POST /tools/:name/invoke
    //   + GET /jobs + GET /jobs/:id + POST /jobs/:id/cancel (CP-1) = 64.
    expect(backend.length).toBe(64);
  });

  it('api-client exposes exactly the reconciled method set', () => {
    expect(apiClientMethodNames()).toEqual(EXPECTED_CLIENT_METHODS);
  });

  it('every api-client call resolves through a proxy to a real backend route', () => {
    const calls = apiClientCalls();
    expect(calls.length).toBe(EXPECTED_CLIENT_METHODS.length);
    const dead = calls.filter((c) => !resolves(c));
    expect(dead.map(key)).toEqual([]);
  });

  it('every proxy handler forwards to a real backend route', () => {
    const dead = proxies.filter(
      (p) => !backendKeys.has(key({ method: p.method, path: p.target })),
    );
    expect(dead.map((p) => `${key(p)} -> ${p.target} (${p.file})`)).toEqual([]);
  });

  it('every direct call site still exists in its source file and resolves', () => {
    for (const site of DIRECT_CALL_SITES) {
      const src = readFileSync(join(APP_ROOT, site.sourceFile), 'utf8');
      expect(src, `${site.sourceFile} should still call ${site.sourceNeedle}`).toContain(
        site.sourceNeedle,
      );
      expect(resolves(site), `${key(site)} should resolve`).toBe(true);
    }
  });

  it('backend-only endpoints are exactly the declared allowlist', () => {
    const targeted = new Set(proxies.map((p) => key({ method: p.method, path: p.target })));
    const orphans = backend.filter((e) => !targeted.has(key(e)));
    expect(orphans.map(key).sort()).toEqual(BACKEND_ONLY_ALLOWLIST.map(key).sort());
  });

  it('proxy default target is the backend port 3013', () => {
    const proxySrc = readFileSync(join(APP_ROOT, 'src/app/api/_lib/proxy.ts'), 'utf8');
    expect(proxySrc).toContain('http://localhost:3013');
    expect(proxySrc).not.toContain('3008');
  });

  it('removed dead surfaces stay removed', () => {
    const gone = [
      // (The exports download proxy was on this list until P0-4 re-added it
      // together with GET /export/:id/download — it is now a live surface
      // pinned by the proxy→backend resolution tests above.)
      'src/app/api/ai/edit/route.ts',
      'src/app/api/ai/background-remove/route.ts',
      'src/app/api/ai/upscale/route.ts',
      'src/app/api/collaborate/[id]/invite/route.ts',
      'src/app/api/templates/[id]/use/route.ts',
      'src/hooks/useAnalytics.ts',
    ];
    for (const rel of gone) {
      expect(existsSync(join(APP_ROOT, rel)), `${rel} should stay deleted`).toBe(false);
    }
    const clientSrc = readFileSync(join(APP_ROOT, 'src/services/api-client.ts'), 'utf8');
    for (const dead of ['autosave', 'background-removal', 'auto-caption', 'style-transfer', '/ai/upscale']) {
      expect(clientSrc, `api-client must not reference ${dead}`).not.toContain(dead);
    }
    expect(clientSrc).not.toMatch(/['`]\/export['`/]/);
  });
});
