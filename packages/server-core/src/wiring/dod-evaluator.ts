/**
 * DoD evaluator — DoD-1 import-graph check (Requirements 5.1, 5.5).
 *
 * DoD-1 ("Importer exists") holds for an engine when BOTH:
 *   1. a non-test module under `apps/**` or `packages/server-core/**` statically
 *      imports the engine's package specifier, AND
 *   2. the engine appears in the consumer's `package.json` `dependencies`.
 *
 * This module is pure with respect to module load (no side effects on import) and
 * only touches the filesystem when its functions are called, so it is safe to
 * import from both a CLI script and a unit test. It is intentionally NOT exported
 * from the server-core runtime barrel (`src/index.ts`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ENGINE_INVENTORY } from './inventory';
import type { EngineWiring } from './types';

/**
 * Directories that DoD-1 scans for importers (relative to the repo root).
 *
 * Cross-cutting consumers live in three places:
 *   - `apps/**`                     — every app's backend/frontend code.
 *   - `packages/server-core/**`     — the cross-cutting *backend* plugins
 *                                     (notifications, observability, identity, …).
 *   - `packages/shared-ui/**`       — the cross-cutting *frontend* surfaces.
 *                                     Task 8 wired the six frontend surfaces
 *                                     (onboarding, command-palette,
 *                                     contextual-sidekick, universal-timeline,
 *                                     wellbeing, bharat-ai) into `@quant/shared-ui`
 *                                     via the shared `EcosystemShell` layout
 *                                     wrapper, which every app consumes — so
 *                                     `shared-ui` is a legitimate non-test
 *                                     importer for DoD-1.
 */
export const DOD1_SCAN_ROOTS = [
  'apps',
  path.join('packages', 'server-core'),
  path.join('packages', 'shared-ui'),
];

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mts|cts)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.turbo', 'coverage', '.git']);

/** A test/mocks module never counts toward DoD-1 (must be a real, non-test importer). */
export function isTestModule(file: string): boolean {
  return (
    /\.(test|spec)\.(ts|tsx|js|jsx|mts|cts)$/.test(file) ||
    file.includes(`${path.sep}__tests__${path.sep}`) ||
    file.includes(`${path.sep}__mocks__${path.sep}`)
  );
}

function walkSourceFiles(dir: string, acc: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkSourceFiles(full, acc);
    } else if (SOURCE_EXT.test(entry.name) && !isTestModule(full)) {
      acc.push(full);
    }
  }
}

/** True if `content` statically imports `specifier` (or one of its subpaths). */
export function moduleImportsSpecifier(content: string, specifier: string): boolean {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Matches: `from '<spec>'`, `import '<spec>'`, `require('<spec>')`,
  // and dynamic `import('<spec>')`, optionally with a `/subpath`.
  const re = new RegExp(
    `(?:\\bfrom\\s*|\\bimport\\s*|\\brequire\\s*\\(\\s*|\\bimport\\s*\\(\\s*)['"]${escaped}(?:/[^'"]*)?['"]`,
  );
  return re.test(content);
}

/**
 * Non-test source files under the scan roots that import `specifier`.
 * `roots` defaults to {@link DOD1_SCAN_ROOTS}; callers (e.g. tests) may narrow it.
 */
export function findImporters(
  specifier: string,
  repoRoot: string,
  roots: readonly string[] = DOD1_SCAN_ROOTS,
): string[] {
  const found: string[] = [];
  for (const root of roots) {
    const files: string[] = [];
    walkSourceFiles(path.join(repoRoot, root), files);
    for (const file of files) {
      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      if (moduleImportsSpecifier(content, specifier)) {
        found.push(path.relative(repoRoot, file));
      }
    }
  }
  return found;
}

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Consumer package dirs (under the scan roots) that list `specifier` in `dependencies`. */
export function findConsumersWithDependency(specifier: string, repoRoot: string): string[] {
  const consumers: string[] = [];
  const candidates: string[] = [];

  // apps/* and the server-core package each have a single package.json.
  const appsDir = path.join(repoRoot, 'apps');
  try {
    for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(path.join(appsDir, entry.name, 'package.json'));
    }
  } catch {
    // no apps dir
  }
  candidates.push(path.join(repoRoot, 'packages', 'server-core', 'package.json'));
  // shared-ui hosts the cross-cutting frontend surfaces (Task 8) and declares
  // each as a `workspace:*` dependency, so it is a valid DoD-1 consumer too.
  candidates.push(path.join(repoRoot, 'packages', 'shared-ui', 'package.json'));

  for (const pkgPath of candidates) {
    const pkg = readJson(pkgPath);
    if (!pkg) continue;
    const deps = (pkg['dependencies'] ?? {}) as Record<string, string>;
    if (Object.prototype.hasOwnProperty.call(deps, specifier)) {
      consumers.push(path.relative(repoRoot, path.dirname(pkgPath)));
    }
  }
  return consumers;
}

export interface ImporterEvidence {
  engine: string;
  /** Non-test files that statically import the engine specifier. */
  importers: string[];
  /** Consumer package dirs that declare the engine in `dependencies`. */
  consumerPackages: string[];
  /** DoD-1: at least one non-test importer AND at least one declaring consumer. */
  importerExists: boolean;
}

/** Evaluate DoD-1 for a single engine specifier. */
export function evaluateImporter(
  specifier: string,
  repoRoot: string,
  roots: readonly string[] = DOD1_SCAN_ROOTS,
): ImporterEvidence {
  const importers = findImporters(specifier, repoRoot, roots);
  const consumerPackages = findConsumersWithDependency(specifier, repoRoot);
  return {
    engine: specifier,
    importers,
    consumerPackages,
    importerExists: importers.length > 0 && consumerPackages.length > 0,
  };
}

/**
 * Evaluate DoD-1 across an inventory (deferred engines are skipped — they are not
 * expected to have importers).
 */
export function evaluateInventoryDoD1(
  repoRoot: string,
  inventory: readonly EngineWiring[] = ENGINE_INVENTORY,
): ImporterEvidence[] {
  return inventory
    .filter((w) => w.lane !== 'deferred')
    .map((w) => evaluateImporter(w.engine, repoRoot));
}

/** A roll-up of DoD-1 evidence across the (non-deferred) inventory. */
export interface DoD1Report {
  /** Every non-deferred engine that was evaluated. */
  evaluated: number;
  /** Engines whose DoD-1 holds (importer + dependency present). */
  satisfied: ImporterEvidence[];
  /** Engines still missing a non-test importer and/or a declared dependency. */
  missing: ImporterEvidence[];
  /**
   * Consistency violations: engines whose inventory `status` is `'done'` yet DoD-1
   * does NOT hold. This is a hard error (a wiring claims done without an importer)
   * regardless of strict mode (Requirement 5.5 / Property P1).
   */
  doneButUnimported: string[];
}

/**
 * Pure summarizer: combine inventory statuses with computed DoD-1 evidence into a
 * {@link DoD1Report}. Does no I/O so it is directly unit-testable; the CLI feeds it
 * the result of {@link evaluateInventoryDoD1}.
 */
export function summarizeDoD1(
  inventory: readonly EngineWiring[],
  evidence: readonly ImporterEvidence[],
): DoD1Report {
  const statusByEngine = new Map(inventory.map((w) => [w.engine, w.status]));
  const satisfied: ImporterEvidence[] = [];
  const missing: ImporterEvidence[] = [];
  const doneButUnimported: string[] = [];

  for (const ev of evidence) {
    if (ev.importerExists) {
      satisfied.push(ev);
    } else {
      missing.push(ev);
      if (statusByEngine.get(ev.engine) === 'done') {
        doneButUnimported.push(ev.engine);
      }
    }
  }

  return { evaluated: evidence.length, satisfied, missing, doneButUnimported };
}

/** Pure, deterministic text rendering of a {@link DoD1Report} for the CLI. */
export function formatDoD1Report(report: DoD1Report): string {
  const lines: string[] = [];
  lines.push('DoD-1 import-graph check (engine has a non-test importer + is in dependencies)');
  lines.push(
    `  evaluated=${report.evaluated}  satisfied=${report.satisfied.length}  missing=${report.missing.length}`,
  );

  if (report.satisfied.length > 0) {
    lines.push('');
    lines.push('SATISFIED:');
    for (const ev of report.satisfied) {
      lines.push(
        `  [OK]   ${ev.engine}  (importers=${ev.importers.length}, consumers=${ev.consumerPackages.join(', ')})`,
      );
    }
  }

  if (report.missing.length > 0) {
    lines.push('');
    lines.push('MISSING (not yet wired — expected for pending engines):');
    for (const ev of report.missing) {
      const why =
        ev.importers.length === 0 && ev.consumerPackages.length === 0
          ? 'no importer, no dependency'
          : ev.importers.length === 0
            ? 'declared dependency but no importer'
            : 'imported but not in dependencies';
      lines.push(`  [MISS] ${ev.engine}  (${why})`);
    }
  }

  if (report.doneButUnimported.length > 0) {
    lines.push('');
    lines.push('VIOLATIONS (status=done but DoD-1 fails — Property P1):');
    for (const engine of report.doneButUnimported) {
      lines.push(`  [FAIL] ${engine}`);
    }
  }

  return lines.join('\n');
}
