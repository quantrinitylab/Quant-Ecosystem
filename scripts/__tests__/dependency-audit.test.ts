import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'dependency-audit.mjs');
const temporaryRoots: string[] = [];

function fixture(report: unknown) {
  const root = mkdtempSync(join(tmpdir(), 'quant-dependency-audit-'));
  temporaryRoots.push(root);
  const path = join(root, 'audit.json');
  writeFileSync(path, `${JSON.stringify(report)}\n`);
  return path;
}

function run(input: string, level = 'high') {
  return spawnSync(process.execPath, [SCRIPT, '--input', input, '--level', level], {
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('dependency audit gate', () => {
  it('blocks modern audit reports at the configured severity', () => {
    const input = fixture({
      auditReportVersion: 2,
      vulnerabilities: {
        undici: {
          name: 'undici',
          severity: 'critical',
          isDirect: false,
          via: [{ severity: 'critical', title: 'Request smuggling', url: 'https://example.test/GHSA-1', range: '<6.0.0' }],
          range: '<6.0.0',
        },
        vite: {
          name: 'vite',
          severity: 'moderate',
          isDirect: true,
          via: [{ severity: 'moderate', title: 'Dev server exposure', range: '<6.0.0' }],
        },
      },
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 1 } },
    });

    const result = run(input);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('critical=1 high=0 moderate=1');
    expect(result.stderr).toContain('1 dependency vulnerability finding(s) meet or exceed high');
  });

  it('allows lower-severity legacy advisories below the threshold', () => {
    const input = fixture({
      advisories: {
        '100': {
          module_name: 'example-package',
          severity: 'moderate',
          title: 'Moderate fixture advisory',
          vulnerable_versions: '<2.0.0',
          findings: [{ paths: ['root>example-package'] }],
        },
      },
    });

    const result = run(input, 'high');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('moderate=1');
  });

  it('fails closed when metadata reports blocking findings without advisory detail', () => {
    const input = fixture({
      vulnerabilities: {},
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0 } },
    });

    const result = run(input, 'high');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('2 dependency vulnerability finding(s) meet or exceed high');
  });

  it('fails closed on malformed audit output', () => {
    const root = mkdtempSync(join(tmpdir(), 'quant-dependency-audit-'));
    temporaryRoots.push(root);
    const input = join(root, 'audit.json');
    writeFileSync(input, 'not-json');

    const result = run(input);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('did not return JSON');
  });

  it('keeps the audit parser and live high-severity gate wired into CI', () => {
    const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['audit:dependencies']).toBe('node scripts/dependency-audit.mjs --level high');
    expect(packageJson.scripts['test:dependency-audit']).toContain('dependency-audit.test.ts');
    expect(workflow).toContain('pnpm test:dependency-audit');
    expect(workflow).toContain('pnpm audit:dependencies');
  });
});
