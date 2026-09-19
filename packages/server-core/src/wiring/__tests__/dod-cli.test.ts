/**
 * Unit tests for the DoD-1 evaluator script's pure logic (Task 2.2): the report
 * summarizer/formatter in `dod-evaluator.ts` and the CLI arg/exit-code helpers in
 * `dod-cli.ts`. The CLI's I/O `main()` is guarded behind a direct-invocation check,
 * so importing here is side-effect free.
 *
 * **Validates: Requirements 5.1, 5.5**
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import {
  summarizeDoD1,
  formatDoD1Report,
  evaluateInventoryDoD1,
  type ImporterEvidence,
} from '../dod-evaluator';
import { ENGINE_INVENTORY } from '../inventory';
import { parseArgs, computeExitCode } from '../dod-cli';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

function evidence(
  engine: string,
  importers: string[],
  consumerPackages: string[],
): ImporterEvidence {
  return {
    engine,
    importers,
    consumerPackages,
    importerExists: importers.length > 0 && consumerPackages.length > 0,
  };
}

describe('summarizeDoD1', () => {
  it('splits evidence into satisfied vs missing', () => {
    const report = summarizeDoD1(
      [
        {
          engine: '@quant/a',
          lane: 'cross-cutting',
          targets: ['server-core'],
          stage: 1,
          dependsOn: [],
          status: 'done',
        },
        {
          engine: '@quant/b',
          lane: 'cross-cutting',
          targets: ['server-core'],
          stage: 1,
          dependsOn: [],
          status: 'pending',
        },
      ],
      [evidence('@quant/a', ['apps/x/y.ts'], ['apps/x']), evidence('@quant/b', [], [])],
    );
    expect(report.evaluated).toBe(2);
    expect(report.satisfied.map((e) => e.engine)).toEqual(['@quant/a']);
    expect(report.missing.map((e) => e.engine)).toEqual(['@quant/b']);
    expect(report.doneButUnimported).toEqual([]);
  });

  it('flags a done engine that lacks an importer as a P1 violation', () => {
    const report = summarizeDoD1(
      [
        {
          engine: '@quant/c',
          lane: 'per-app',
          targets: ['quantai'],
          stage: 2,
          dependsOn: [],
          status: 'done',
        },
      ],
      [evidence('@quant/c', [], [])],
    );
    expect(report.doneButUnimported).toEqual(['@quant/c']);
  });
});

describe('formatDoD1Report', () => {
  it('renders satisfied, missing and violation sections deterministically', () => {
    const report = summarizeDoD1(
      [
        {
          engine: '@quant/ok',
          lane: 'cross-cutting',
          targets: ['server-core'],
          stage: 1,
          dependsOn: [],
          status: 'pending',
        },
        {
          engine: '@quant/bad',
          lane: 'per-app',
          targets: ['quantai'],
          stage: 2,
          dependsOn: [],
          status: 'done',
        },
      ],
      [evidence('@quant/ok', ['apps/x/y.ts'], ['apps/x']), evidence('@quant/bad', [], [])],
    );
    const text = formatDoD1Report(report);
    expect(text).toContain('DoD-1 import-graph check');
    expect(text).toContain('[OK]   @quant/ok');
    expect(text).toContain('[MISS] @quant/bad');
    expect(text).toContain('[FAIL] @quant/bad');
  });
});

describe('computeExitCode', () => {
  it('returns 0 by default when only pending engines are missing', () => {
    expect(
      computeExitCode({ missing: { length: 5 }, doneButUnimported: { length: 0 } }, false),
    ).toBe(0);
  });

  it('returns 1 under --strict when any engine is missing', () => {
    expect(
      computeExitCode({ missing: { length: 1 }, doneButUnimported: { length: 0 } }, true),
    ).toBe(1);
  });

  it('returns 1 for a done-but-unimported violation regardless of mode', () => {
    expect(
      computeExitCode({ missing: { length: 1 }, doneButUnimported: { length: 1 } }, false),
    ).toBe(1);
  });
});

describe('parseArgs', () => {
  it('defaults to non-json, non-strict, cwd root', () => {
    expect(parseArgs([], '/repo')).toEqual({ json: false, strict: false, repoRoot: '/repo' });
  });

  it('parses flags and an explicit repo root', () => {
    const opts = parseArgs(['--json', '--strict', '/some/root'], '/repo');
    expect(opts.json).toBe(true);
    expect(opts.strict).toBe(true);
    expect(opts.repoRoot).toBe(path.resolve('/some/root'));
  });
});

describe('end-to-end against the real tree (baseline)', () => {
  it('produces a report over the non-deferred inventory with no P1 violations', () => {
    const ev = evaluateInventoryDoD1(REPO_ROOT, ENGINE_INVENTORY);
    const report = summarizeDoD1(ENGINE_INVENTORY, ev);
    // At Stage 0, engines are pending/unwired — but no engine should claim done
    // while failing DoD-1.
    expect(report.doneButUnimported).toEqual([]);
    expect(report.evaluated).toBe(ev.length);
    expect(report.satisfied.length + report.missing.length).toBe(report.evaluated);
    // The end-to-end scan walks the entire monorepo (all packages/apps) to build
    // the import graph for ~70 engines, which can exceed vitest's 5s default on a
    // full install. Give it explicit headroom; the assertions above pass cleanly.
    //
    // The budget is deliberately large rather than merely "generous". This single walk
    // covers ~5,100 source files, and its wall time is dominated by filesystem latency, not
    // by the assertions: measured at ~6s on a warm cache but 230s+ on a cold one or while
    // the rest of the monorepo's suites are competing for I/O under
    // `turbo test --concurrency=4`. At 30s it flipped between passing and timing out purely
    // on machine load, which made the repo's own wiring gate untrustworthy. Nothing here is
    // relaxed — the DoD assertions above are unchanged; only the clock is.
    //
    // The real fix is to make the scan cheaper (one indexed pass over the tree instead of a
    // walk per engine); until then this stops a load-sensitive timeout from reading as a
    // Definition-of-Done violation.
  }, 300_000);
});
