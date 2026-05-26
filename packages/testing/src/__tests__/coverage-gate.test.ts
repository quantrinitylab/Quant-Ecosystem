import { describe, it, expect } from 'vitest';
import { CoverageGate, runCoverageGate } from '../coverage-gate';

function createMockCoverageData(packages: Record<string, { covered: number; total: number }>) {
  const data: Record<
    string,
    {
      path: string;
      s: Record<string, number>;
      f: Record<string, number>;
      b: Record<string, number[]>;
      statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
      fnMap: Record<
        string,
        { name: string; loc: { start: { line: number }; end: { line: number } } }
      >;
      branchMap: Record<string, { loc: { start: { line: number }; end: { line: number } } }>;
    }
  > = {};

  for (const [pkg, coverage] of Object.entries(packages)) {
    const filePath = `packages/${pkg}/src/index.ts`;
    const statements: Record<string, number> = {};
    const statementMap: Record<string, { start: { line: number }; end: { line: number } }> = {};

    for (let i = 0; i < coverage.total; i++) {
      statements[String(i)] = i < coverage.covered ? 1 : 0;
      statementMap[String(i)] = { start: { line: i + 1 }, end: { line: i + 1 } };
    }

    data[filePath] = {
      path: filePath,
      s: statements,
      f: {},
      b: {},
      statementMap,
      fnMap: {},
      branchMap: {},
    };
  }

  return data;
}

describe('CoverageGate', () => {
  it('should return pass:false when auth package is below 80% threshold', () => {
    const coverageData = createMockCoverageData({
      auth: { covered: 70, total: 100 },
      payments: { covered: 85, total: 100 },
      security: { covered: 90, total: 100 },
    });

    const gate = new CoverageGate();
    const result = gate.run(coverageData);

    expect(result.pass).toBe(false);

    const authResult = result.results.find((r) => r.packageName === 'auth');
    expect(authResult).toBeDefined();
    expect(authResult!.pass).toBe(false);
    expect(authResult!.lineCoverage).toBe(70);
  });

  it('should return pass:true when all critical packages meet 80% threshold', () => {
    const coverageData = createMockCoverageData({
      auth: { covered: 85, total: 100 },
      payments: { covered: 80, total: 100 },
      security: { covered: 92, total: 100 },
    });

    const gate = new CoverageGate();
    const result = gate.run(coverageData);

    expect(result.pass).toBe(true);
    expect(result.results.every((r) => r.pass)).toBe(true);
  });

  it('should include per-package breakdown with names, percentages, and pass/fail', () => {
    const coverageData = createMockCoverageData({
      auth: { covered: 75, total: 100 },
      payments: { covered: 90, total: 100 },
      security: { covered: 60, total: 100 },
    });

    const gate = new CoverageGate();
    const result = gate.run(coverageData);

    expect(result.results).toHaveLength(3);

    for (const pkgResult of result.results) {
      expect(pkgResult).toHaveProperty('packageName');
      expect(pkgResult).toHaveProperty('lineCoverage');
      expect(pkgResult).toHaveProperty('threshold');
      expect(pkgResult).toHaveProperty('pass');
      expect(typeof pkgResult.packageName).toBe('string');
      expect(typeof pkgResult.lineCoverage).toBe('number');
      expect(typeof pkgResult.threshold).toBe('number');
      expect(typeof pkgResult.pass).toBe('boolean');
    }

    const authResult = result.results.find((r) => r.packageName === 'auth');
    expect(authResult!.lineCoverage).toBe(75);
    expect(authResult!.pass).toBe(false);

    const paymentsResult = result.results.find((r) => r.packageName === 'payments');
    expect(paymentsResult!.lineCoverage).toBe(90);
    expect(paymentsResult!.pass).toBe(true);

    const securityResult = result.results.find((r) => r.packageName === 'security');
    expect(securityResult!.lineCoverage).toBe(60);
    expect(securityResult!.pass).toBe(false);
  });

  it('should work with the standalone runCoverageGate function', () => {
    const coverageData = createMockCoverageData({
      auth: { covered: 90, total: 100 },
      payments: { covered: 95, total: 100 },
      security: { covered: 88, total: 100 },
    });

    const result = runCoverageGate(coverageData);

    expect(result.pass).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.summary).toContain('All 3 critical packages');
  });

  it('should respect custom threshold configuration', () => {
    const coverageData = createMockCoverageData({
      auth: { covered: 85, total: 100 },
      payments: { covered: 85, total: 100 },
      security: { covered: 85, total: 100 },
    });

    const result = runCoverageGate(coverageData, { threshold: 90 });

    expect(result.pass).toBe(false);
    expect(result.results.every((r) => !r.pass)).toBe(true);
  });
});
