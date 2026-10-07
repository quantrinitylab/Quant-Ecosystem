#!/usr/bin/env node
/**
 * Dead-package guard (policy from docs/DEPENDENCY_HEATMAP.md §7 / issue #3).
 *
 * Rule: a NEW package must arrive with at least one real importer or declared
 * dependent in the same PR. Packages that were already dead at the time this
 * guard was introduced are grandfathered in scripts/dead-packages-baseline.json
 * and tracked for deletion by issue #3 — the guard only stops NEW dead weight.
 *
 * Exit codes: 0 = clean · 1 = new dead package detected (fail CI).
 *
 * Usage:
 *   node scripts/check-package-importers.mjs             # guard mode
 *   node scripts/check-package-importers.mjs --update    # rewrite baseline
 *                                                        # (requires review!)
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'scripts', 'dead-packages-baseline.json');

const heatmapJson = execSync('node scripts/dependency-heatmap.mjs --json', {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const heatmap = JSON.parse(heatmapJson);
const dead = heatmap
  .filter((p) => p.score === 'DEAD')
  .map((p) => p.name)
  .sort();

if (process.argv.includes('--update')) {
  writeFileSync(baselinePath, JSON.stringify(dead, null, 2) + '\n');
  console.log(`Baseline rewritten with ${dead.length} packages. This change requires review.`);
  process.exit(0);
}

const baseline = new Set(JSON.parse(readFileSync(baselinePath, 'utf8')));
const newDead = dead.filter((name) => !baseline.has(name));
const revived = [...baseline].filter((name) => !dead.includes(name)).sort();

if (revived.length) {
  console.log(`ℹ️  Revived since baseline (good news — update issue #3 and the baseline):`);
  for (const name of revived) console.log(`   + ${name}`);
}

if (newDead.length) {
  console.error(`\n✖ ${newDead.length} NEW package(s) with zero importers and zero dependents:`);
  for (const name of newDead) console.error(`   - ${name}`);
  console.error(
    '\nPolicy (DEPENDENCY_HEATMAP §7): a new package must land with at least one real' +
      '\nimporter in the same PR. Wire it up, or do not create the package yet.',
  );
  process.exit(1);
}

console.log(`✓ No new dead packages (${dead.length} grandfathered, tracked by issue #3).`);
