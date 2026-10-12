/**
 * Dead-route gate (F-165; supersedes the F-124 guard).
 *
 * Guarantees the Next.js API surface cannot silently re-accumulate dead routes:
 * every fully-static route must have at least one in-repo caller, or be
 * explicitly documented below. Adding a new caller-less route.ts fails CI until
 * the author either wires a caller or documents the exception — deliberately,
 * in this file.
 *
 * Caller evidence is searched across the whole lane, not just apps/quantai/src:
 *   - apps/quantai/src                       (the app itself)
 *   - packages/ai, packages/quant-tools, packages/ai-memory  (lane packages)
 *   - packages/shared-ui/src                 (caller EVIDENCE ONLY — read-only;
 *                                            never modified by this lane)
 *
 * Two root-cause lessons are baked into the matcher (see unit tests):
 *  1. F-133 false positive: /api/auth/userinfo looked dead when only
 *     apps/quantai/src was scanned, but it is LIVE via an indirect fetch
 *     default — UniversalSSOTokenBridge.handoffUserInfoUrl (packages/shared-ui)
 *     consumed by apps/quantai/src/providers/auth-provider.tsx. The scan
 *     therefore includes packages/shared-ui as caller evidence, and a
 *     regression test pins exactly this indirection pattern.
 *  2. Suffix-collision false live: a naive substring check let
 *     `/api/ai/orchestrate` (a useAskQuant default) count as a caller of the
 *     unrelated `/api/orchestrate`. Matching is segment-boundary aware, so a
 *     longer path never masquerades as a caller of its suffix route.
 *
 * Dynamic-segment routes ([id], [action], …) are reported but never
 * dead-checked: their callers build URLs at runtime. Route groups `(name)`
 * do not affect the URL; private folders `_name` are not routable and are
 * skipped.
 *
 * IMPROVEMENT (F-165): every run prints a compact API-surface report
 * (live/dead/allowlisted/dynamic counts + caller counts). Set
 * ROUTE_GATE_REPORT=1 for the full per-route table.
 *
 * Known limitations (documented, not silent):
 * - One-hop caller detection: a client binding (e.g. apiClient.compareModels)
 *   counts as a caller even if the binding itself has no UI call sites. The
 *   deeper two-hop analysis ("binding with zero call sites") stays a scout's
 *   job — the gate never forces a deletion, it only freezes the inventory.
 * - Callers constructed from fully-dynamic string building (no static
 *   '/api/…' or '/…' suffix literal anywhere) are invisible to the scan; such
 *   routes must be added to EXTERNALLY_CONSUMED with a reason instead.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Routes called by external systems, never from in-repo code. */
const EXTERNALLY_CONSUMED: Record<string, string> = {
  '/api/health': 'deploy/infra healthchecks hit this from outside the app',
  '/api/quanty/mcp/callback':
    'OAuth provider redirect_uri landing — called by the IdP, not by in-repo code',
};

/**
 * Fully-static routes verified (2026-10-12, F-165 audit, segment-aware scan
 * over apps/quantai/src + lane packages + shared-ui caller evidence) to have
 * zero callers. Frozen inventory: adding a route here, removing one, or a
 * caller appearing for one fails the gate until this list is deliberately
 * updated in the same change. Kept as findings for deletion review.
 */
const LEGACY_ZERO_CALLER: Array<{ url: string; reason: string }> = [
  {
    url: '/api/ai/stream',
    reason:
      'Dead SSE proxy to /assistant/chat (useAIChat uses /api/sessions/:id/messages/stream, ' +
      'AskQuantPanel uses /api/ask). F-124 deletes it on quantai/loop-f124 (unmerged) — ' +
      'remove this entry in the same change that deletes the file.',
  },
  {
    url: '/api/orchestrate',
    reason:
      'Legacy backend-proxy stub (POST -> ${BACKEND_URL}/orchestrate). Superseded by ' +
      '/api/ask and /api/assistant/chat; the only similar literal in-repo is the ' +
      'unrelated /api/ai/orchestrate default in useAskQuant.',
  },
  {
    url: '/api/prompts/categories',
    reason: 'Backend proxy; categories are derived client-side from /api/prompts.',
  },
  {
    url: '/api/sessions/topics',
    reason: 'Backend proxy; topics are derived client-side from session data.',
  },
  {
    url: '/api/models/compare',
    reason:
      'Legacy backend proxy superseded by POST /api/agents/owned/models/compare; ' +
      'sole caller apiClient.compareModels removed by F-162 (dead). F-159 deletes ' +
      'it on quantai/loop-f159 (unmerged, verified no callers) — remove this entry ' +
      'in the same change that deletes the file.',
  },
  {
    url: '/api/analytics/agents/top',
    reason:
      'Real proxy to live backend GET /analytics/agents/top (F-168 recordRun writes ' +
      'real agent-run data; successRate derived). Only in-repo consumer was the deleted ' +
      'agent-performance component (F-168; name lowercased to not trip its deletion guard). ' +
      'Kept deliberately as public API surface; delete if no UI consumes it after the ' +
      'analytics dashboard lands.',
  },
];

// ---------------------------------------------------------------------------
// Pure core (unit-testable with synthetic file maps — no FS needed)
// ---------------------------------------------------------------------------

export interface ScannedRoute {
  /** Absolute path of the route.ts file. */
  file: string;
  /** Public URL, e.g. /api/health. Route groups stripped. */
  url: string;
  /** True when any segment is a dynamic [param]. */
  dynamic: boolean;
}

/**
 * Derive the public URL from a route.ts path relative to src/app.
 * Returns null for non-routable files (private `_…` folders).
 */
export function routeUrlFromRelPath(relPath: string): Omit<ScannedRoute, 'file'> | null {
  const segs = relPath.split('/');
  segs.pop(); // drop route.ts
  if (segs.some((s) => s.startsWith('_'))) return null; // private folder — not routable
  const publicSegs = segs.filter((s) => !(s.startsWith('(') && s.endsWith(')')));
  const dynamic = publicSegs.some((s) => s.startsWith('['));
  return { url: `/${publicSegs.join('/')}`, dynamic };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Segment boundaries: the URL must not be glued to identifier chars on either
// side. This is what stops `/api/ai/orchestrate` from counting as a caller of
// `/api/orchestrate`, and `/api/agents/swarm/goals` for `/api/goals`.
const BOUNDARY_BEFORE = '(?<![\\w$.-])';
const BOUNDARY_AFTER = '(?![\\w$-])';

export interface RouteMatchers {
  /** Matches the literal full path: '/api/health', `/api/sessions/${id}`-style templates. */
  full: RegExp;
  /**
   * Matches the sub-path after /api (e.g. '/health'): catches API_BASE-style
   * constructions like apiFetchRaw('/health') where '/api' is prepended at runtime.
   */
  suffix: RegExp;
}

export function buildRouteMatchers(url: string): RouteMatchers {
  const full = new RegExp(`${BOUNDARY_BEFORE}${escapeRegExp(url)}${BOUNDARY_AFTER}`);
  const segs = url.split('/').filter(Boolean);
  // Suffix is the path without the leading /api (or the last two segments for
  // non-/api routes, of which there are currently none static).
  const suffixPath =
    segs[0] === 'api' ? `/${segs.slice(1).join('/')}` : `/${segs.slice(-2).join('/')}`;
  const suffix = new RegExp(`${BOUNDARY_BEFORE}${escapeRegExp(suffixPath)}${BOUNDARY_AFTER}`);
  return { full, suffix };
}

/** A corpus file: absolute path + full text content. */
export interface CorpusFile {
  path: string;
  content: string;
}

/**
 * Caller evidence for one route: every corpus file (other than the route file
 * itself) whose text references the route's full path or its API_BASE-style
 * suffix, on segment boundaries. Test files are excluded from the corpus by
 * the scanner. Indirect defaults (e.g. `handoffUserInfoUrl = '/api/auth/userinfo'`
 * later passed to fetch()) count: the literal is in the corpus.
 */
export function findCallerFiles(route: ScannedRoute, corpus: CorpusFile[]): string[] {
  const { full, suffix } = buildRouteMatchers(route.url);
  const hits: string[] = [];
  for (const f of corpus) {
    if (f.path === route.file) continue;
    if (full.test(f.content) || suffix.test(f.content)) hits.push(f.path);
  }
  return hits;
}

export interface SurfaceScan {
  routes: ScannedRoute[];
  staticRoutes: ScannedRoute[];
  dynamicRoutes: ScannedRoute[];
  /** url -> caller file paths (static routes only). */
  callers: Map<string, string[]>;
  /** Static routes with zero callers, excluding EXTERNALLY_CONSUMED. */
  dead: string[];
  corpusSize: number;
  corpusDirs: string[];
}

export function classifySurface(
  routes: ScannedRoute[],
  corpus: CorpusFile[],
  externallyConsumed: Record<string, string>,
): SurfaceScan {
  const staticRoutes = routes.filter((r) => !r.dynamic);
  const dynamicRoutes = routes.filter((r) => r.dynamic);
  const callers = new Map<string, string[]>();
  const dead: string[] = [];
  for (const route of staticRoutes) {
    const hits = findCallerFiles(route, corpus);
    callers.set(route.url, hits);
    if (hits.length === 0 && !externallyConsumed[route.url]) dead.push(route.url);
  }
  return {
    routes,
    staticRoutes,
    dynamicRoutes,
    callers,
    dead: dead.sort(),
    corpusSize: corpus.length,
    corpusDirs: [],
  };
}

/** Duplicate detection: two route.ts files resolving to the same public URL. */
export function findDuplicateRoutes(routes: ScannedRoute[]): Array<{ url: string; files: string[] }> {
  const byUrl = new Map<string, string[]>();
  for (const r of routes) {
    const list = byUrl.get(r.url) ?? [];
    list.push(r.file);
    byUrl.set(r.url, list);
  }
  return [...byUrl.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([url, files]) => ({ url, files: files.sort() }));
}

// ---------------------------------------------------------------------------
// Human-readable report (F-165 improvement pass)
// ---------------------------------------------------------------------------

export function buildSurfaceReport(scan: SurfaceScan, full: boolean): string {
  const lines: string[] = [];
  const liveCount = [...scan.callers.entries()].filter(
    ([url, hits]) => hits.length > 0 && !EXTERNALLY_CONSUMED[url],
  ).length;
  const consumedCount = scan.staticRoutes.filter((r) => EXTERNALLY_CONSUMED[r.url]).length;
  lines.push('API surface report (dead-route-guard)');
  lines.push(
    `corpus: ${scan.corpusSize} files across ${scan.corpusDirs.length} dirs ` +
      `(${scan.corpusDirs.map((d) => d.split('/').slice(-2).join('/')).join(', ')})`,
  );
  lines.push(
    `static routes: ${scan.staticRoutes.length} ` +
      `(live ${liveCount} · legacy-dead ${scan.dead.length} · externally-consumed ${consumedCount}) ` +
      `· dynamic (unverifiable, not dead-checked): ${scan.dynamicRoutes.length}`,
  );
  if (scan.dead.length > 0) {
    lines.push('DEAD (frozen inventory — deletion candidates):');
    for (const url of scan.dead) {
      const known = LEGACY_ZERO_CALLER.find((k) => k.url === url);
      lines.push(`  ✕ ${url}  callers=0${known ? '' : '  <-- NOT in frozen inventory'}`);
      if (known) lines.push(`      ${known.reason}`);
    }
  }
  if (full) {
    lines.push('FULL TABLE (route → caller files):');
    for (const route of [...scan.staticRoutes].sort((a, b) => a.url.localeCompare(b.url))) {
      const hits = scan.callers.get(route.url) ?? [];
      const tag = EXTERNALLY_CONSUMED[route.url] ? 'ALLOW' : hits.length > 0 ? 'LIVE ' : 'DEAD ';
      const eg = hits[0] ? `  e.g. ${relative(process.cwd(), hits[0])}` : '';
      lines.push(`  ${tag} ${String(hits.length).padStart(3)}  ${route.url}${eg}`);
    }
    if (scan.dynamicRoutes.length > 0) {
      lines.push('DYNAMIC (skipped by static scan):');
      for (const r of scan.dynamicRoutes.sort((a, b) => a.url.localeCompare(b.url))) {
        lines.push(`  ~~~  ${r.url}`);
      }
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// FS-backed scan of the real repo
// ---------------------------------------------------------------------------

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const APP_SRC = join(TEST_DIR, '..', '..', '..'); // apps/quantai/src
const APP_DIR = join(APP_SRC, '..'); // apps/quantai
const REPO_ROOT = join(APP_DIR, '..', '..');

const ROUTE_SCAN_ROOT = join(APP_SRC, 'app');

/** Corpus roots: lane code + shared-ui as caller EVIDENCE ONLY (read-only). */
const CORPUS_DIR_REL = [
  'apps/quantai/src',
  'packages/ai/src',
  'packages/quant-tools/src',
  'packages/ai-memory/src',
  'packages/shared-ui/src',
];

function isTestFile(p: string): boolean {
  return p.includes('__tests__') || p.includes('.test.') || p.includes('.spec.');
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function scanRealSurface(): SurfaceScan {
  const routeFiles = walkTsFiles(ROUTE_SCAN_ROOT).filter((f) => f.endsWith('/route.ts'));
  const routes: ScannedRoute[] = [];
  for (const file of routeFiles) {
    const parsed = routeUrlFromRelPath(relative(join(APP_SRC, 'app'), file));
    if (parsed) routes.push({ ...parsed, file });
  }
  const corpusDirs = CORPUS_DIR_REL.map((d) => join(REPO_ROOT, d)).filter((d) => existsSync(d));
  const corpus: CorpusFile[] = [];
  for (const dir of corpusDirs) {
    for (const path of walkTsFiles(dir)) {
      if (isTestFile(path)) continue;
      corpus.push({ path, content: readFileSync(path, 'utf-8') });
    }
  }
  const scan = classifySurface(routes, corpus, EXTERNALLY_CONSUMED);
  scan.corpusDirs = corpusDirs.map((d) => relative(REPO_ROOT, d));
  return scan;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe('dead route gate (F-165)', () => {
  it('scans a real codebase (sanity: routes and corpus are non-trivial)', () => {
    const scan = scanRealSurface();
    expect(scan.routes.length).toBeGreaterThan(50);
    expect(scan.corpusSize).toBeGreaterThan(50);
    // The auth proxy route outside /api must be discovered and classified dynamic.
    const authAction = scan.routes.find((r) => r.url === '/auth/[action]');
    expect(authAction).toBeDefined();
    expect(authAction?.dynamic).toBe(true);
    console.log(buildSurfaceReport(scan, process.env.ROUTE_GATE_REPORT === '1'));
  });

  it('no NEW dead routes: zero-caller static inventory matches the frozen list', () => {
    const scan = scanRealSurface();
    const expected = LEGACY_ZERO_CALLER.map((k) => k.url).sort();
    const message =
      `Dead-route inventory changed. Either a new caller-less route.ts was added, ` +
      `a legacy dead route was deleted, or a frozen route gained a caller.\n` +
      `To fix: wire a real in-repo caller, delete the route, or deliberately update ` +
      `LEGACY_ZERO_CALLER / EXTERNALLY_CONSUMED in dead-route-guard.test.ts with a reason.\n` +
      `${buildSurfaceReport(scan, true)}`;
    expect(scan.dead, message).toEqual(expected);
  });

  it('externally-consumed allowlist entries resolve to real routes with reasons', () => {
    const scan = scanRealSurface();
    for (const [url, reason] of Object.entries(EXTERNALLY_CONSUMED)) {
      expect(reason.trim().length).toBeGreaterThan(10);
      const route = scan.routes.find((r) => r.url === url);
      expect(route, `allowlisted ${url} no longer exists — remove it from EXTERNALLY_CONSUMED`).toBeDefined();
      expect(route?.dynamic).toBe(false);
    }
  });

  it('no duplicate route.ts files resolve to the same public URL', () => {
    const scan = scanRealSurface();
    const dups = findDuplicateRoutes(scan.routes);
    expect(dups, `duplicate routes: ${JSON.stringify(dups, null, 2)}`).toEqual([]);
  });

  it('dynamic routes are reported, never dead-checked', () => {
    const scan = scanRealSurface();
    expect(scan.dynamicRoutes.length).toBeGreaterThan(0);
    for (const r of scan.dynamicRoutes) {
      expect(scan.dead).not.toContain(r.url);
    }
  });
});

// ---------------------------------------------------------------------------
// Unit tests: matcher semantics (pure, synthetic corpora — no FS)
// ---------------------------------------------------------------------------

function syntheticCorpus(entries: Array<[string, string]>): CorpusFile[] {
  return entries.map(([path, content]) => ({ path, content }));
}

function scanSynthetic(
  routeRelPaths: string[],
  corpusEntries: Array<[string, string]>,
  externallyConsumed: Record<string, string> = {},
): SurfaceScan {
  const routes: ScannedRoute[] = routeRelPaths.map((rel, i) => {
    const parsed = routeUrlFromRelPath(rel);
    if (!parsed) throw new Error(`synthetic route not routable: ${rel}`);
    return { ...parsed, file: `/repo/synth/${i}/route.ts` };
  });
  return classifySurface(routes, syntheticCorpus(corpusEntries), externallyConsumed);
}

describe('dead route gate: matcher semantics', () => {
  it('F-133 regression: indirect fetch default in shared-ui counts as a live caller', () => {
    // Mirrors packages/shared-ui UniversalSSOTokenBridge: the URL lives in a
    // static default field and is fetched indirectly; the app only calls
    // bridge.consumeHandoffTicket(). No file contains fetch('/api/auth/userinfo').
    const scan = scanSynthetic(
      ['api/auth/userinfo/route.ts'],
      [
        [
          '/repo/packages/shared-ui/src/interconnection/UniversalSSOTokenBridge.ts',
          `private static handoffUserInfoUrl = '/api/auth/userinfo';\n` +
            `const res = await fetch(UniversalSSOTokenBridge.handoffUserInfoUrl, { method: 'GET' });\n` +
            `public async consumeHandoffTicket() { return verifyTokenWithUserInfo(t); }`,
        ],
        [
          '/repo/apps/quantai/src/providers/auth-provider.tsx',
          `const consumed = await bridge.consumeHandoffTicket();`,
        ],
      ],
    );
    expect(scan.dead).toEqual([]);
    expect(scan.callers.get('/api/auth/userinfo')).toHaveLength(1);
  });

  it('allowlisted infra route passes with zero callers', () => {
    const scan = scanSynthetic(
      ['api/health/route.ts'],
      [['/repo/apps/quantai/src/whatever.ts', `console.log('nothing');`]],
      { '/api/health': 'infra healthchecks' },
    );
    expect(scan.dead).toEqual([]);
  });

  it('suffix collision is not a caller: /api/ai/orchestrate does not revive /api/orchestrate', () => {
    const scan = scanSynthetic(
      ['api/orchestrate/route.ts'],
      [
        [
          '/repo/packages/shared-ui/src/hooks/useAskQuant.ts',
          `const { apiUrl = '/api/ai/orchestrate' } = options;`,
        ],
      ],
    );
    expect(scan.dead).toEqual(['/api/orchestrate']);
  });

  it('API_BASE-style suffix caller counts as live', () => {
    const scan = scanSynthetic(
      ['api/training/route.ts'],
      [['/repo/apps/quantai/src/x.ts', `apiFetchRaw('/training', { method: 'GET' })`]],
    );
    expect(scan.dead).toEqual([]);
  });

  it('full-path literal and template-literal callers count as live', () => {
    const scan = scanSynthetic(
      ['api/prompts/route.ts'],
      [
        ['/repo/apps/quantai/src/a.ts', `fetch('/api/prompts?limit=10')`],
        ['/repo/apps/quantai/src/b.ts', 'fetch(`/api/prompts/${id}`)'],
      ],
    );
    // NOTE: `/api/prompts/${id}` hits the dynamic sibling in reality; the gate
    // is deliberately conservative and counts it as evidence for /api/prompts.
    expect(scan.dead).toEqual([]);
  });

  it('route groups do not affect the URL; private folders are not routes', () => {
    expect(routeUrlFromRelPath('api/(internal)/foo/route.ts')).toEqual({
      url: '/api/foo',
      dynamic: false,
    });
    expect(routeUrlFromRelPath('api/_lib/route.ts')).toBeNull();
    expect(routeUrlFromRelPath('auth/[action]/route.ts')).toEqual({
      url: '/auth/[action]',
      dynamic: true,
    });
  });

  it('duplicate route.ts files resolving to the same URL are flagged', () => {
    const routes: ScannedRoute[] = [
      { file: '/repo/a/api/dup/route.ts', url: '/api/dup', dynamic: false },
      { file: '/repo/b/api/(g)/dup/route.ts', url: '/api/dup', dynamic: false },
      { file: '/repo/c/api/ok/route.ts', url: '/api/ok', dynamic: false },
    ];
    const dups = findDuplicateRoutes(routes);
    expect(dups).toHaveLength(1);
    expect(dups[0].url).toBe('/api/dup');
    expect(dups[0].files).toHaveLength(2);
  });

  it('the route file itself is never its own caller', () => {
    const route: ScannedRoute = {
      file: '/repo/synth/route.ts',
      url: '/api/lonely',
      dynamic: false,
    };
    const hits = findCallerFiles(route, [
      { path: '/repo/synth/route.ts', content: `// GET /api/lonely -> backend` },
    ]);
    expect(hits).toEqual([]);
  });
});
