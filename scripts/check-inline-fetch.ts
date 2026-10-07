/**
 * Inline-fetch guard CLI (Task 3).
 *
 * Enforces "api-client only" in UI surfaces (Requirement 1.4): no inline
 * `fetch(...)` under `apps/<app>/src/**` except in Next proxy route handlers
 * (`app/api/**`, `pages/api/**`) and test files.
 *
 * Usage:
 *   pnpm guard:inline-fetch            # report + ratchet check (fails on NEW violations)
 *   pnpm guard:inline-fetch -- --report  # report only, never fails
 *   pnpm guard:inline-fetch -- --update  # regenerate the documented baseline
 *
 * The baseline (`scripts/inline-fetch-baseline.json`) is a documented record of
 * pre-existing violations. The guard PASSES when current violations are a subset
 * of the baseline and FAILS only when a new or multiplied inline fetch appears,
 * so the existing debt is captured without blocking the build.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  scanUiSurfaces,
  compareToBaseline,
  hitsToBaseline,
  loadBaseline,
} from './inline-fetch-guard';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'inline-fetch-baseline.json');

const argv = process.argv.slice(2);
const reportOnly = argv.includes('--report');
const update = argv.includes('--update');

function writeBaseline(violations: Record<string, number>): void {
  const total = Object.values(violations).reduce((a, b) => a + b, 0);
  const doc = {
    $comment:
      'Documented baseline of pre-existing inline fetch() calls in UI surfaces ' +
      '(apps/<app>/src/**, excluding app/api & pages/api proxies and tests). ' +
      'Enforces Requirement 1.4 "api-client only". The guard fails only on NEW or ' +
      'multiplied violations; entries here are debt to burn down via per-app wiring ' +
      '(replace inline fetch with useApiQuery/useApiMutation). Regenerate with ' +
      '`pnpm guard:inline-fetch -- --update`.',
    generatedBy: 'scripts/check-inline-fetch.ts',
    totalFiles: Object.keys(violations).length,
    totalOccurrences: total,
    violations,
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(doc, null, 2) + '\n');
}

function main(): void {
  process.stdout.write('\n=== Inline-fetch guard (api-client only) ===\n\n');
  const hits = scanUiSurfaces(ROOT);
  const totalOccurrences = hits.reduce((a, h) => a + h.lines.length, 0);

  if (update) {
    writeBaseline(hitsToBaseline(hits));
    process.stdout.write(
      `Baseline updated: ${hits.length} file(s), ${totalOccurrences} occurrence(s) recorded at\n` +
        `  ${path.relative(ROOT, BASELINE_PATH)}\n`,
    );
    process.exit(0);
  }

  const baseline = loadBaseline(BASELINE_PATH);
  const cmp = compareToBaseline(hits, baseline);

  process.stdout.write(
    `UI-surface files with inline fetch: ${hits.length} (${totalOccurrences} occurrence(s))\n`,
  );
  process.stdout.write(`Baseline files: ${Object.keys(baseline).length}\n`);
  process.stdout.write(
    `New violations: ${cmp.newViolations.length} | Increased: ${cmp.increased.length} | Resolved: ${cmp.resolved.length}\n\n`,
  );

  if (cmp.resolved.length > 0) {
    process.stdout.write('Burndown (inline fetch removed since baseline):\n');
    for (const r of cmp.resolved) process.stdout.write(`  + ${r.file}: ${r.was} -> ${r.now}\n`);
    process.stdout.write('\n');
  }

  if (cmp.ok) {
    process.stdout.write('PASS: no new inline fetch introduced in UI surfaces.\n');
    if (cmp.resolved.length > 0) {
      process.stdout.write(
        'Tip: run `pnpm guard:inline-fetch -- --update` to tighten the baseline.\n',
      );
    }
    process.exit(0);
  }

  process.stderr.write('FAIL: inline fetch must go through @quant/api-client.\n\n');
  for (const v of cmp.newViolations) {
    process.stderr.write(`  NEW  ${v.file} (lines ${v.lines.join(', ')})\n`);
  }
  for (const i of cmp.increased) {
    process.stderr.write(`  MORE ${i.file} (${i.was} -> ${i.now})\n`);
  }
  process.stderr.write(
    '\nUse useApiQuery/useApiMutation from @quant/api-client instead of inline fetch,\n' +
      'or place backend fetches in a Next proxy route under app/api/**.\n' +
      'If this is intentional pre-existing code, run `pnpm guard:inline-fetch -- --update`.\n',
  );

  if (reportOnly) process.exit(0);
  process.exit(1);
}

main();
