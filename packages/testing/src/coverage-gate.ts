import type { CoverageGateConfig, CoverageGateResult, PackageCoverageResult } from './types';

/**
 * Coverage JSON format from vitest coverage-final.json.
 * Each key is a file path, and the value contains statement/function/branch maps.
 */
interface CoverageJsonEntry {
  path: string;
  s: Record<string, number>;
  f: Record<string, number>;
  b: Record<string, number[]>;
  statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
  fnMap: Record<string, { name: string; loc: { start: { line: number }; end: { line: number } } }>;
  branchMap: Record<string, { loc: { start: { line: number }; end: { line: number } } }>;
}

type CoverageJson = Record<string, CoverageJsonEntry>;

const DEFAULT_CRITICAL_PACKAGES = ['auth', 'payments', 'security'];

export class CoverageGate {
  private readonly config: CoverageGateConfig;

  constructor(config: Partial<CoverageGateConfig> = {}) {
    this.config = {
      threshold: config.threshold ?? 80,
      criticalPackages: config.criticalPackages ?? DEFAULT_CRITICAL_PACKAGES,
      coverageDir: config.coverageDir ?? 'coverage',
    };
  }

  parseCoverageJson(coverageData: CoverageJson): Map<string, number> {
    const packageCoverage = new Map<string, { covered: number; total: number }>();

    for (const [filePath, fileData] of Object.entries(coverageData)) {
      const packageName = this.extractPackageName(filePath);
      if (!packageName) continue;

      const existing = packageCoverage.get(packageName) ?? { covered: 0, total: 0 };
      const statements = Object.values(fileData.s);
      const total = statements.length;
      const covered = statements.filter((count) => count > 0).length;

      existing.total += total;
      existing.covered += covered;
      packageCoverage.set(packageName, existing);
    }

    const result = new Map<string, number>();
    for (const [pkg, data] of packageCoverage) {
      const percentage = data.total > 0 ? (data.covered / data.total) * 100 : 0;
      result.set(pkg, percentage);
    }

    return result;
  }

  checkPackageCoverage(packageName: string, coverageData: CoverageJson): PackageCoverageResult {
    const coverageMap = this.parseCoverageJson(coverageData);
    const lineCoverage = coverageMap.get(packageName) ?? 0;

    return {
      packageName,
      lineCoverage,
      threshold: this.config.threshold,
      pass: lineCoverage >= this.config.threshold,
    };
  }

  run(coverageData: CoverageJson): CoverageGateResult {
    const results: PackageCoverageResult[] = [];
    const coverageMap = this.parseCoverageJson(coverageData);

    for (const packageName of this.config.criticalPackages) {
      const lineCoverage = coverageMap.get(packageName) ?? 0;
      results.push({
        packageName,
        lineCoverage,
        threshold: this.config.threshold,
        pass: lineCoverage >= this.config.threshold,
      });
    }

    const allPass = results.every((r) => r.pass);
    const failedPackages = results.filter((r) => !r.pass);

    const summary = allPass
      ? `All ${results.length} critical packages meet the ${this.config.threshold}% coverage threshold.`
      : `${failedPackages.length} of ${results.length} critical packages below ${this.config.threshold}% threshold: ${failedPackages.map((r) => `${r.packageName} (${r.lineCoverage.toFixed(1)}%)`).join(', ')}`;

    return { pass: allPass, results, summary };
  }

  private extractPackageName(filePath: string): string | null {
    const match = filePath.match(/packages\/([^/]+)\//);
    return match?.[1] ?? null;
  }
}

export function runCoverageGate(
  coverageData: CoverageJson,
  config?: Partial<CoverageGateConfig>,
): CoverageGateResult {
  const gate = new CoverageGate(config);
  return gate.run(coverageData);
}
