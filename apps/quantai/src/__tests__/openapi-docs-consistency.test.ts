/**
 * openapi-docs-consistency.test.ts
 *
 * Guards the F-191 fix: apps/quantai/openapi.yaml must describe the REAL API —
 * the route handlers under src/app/api/.../route.ts — and nothing else.
 *
 * Fails if:
 *  - the servers URL is not the real /api base (e.g. the old aspirational /api/v1),
 *  - a documented path has no matching route.ts (invented endpoint),
 *  - a real route.ts is missing from the spec (undocumented endpoint),
 *  - documented HTTP methods don't match the route's exported handlers,
 *  - aspirational tags (QuantOS, Swarm, ML, Federation, …) reappear,
 *  - `node scripts/gen-openapi.mjs --check` reports drift.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..', '..');
const SPEC_PATH = path.join(APP_ROOT, 'openapi.yaml');
const API_ROOT = path.join(APP_ROOT, 'src', 'app', 'api');
const GENERATOR = path.join(APP_ROOT, 'scripts', 'gen-openapi.mjs');

const METHOD_RE = /^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm;

// Aspirational tags from the pre-F-191 spec that described an API which does
// not exist. None of these may ever return to the QuantAI spec.
const ASPIRATIONAL_TAGS = new Set([
  'quantos',
  'swarm',
  'orchestration',
  'ml',
  'federation',
  'cdn',
  'payments',
  'moderation',
  'ab testing',
  'cache',
  'templates',
  'collaboration',
  'scaling',
  'events',
  'marketplace',
  'recommendations',
  'personal agent',
  'agent logs',
  'agent health',
  'versioning',
]);

function readSpec(): string {
  return fs.readFileSync(SPEC_PATH, 'utf8');
}

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkRouteFiles(full));
    else if (entry.isFile() && entry.name === 'route.ts') out.push(full);
  }
  return out.sort();
}

function routeFileToOpenapiPath(file: string): string {
  const rel = path.relative(API_ROOT, path.dirname(file)).split(path.sep).join('/');
  return `/api/${rel.replace(/\[([^\]]+)\]/g, '{$1}')}`;
}

function exportedMethods(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const methods = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = METHOD_RE.exec(src)) !== null) methods.add(m[1].toLowerCase());
  return [...methods].sort();
}

/** Minimal deterministic parser for the generator's output format. */
function parseSpec(text: string): { paths: Map<string, string[]>; tags: string[]; serversUrl: string } {
  const paths = new Map<string, string[]>();
  const tags: string[] = [];
  let serversUrl = '';
  let currentPath: string | null = null;
  let inTags = false;
  let inServers = false;

  for (const line of text.split('\n')) {
    const pathMatch = /^  (\/api\/[^\s:]*):$/.exec(line);
    if (pathMatch) {
      currentPath = pathMatch[1];
      paths.set(currentPath, []);
      inTags = false;
      inServers = false;
      continue;
    }
    const methodMatch = /^    (get|post|put|patch|delete|head|options):$/.exec(line);
    if (methodMatch && currentPath) {
      paths.get(currentPath)!.push(methodMatch[1]);
      continue;
    }
    if (/^tags:$/.test(line)) {
      inTags = true;
      inServers = false;
      currentPath = null;
      continue;
    }
    if (/^servers:$/.test(line)) {
      inServers = true;
      inTags = false;
      currentPath = null;
      continue;
    }
    if (inTags) {
      const tagMatch = /^  - name: (.+)$/.exec(line);
      if (tagMatch) tags.push(tagMatch[1].trim());
    }
    if (inServers) {
      const urlMatch = /^\s*- url: (\S+)$/.exec(line);
      if (urlMatch) serversUrl = urlMatch[1].trim();
    }
    if (/^[a-z]/.test(line) && !/^(tags|servers|paths|info|openapi|x-)/.test(line)) {
      inTags = false;
      inServers = false;
      currentPath = null;
    }
  }
  return { paths, tags, serversUrl };
}

describe('openapi.yaml documents the real QuantAI API (F-191)', () => {
  it('exists and points servers at the real /api base path (never /api/v1)', () => {
    expect(fs.existsSync(SPEC_PATH)).toBe(true);
    const { serversUrl } = parseSpec(readSpec());
    expect(serversUrl).toBe('/api');
    expect(readSpec()).not.toContain('/api/v1');
  });

  it('every documented path maps to a real route.ts file', () => {
    const { paths } = parseSpec(readSpec());
    expect(paths.size).toBeGreaterThan(0);
    const orphans: string[] = [];
    for (const docPath of paths.keys()) {
      const fsPath = path.join(
        API_ROOT,
        docPath.replace(/^\/api\//, '').replace(/\{([^}]+)\}/g, '[$1]'),
        'route.ts',
      );
      if (!fs.existsSync(fsPath)) orphans.push(docPath);
    }
    expect(orphans).toEqual([]);
  });

  it('every real route handler is documented', () => {
    const { paths } = parseSpec(readSpec());
    const undocumented: string[] = [];
    for (const file of walkRouteFiles(API_ROOT)) {
      if (exportedMethods(file).length === 0) continue; // not an HTTP endpoint
      if (!paths.has(routeFileToOpenapiPath(file))) {
        undocumented.push(path.relative(APP_ROOT, file));
      }
    }
    expect(undocumented).toEqual([]);
  });

  it('documented methods exactly match each route\'s exported handlers', () => {
    const { paths } = parseSpec(readSpec());
    const mismatches: string[] = [];
    for (const file of walkRouteFiles(API_ROOT)) {
      const expected = exportedMethods(file);
      if (expected.length === 0) continue;
      const openapiPath = routeFileToOpenapiPath(file);
      const documented = (paths.get(openapiPath) ?? []).slice().sort();
      if (JSON.stringify(documented) !== JSON.stringify(expected)) {
        mismatches.push(
          `${openapiPath}: documented=[${documented.join(',')}] handlers=[${expected.join(',')}]`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('contains no aspirational tags from the pre-fix spec', () => {
    const { tags } = parseSpec(readSpec());
    const bad = tags.filter((t) => ASPIRATIONAL_TAGS.has(t.toLowerCase()));
    expect(bad).toEqual([]);
  });

  it('generator --check passes: spec is in sync with the route tree', () => {
    expect(fs.existsSync(GENERATOR)).toBe(true);
    expect(() =>
      execFileSync(process.execPath, [GENERATOR, '--check'], {
        cwd: APP_ROOT,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
