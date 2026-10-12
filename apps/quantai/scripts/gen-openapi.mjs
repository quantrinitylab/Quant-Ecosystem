// scripts/gen-openapi.mjs
//
// Regenerates apps/quantai/openapi.yaml from the ACTUAL route handlers.
//
// Root-cause fix for F-191: the old openapi.yaml described an aspirational API
// (servers: /api/v1, ~93 invented paths/tags like QuantOS, ML, Swarm, CDN,
// Payments) that does not exist in apps/quantai. This script derives every
// path and HTTP method from apps/quantai/src/app/api/**/route.ts, so the spec
// can never drift from reality again.
//
// Usage:
//   node scripts/gen-openapi.mjs          # regenerate apps/quantai/openapi.yaml
//   node scripts/gen-openapi.mjs --check  # exit 1 if the spec is stale (CI drift gate)
//
// The spec intentionally documents paths + methods only. Request/response
// schemas and auth requirements are NOT specified here — read them from the
// route handlers. Nothing is invented.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const API_ROOT = path.join(APP_ROOT, 'src', 'app', 'api');
const SPEC_PATH = path.join(APP_ROOT, 'openapi.yaml');

const METHOD_RE = /^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm;

function walkRouteFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkRouteFiles(full));
    else if (entry.isFile() && entry.name === 'route.ts') out.push(full);
  }
  return out.sort();
}

function routeFileToPath(file) {
  const rel = path.relative(API_ROOT, path.dirname(file)).split(path.sep).join('/');
  const openapi = rel.replace(/\[([^\]]+)\]/g, '{$1}');
  return `/api/${openapi}`;
}

function exportedMethods(file) {
  const src = fs.readFileSync(file, 'utf8');
  const methods = new Set();
  let m;
  while ((m = METHOD_RE.exec(src)) !== null) methods.add(m[1]);
  return [...methods].sort();
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function generate() {
  const routes = [];
  for (const file of walkRouteFiles(API_ROOT)) {
    const openapiPath = routeFileToPath(file);
    const methods = exportedMethods(file);
    if (methods.length === 0) continue; // route.ts with no exported handlers: not an API endpoint
    const relFile = path.relative(APP_ROOT, file).split(path.sep).join('/');
    const tag = capitalize(openapiPath.split('/')[2] || 'misc');
    routes.push({ openapiPath, methods, relFile, tag });
  }

  const tags = [...new Set(routes.map((r) => r.tag))].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );

  const lines = [];
  lines.push('openapi: 3.0.3');
  lines.push('info:');
  lines.push('  title: QuantAI API');
  lines.push('  description: >-');
  lines.push('    The real QuantAI HTTP API. This spec is GENERATED from the route');
  lines.push('    handlers under apps/quantai/src/app/api/**/route.ts — do not edit by');
  lines.push('    hand, run `node scripts/gen-openapi.mjs` to regenerate. It documents');
  lines.push('    paths and HTTP methods only; request/response schemas and auth');
  lines.push('    requirements are intentionally not specified and must be read from the');
  lines.push('    route handlers. Nothing in this spec is aspirational.');
  lines.push('  version: 1.0.0');
  lines.push('  contact:');
  lines.push('    name: Quant Ecosystem');
  lines.push('x-generated-by: scripts/gen-openapi.mjs');
  lines.push('servers:');
  lines.push('  - url: /api');
  lines.push('    description: QuantAI API server (Next.js App Router route handlers)');
  lines.push('');
  lines.push('tags:');
  for (const tag of tags) {
    lines.push(`  - name: ${tag}`);
    lines.push(`    description: ${tag} endpoints`);
  }
  lines.push('');
  lines.push('paths:');
  for (const r of routes) {
    lines.push(`  ${r.openapiPath}:`);
    for (const method of r.methods) {
      const lower = method.toLowerCase();
      lines.push(`    ${lower}:`);
      lines.push(`      summary: ${method} ${r.openapiPath}`);
      lines.push(`      description: >-`);
      lines.push(`        Implemented in ${r.relFile}.`);
      lines.push(`        Exported handlers: ${r.methods.join(', ')}.`);
      lines.push(`      tags:`);
      lines.push(`        - ${r.tag}`);
      lines.push(`      responses:`);
      lines.push(`        '200':`);
      lines.push(`          description: >-`);
      lines.push(`            Successful response. The response shape is route-specific`);
      lines.push(`            and deliberately not typed in this spec.`);
    }
  }
  lines.push('');
  return { text: lines.join('\n'), routes };
}

const check = process.argv.includes('--check');
const { text, routes } = generate();

if (check) {
  const existing = fs.existsSync(SPEC_PATH) ? fs.readFileSync(SPEC_PATH, 'utf8') : '';
  if (existing === text) {
    console.log(`openapi.yaml is in sync (${routes.length} routes).`);
    process.exit(0);
  }
  // Summarize drift for the operator.
  const docPaths = new Set(
    [...existing.matchAll(/^  (\/api\/[^\s:]*):/gm)].map((m) => m[1]),
  );
  const realPaths = new Set(routes.map((r) => r.openapiPath));
  const missing = [...realPaths].filter((p) => !docPaths.has(p));
  const extra = [...docPaths].filter((p) => !realPaths.has(p));
  console.error('DRIFT: openapi.yaml does not match apps/quantai/src/app/api/**/route.ts');
  if (missing.length) console.error(`  documented-but-missing routes: ${missing.join(', ')}`);
  if (extra.length) console.error(`  documented-but-nonexistent paths: ${extra.join(', ')}`);
  console.error('Run `node scripts/gen-openapi.mjs` to regenerate.');
  process.exit(1);
}

fs.writeFileSync(SPEC_PATH, text);
console.log(`Wrote ${SPEC_PATH} (${routes.length} routes, ${text.split('\n').length} lines).`);
