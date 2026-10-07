/**
 * DoD evaluator CLI (Task 2.2) — reports DoD-1 (importer exists) across the
 * engine wiring inventory by scanning the real import graph under
 * `apps/**` and `packages/server-core/**`.
 *
 * Usage:
 *   pnpm wiring:dod            # report mode (always exits 0)
 *   pnpm wiring:dod --strict   # exit non-zero if any non-deferred engine fails DoD-1
 *
 * This is a reporting tool: early in the wiring effort most engines legitimately
 * fail DoD-1 (they are not wired yet), so report mode never fails the process.
 */
import * as path from 'node:path';
import {
  ENGINE_INVENTORY,
  evaluateInventoryDoD1,
  validateInventory,
} from '../packages/server-core/src/wiring/index';

const ROOT = path.resolve(import.meta.dirname, '..');
const strict = process.argv.includes('--strict');

function main(): void {
  process.stdout.write('\n=== Engine Wiring — DoD-1 (importer exists) Report ===\n\n');

  // First, surface any structural problems with the checked-in inventory itself.
  const modelViolations = validateInventory(ENGINE_INVENTORY);
  if (modelViolations.length > 0) {
    process.stderr.write('Inventory model violations:\n');
    for (const v of modelViolations) process.stderr.write(`  - ${v}\n`);
    process.stderr.write('\n');
  }

  const results = evaluateInventoryDoD1(ROOT);
  const passed = results.filter((r) => r.importerExists);
  const failed = results.filter((r) => !r.importerExists);

  for (const r of results) {
    const mark = r.importerExists ? '[DONE]' : '[----]';
    const detail = r.importerExists
      ? `${r.importers.length} importer(s), consumer: ${r.consumerPackages.join(', ')}`
      : 'no non-test importer + dependency entry yet';
    process.stdout.write(`${mark} ${r.engine}: ${detail}\n`);
  }

  const deferred = ENGINE_INVENTORY.filter((w) => w.lane === 'deferred');
  process.stdout.write('\n--- Summary ---\n');
  process.stdout.write(`Engines evaluated (non-deferred): ${results.length}\n`);
  process.stdout.write(`DoD-1 satisfied:                  ${passed.length}\n`);
  process.stdout.write(`DoD-1 pending:                    ${failed.length}\n`);
  process.stdout.write(`Deferred (not evaluated):         ${deferred.length}\n`);

  if (strict && (failed.length > 0 || modelViolations.length > 0)) {
    process.stderr.write('\nERROR: --strict set and one or more engines fail DoD-1.\n');
    process.exit(1);
  }
  process.exit(0);
}

main();
