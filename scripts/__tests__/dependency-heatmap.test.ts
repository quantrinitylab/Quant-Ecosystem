import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'dependency-heatmap.mjs');
const temporaryRoots: string[] = [];

function temporaryWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'quant-dependency-heatmap-'));
  temporaryRoots.push(root);
  writeJson(join(root, 'package.json'), { name: 'fixture-root', private: true });
  return root;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeSource(path: string, source: string) {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, source);
}

function run(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], {
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('dependency heatmap scanner', () => {
  it('counts declared dependents and external static/dynamic importers', () => {
    const root = temporaryWorkspace();
    writeJson(join(root, 'packages', 'used', 'package.json'), { name: '@quant/used' });
    writeJson(join(root, 'packages', 'dead', 'package.json'), { name: '@quant/dead' });
    writeJson(join(root, 'apps', 'consumer', 'package.json'), {
      name: '@quant/consumer',
      dependencies: { '@quant/used': 'workspace:*' },
    });
    writeSource(join(root, 'apps', 'consumer', 'src', 'static.ts'), "export { value } from '@quant/used/subpath';\n");
    writeSource(join(root, 'apps', 'consumer', 'src', 'dynamic.ts'), "const module = import('@quant/used');\n");
    writeSource(join(root, 'packages', 'used', 'src', 'self.ts'), "import '@quant/used';\n");

    const result = run(root, '--json');
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as Array<{ name: string; D: number; I: number; score: string }>;
    expect(report.find(({ name }) => name === '@quant/used')).toEqual({
      name: '@quant/used',
      D: 1,
      I: 2,
      score: 'LOW',
    });
    expect(report.find(({ name }) => name === '@quant/dead')).toEqual({
      name: '@quant/dead',
      D: 0,
      I: 0,
      score: 'DEAD',
    });
  });

  it('recognizes CommonJS require without counting declaration files', () => {
    const root = temporaryWorkspace();
    writeJson(join(root, 'packages', 'runtime', 'package.json'), { name: '@quant/runtime' });
    writeJson(join(root, 'services', 'worker', 'package.json'), { name: '@quant/worker' });
    writeSource(join(root, 'services', 'worker', 'src', 'worker.cjs'), "const runtime = require('@quant/runtime');\n");
    writeSource(join(root, 'services', 'worker', 'src', 'types.d.ts'), "import '@quant/runtime';\n");

    const result = run(root, '--json');
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as Array<{ name: string; I: number }>;
    expect(report.find(({ name }) => name === '@quant/runtime')?.I).toBe(1);
  });

  it('fails closed on malformed workspace manifests', () => {
    const root = temporaryWorkspace();
    mkdirSync(join(root, 'packages', 'broken'), { recursive: true });
    writeFileSync(join(root, 'packages', 'broken', 'package.json'), '{ not valid json');

    const result = run(root, '--json');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Invalid JSON');
    expect(result.stdout).toBe('');
  });

  it('keeps the blocking CI wiring and portable implementation checked in', () => {
    const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const implementation = readFileSync(SCRIPT, 'utf8');
    expect(workflow).toContain('pnpm test:dependency-heatmap');
    expect(workflow).toContain('--assert-new-packages-wired --base "${{ steps.base.outputs.ref }}"');
    expect(implementation).not.toContain('grep -');
    expect(implementation).toContain("execFileSync(\n      'git'");
  });
});
