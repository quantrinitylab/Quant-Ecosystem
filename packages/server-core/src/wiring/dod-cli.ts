/**
 * DoD evaluator CLI — runs the DoD-1 import-graph check across the checked-in
 * engine inventory and prints a report (Task 2.2; Requirements 5.1, 5.5).
 *
 * Usage (from packages/server-core):
 *   pnpm dod:check            # human-readable report, exit 0 (baseline reporting)
 *   pnpm dod:check --json     # machine-readable JSON report
 *   pnpm dod:check --strict   # exit 1 if ANY non-deferred engine still lacks an importer
 *   pnpm dod:check <repoRoot> # evaluate against an explicit repo root
 *
 * Exit codes:
 *   0  report produced; no hard violations (default mode), or strict mode with no misses
 *   1  a `status: 'done'` engine fails DoD-1 (always a hard error), OR
 *      `--strict` and at least one non-deferred engine is still missing an importer
 *
 * This file is the only side-effecting module in the wiring sub-system (it reads
 * the filesystem, prints, and sets the exit code), so it is intentionally NOT
 * re-exported from `wiring/index.ts`. All of its logic lives in pure, unit-tested
 * helpers in `dod-evaluator.ts`.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_INVENTORY } from './inventory';
import { evaluateInventoryDoD1, summarizeDoD1, formatDoD1Report } from './dod-evaluator';

/** Resolve the monorepo root from this file's location (…/packages/server-core/src/wiring). */
export function defaultRepoRoot(): string {
  return path.resolve(fileURLToPath(import.meta.url), '../../../../..');
}

interface CliOptions {
  json: boolean;
  strict: boolean;
  repoRoot: string;
}

export function parseArgs(argv: readonly string[], cwdRoot: string): CliOptions {
  let json = false;
  let strict = false;
  let repoRoot = cwdRoot;
  for (const arg of argv) {
    if (arg === '--json') json = true;
    else if (arg === '--strict') strict = true;
    else if (!arg.startsWith('-')) repoRoot = path.resolve(arg);
  }
  return { json, strict, repoRoot };
}

/** Pure exit-code policy so it can be unit-tested without spawning a process. */
export function computeExitCode(
  report: { missing: { length: number }; doneButUnimported: { length: number } },
  strict: boolean,
): number {
  if (report.doneButUnimported.length > 0) return 1; // hard violation regardless of mode
  if (strict && report.missing.length > 0) return 1;
  return 0;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2), defaultRepoRoot());
  const evidence = evaluateInventoryDoD1(opts.repoRoot, ENGINE_INVENTORY);
  const report = summarizeDoD1(ENGINE_INVENTORY, evidence);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatDoD1Report(report)}\n`);
  }

  const code = computeExitCode(report, opts.strict);
  if (code !== 0) {
    process.stderr.write(
      report.doneButUnimported.length > 0
        ? `\nDoD-1 FAILED: ${report.doneButUnimported.length} engine(s) marked done without an importer.\n`
        : `\nDoD-1 (strict) FAILED: ${report.missing.length} non-deferred engine(s) not yet wired.\n`,
    );
  }
  process.exitCode = code;
}

// Run only when invoked directly (not when imported by a test).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
