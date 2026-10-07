/**
 * Inline-fetch guard (Task 3) — pure, importable scanning logic.
 *
 * Enforces Requirement 1.4 / design Layer 5 ("api-client only"): UI surfaces
 * under `apps/<app>/src/**` must consume engine-backed endpoints through the
 * typed `@quant/api-client` hooks (`useApiQuery` / `useApiMutation`), NOT via an
 * inline `fetch(...)` to a backend.
 *
 * Next.js proxy route handlers under `app/api/**` are the ONE place that is
 * allowed to `fetch` a backend URL (they ARE the proxy), so they are exempt.
 * Test files are exempt too.
 *
 * Because the monorepo was "assembled from individually-plausible parts that were
 * never connected", there is a large pre-existing population of inline fetches in
 * UI surfaces. Rather than fail hard on day one, the guard uses a checked-in
 * BASELINE (a ratchet): it passes as long as no NEW inline fetch is introduced
 * (and existing ones are not multiplied), and it fails on regressions. The
 * baseline is the documented record of known violations to be burned down by the
 * per-app wiring stages.
 *
 * This module has no side effects and no external dependencies so it can be unit
 * tested directly; the CLI (`check-inline-fetch.ts`) wraps it.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** A single detected inline-fetch occurrence. */
export interface FetchHit {
  /** Repo-relative POSIX path of the offending file. */
  file: string;
  /** 1-based line numbers where an inline `fetch(` appears. */
  lines: number[];
}

/** Baseline shape: repo-relative file path -> known inline-fetch count. */
export type Baseline = Record<string, number>;

/** Result of comparing a fresh scan against the baseline. */
export interface GuardComparison {
  /** Files with inline fetch that are absent from the baseline entirely. */
  newViolations: FetchHit[];
  /** Files whose count grew beyond the baseline value. */
  increased: { file: string; was: number; now: number }[];
  /** Baseline files that now have fewer/zero inline fetches (good — burndown). */
  resolved: { file: string; was: number; now: number }[];
  /** True when no new or increased violations exist. */
  ok: boolean;
}

/**
 * Matches an inline `fetch(` call while deliberately NOT matching:
 *   - `refetch(` / `prefetch(` (react-query helpers) — guarded by `(?<![\w.])`
 *   - `something.fetch(` (method access) — also guarded by the `.` in the class
 * Allows whitespace between `fetch` and `(`.
 */
const INLINE_FETCH = /(?<![\w.])fetch\s*\(/g;

/** Directories never worth scanning. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.turbo', 'coverage']);

/**
 * Whether a repo-relative path is an ALLOWED location for an inline backend
 * fetch (Next proxy route handlers) or is otherwise exempt (tests, decls).
 */
export function isExempt(relPath: string): boolean {
  const p = relPath.replace(/\\/g, '/');
  // Next.js App Router proxy route handlers legitimately fetch the backend.
  if (/\/app\/api\//.test(p)) return true;
  // Pages Router API routes (apps/*/src/pages/api/**) are also proxies.
  if (/\/pages\/api\//.test(p)) return true;
  // Tests and type declarations are not shipped UI surfaces.
  if (/\.(test|spec)\.[cm]?tsx?$/.test(p)) return true;
  if (/\/__tests__\//.test(p)) return true;
  if (/\.d\.ts$/.test(p)) return true;
  return false;
}

/** Count inline `fetch(` occurrences in source text, returning their line numbers. */
export function findInlineFetches(content: string): number[] {
  const lines: number[] = [];
  const srcLines = content.split('\n');
  for (let i = 0; i < srcLines.length; i++) {
    const line = srcLines[i]!;
    INLINE_FETCH.lastIndex = 0;
    if (INLINE_FETCH.test(line)) lines.push(i + 1);
  }
  return lines;
}

/** Recursively collect `.ts`/`.tsx` files under a directory. */
function walk(dir: string, acc: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), acc);
    } else if (/\.[cm]?tsx?$/.test(entry.name)) {
      acc.push(path.join(dir, entry.name));
    }
  }
}

/**
 * Scan every UI surface under `apps/<app>/src` and return the inline-fetch hits
 * for the non-exempt files. `root` is the monorepo root.
 */
export function scanUiSurfaces(root: string): FetchHit[] {
  const appsDir = path.join(root, 'apps');
  let apps: fs.Dirent[];
  try {
    apps = fs.readdirSync(appsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const hits: FetchHit[] = [];
  for (const app of apps) {
    if (!app.isDirectory()) continue;
    const srcDir = path.join(appsDir, app.name, 'src');
    if (!fs.existsSync(srcDir)) continue;

    const files: string[] = [];
    walk(srcDir, files);

    for (const abs of files) {
      const rel = path.relative(root, abs).replace(/\\/g, '/');
      if (isExempt(rel)) continue;
      const content = fs.readFileSync(abs, 'utf8');
      const lines = findInlineFetches(content);
      if (lines.length > 0) hits.push({ file: rel, lines });
    }
  }
  hits.sort((a, b) => a.file.localeCompare(b.file));
  return hits;
}

/** Convert scan hits into the compact baseline map (file -> count). */
export function hitsToBaseline(hits: FetchHit[]): Baseline {
  const out: Baseline = {};
  for (const h of hits) out[h.file] = h.lines.length;
  return out;
}

/** Compare a fresh scan against a baseline to find new / increased / resolved. */
export function compareToBaseline(hits: FetchHit[], baseline: Baseline): GuardComparison {
  const current = hitsToBaseline(hits);
  const hitByFile = new Map(hits.map((h) => [h.file, h]));

  const newViolations: FetchHit[] = [];
  const increased: { file: string; was: number; now: number }[] = [];
  const resolved: { file: string; was: number; now: number }[] = [];

  for (const [file, now] of Object.entries(current)) {
    if (!(file in baseline)) {
      newViolations.push(hitByFile.get(file)!);
    } else if (now > baseline[file]!) {
      increased.push({ file, was: baseline[file]!, now });
    }
  }
  for (const [file, was] of Object.entries(baseline)) {
    const now = current[file] ?? 0;
    if (now < was) resolved.push({ file, was, now });
  }

  return {
    newViolations,
    increased,
    resolved,
    ok: newViolations.length === 0 && increased.length === 0,
  };
}

/** Load a baseline JSON file; returns `{}` if it does not exist. */
export function loadBaseline(baselinePath: string): Baseline {
  if (!fs.existsSync(baselinePath)) return {};
  const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as
    | { violations?: Baseline }
    | Baseline;
  // Support both the documented wrapper format and a bare map.
  if (parsed && typeof parsed === 'object' && 'violations' in parsed && parsed.violations) {
    return parsed.violations;
  }
  return parsed as Baseline;
}
