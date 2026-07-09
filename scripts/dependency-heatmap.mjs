#!/usr/bin/env node
/**
 * Dependency Heatmap generator — reproduces docs/DEPENDENCY_HEATMAP.md tables.
 * (Promised in that document's §8.)
 *
 * Two measured signals per package in packages/:
 *   D = declared dependents (workspace package.jsons listing it)
 *   I = import reach (source files importing it, excluding the package itself)
 *
 * Scores: CRITICAL (D>=8 or I>=50) | HIGH (D>=3 or I>=10) | MEDIUM (D=2 or I 4-9)
 *         LOW (D=1 or I 1-3) | DEAD (D=0 and I=0)
 *
 * Usage: node scripts/dependency-heatmap.mjs [--json]
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['apps', 'packages', 'services'];

function workspaceManifests() {
  const found = [];
  const visit = (dir, depth) => {
    const pj = join(dir, 'package.json');
    if (existsSync(pj)) {
      try { found.push({ dir, pkg: JSON.parse(readFileSync(pj, 'utf8')) }); } catch { /* skip broken */ }
    }
    if (depth <= 0) return;
    for (const sub of ['backend', 'frontend', 'web', 'server']) {
      const d = join(dir, sub);
      if (existsSync(join(d, 'package.json'))) visit(d, depth - 1);
    }
  };
  for (const r of ROOTS) {
    const base = join(root, r);
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base)) visit(join(base, d), 1);
  }
  return found;
}

const packages = readdirSync(join(root, 'packages'))
  .map((dir) => {
    try {
      return { dir, name: JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')).name };
    } catch { return null; }
  })
  .filter(Boolean);

const manifests = workspaceManifests();
const results = packages.map(({ dir, name }) => {
  const dependents = new Set();
  for (const { pkg } of manifests) {
    if (pkg.name === name) continue;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    if (deps && deps[name]) dependents.add(pkg.name ?? 'unknown');
  }
  let importFiles = 0;
  try {
    const out = execSync(
      `grep -rlE "from [\\"']${name}[\\"'/]" apps packages services --include=*.ts --include=*.tsx --include=*.js 2>/dev/null || true`,
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    importFiles = out.split('\n').filter((f) => f && !f.startsWith(`packages/${dir}/`)).length;
  } catch { /* grep unavailable → I stays 0 */ }

  const D = dependents.size;
  const I = importFiles;
  const score =
    D >= 8 || I >= 50 ? 'CRITICAL'
    : D >= 3 || I >= 10 ? 'HIGH'
    : D === 2 || (I >= 4 && I <= 9) ? 'MEDIUM'
    : D === 1 || (I >= 1 && I <= 3) ? 'LOW'
    : 'DEAD';
  return { name, D, I, score };
});

const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, DEAD: 4 };
results.sort((a, b) => order[a.score] - order[b.score] || b.D - a.D || b.I - a.I);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const counts = {};
  for (const r of results) counts[r.score] = (counts[r.score] ?? 0) + 1;
  console.log('| Package | D (dependents) | I (import files) | Score |');
  console.log('|---------|----------------|------------------|-------|');
  for (const r of results) console.log(`| ${r.name} | ${r.D} | ${r.I} | ${r.score} |`);
  console.log('\nSummary:', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' · '), `(total ${results.length})`);
  const flagged = results.filter((r) => r.D > 0 && r.I === 0);
  if (flagged.length) {
    console.log('\nDeclared-but-never-imported (tech-debt signals):');
    for (const r of flagged) console.log(`  - ${r.name} (D=${r.D}, I=0)`);
  }
}
