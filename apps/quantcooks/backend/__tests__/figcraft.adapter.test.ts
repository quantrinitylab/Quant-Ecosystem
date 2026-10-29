// ============================================================================
// FigCraft adapter tests (C-7 step 4) — in the C-2/C-3B adapter-test
// idiom: pin record, template allowlist (the gate that runs BEFORE any
// spawn), script + argv construction from the spike's verified runs,
// run-result parsing, finalize mapping, the wrapper's no-spawn proof
// for invalid templates, and the real Node runner against a fake-binary
// fixture (probe, happy path, step failure, timeout+kill, ENOENT).
// ============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import { chmodSync, existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PINNED_FIGCRAFT,
  FIGCRAFT_TEMPLATES,
  DESIGN_EXPORT_FORMATS,
  validateTemplateId,
  buildCreateScript,
  buildRunArgs,
  buildExportArgs,
  parseRunResults,
  finalizeCreate,
  finalizeExport,
  createDesignWithFigCraft,
  exportDesignWithFigCraft,
  resolveFigCraftBin,
  NodeFigCraftRunner,
  type FigCraftRunner,
  type FigCraftRunResult,
} from '../services/figcraft.adapter';

class StubRunner implements FigCraftRunner {
  calls: string[][] = [];
  constructor(
    private readonly script: {
      exitCode?: number;
      timedOut?: boolean;
      stderrTail?: string;
      stdoutLines?: string[];
      throwOnRun?: boolean;
    },
  ) {}
  async run(argv: string[], options?: { onStdoutLine?: (line: string) => void }): Promise<FigCraftRunResult> {
    this.calls.push(argv);
    if (this.script.throwOnRun) throw new Error('runner must not be called');
    const lines = this.script.stdoutLines ?? [];
    for (const line of lines) options?.onStdoutLine?.(line);
    return {
      exitCode: this.script.exitCode ?? 0,
      stderrTail: this.script.stderrTail ?? '',
      stdoutTail: lines.join('\n'),
      timedOut: this.script.timedOut ?? false,
    };
  }
}

const FIXTURE_BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'fake-figcraft-cli.mjs',
);

beforeAll(() => {
  chmodSync(FIXTURE_BIN, 0o755);
});

describe('figcraft adapter: pin + allowlists', () => {
  it('pin is v0.12.1 with the sha256 verified against the release sums', () => {
    expect(PINNED_FIGCRAFT.version).toBe('0.12.1');
    expect(PINNED_FIGCRAFT.tag).toBe('v0.12.1');
    expect(PINNED_FIGCRAFT.linuxAssetSha256).toBe(
      '00a29f4cc382807d840f5d3e9b59f4c8829356789afbb956a0964918295e49dd',
    );
    expect(PINNED_FIGCRAFT.registryCommandCount).toBe(615);
  });

  it('the template allowlist is exactly the pinned engine starter set (template.list)', () => {
    expect(FIGCRAFT_TEMPLATES).toEqual([
      'mobile-app',
      'landing-page',
      'dashboard',
      'design-system',
      'wireframe-kit',
      'social-posts',
      'slides',
      'icon-set',
    ]);
  });

  it('export formats are exactly png/svg/pdf (the spike-proven set)', () => {
    expect(DESIGN_EXPORT_FORMATS).toEqual(['png', 'svg', 'pdf']);
  });

  it('validateTemplateId accepts listed ids and the absent (blank) case', () => {
    expect(validateTemplateId(undefined)).toEqual({ ok: true, errors: [] });
    expect(validateTemplateId('mobile-app')).toEqual({ ok: true, errors: [] });
    expect(validateTemplateId('slides').ok).toBe(true);
  });

  it('validateTemplateId rejects unknown ids, non-strings and path tricks', () => {
    expect(validateTemplateId('no-such-template').ok).toBe(false);
    expect(validateTemplateId('../mobile-app').ok).toBe(false);
    expect(validateTemplateId(42).ok).toBe(false);
    expect(validateTemplateId('').ok).toBe(false);
  });
});

describe('figcraft adapter: script + argv construction', () => {
  it('buildCreateScript: template path is newFromTemplate + saveAs (binary authors the doc)', () => {
    const steps = buildCreateScript({
      template: 'mobile-app',
      name: 'Dish App',
      outputPath: '/work/design.figcraft',
    });
    expect(steps).toEqual([
      { command: 'file.newFromTemplate', params: { template: 'mobile-app', name: 'Dish App' } },
      { command: 'file.saveAs', params: { path: '/work/design.figcraft' } },
    ]);
  });

  it('buildCreateScript: blank path is file.new + saveAs, name optional', () => {
    expect(buildCreateScript({ outputPath: '/work/d.figcraft' })).toEqual([
      { command: 'file.new', params: {} },
      { command: 'file.saveAs', params: { path: '/work/d.figcraft' } },
    ]);
    expect(buildCreateScript({ name: 'Blanky', outputPath: '/work/d.figcraft' })[0]).toEqual({
      command: 'file.new',
      params: { name: 'Blanky' },
    });
  });

  it('buildRunArgs confines the run to the workspace as both roots', () => {
    expect(buildRunArgs({ scriptPath: '/work/create-script.json', workDir: '/work' })).toEqual([
      'run',
      '/work/create-script.json',
      '--automation-read-root',
      '/work',
      '--automation-write-root',
      '/work',
      '--no-system-fonts',
    ]);
  });

  it('buildExportArgs: single-file form with node + scale', () => {
    expect(
      buildExportArgs({
        inputPath: '/work/source.figcraft',
        outputPath: '/work/export.png',
        format: 'png',
        node: 'Welcome',
        scale: 2,
        workDir: '/work',
      }),
    ).toEqual([
      'export',
      '/work/source.figcraft',
      '-o',
      '/work/export.png',
      '--format',
      'png',
      '--scale',
      '2',
      '--node',
      'Welcome',
      '--no-system-fonts',
      '--automation-read-root',
      '/work',
      '--automation-write-root',
      '/work',
    ]);
  });

  it('buildExportArgs: directory form carries no --node; page passes through', () => {
    const args = buildExportArgs({
      inputPath: '/work/source.figcraft',
      outputPath: '/work/exports',
      format: 'svg',
      page: 'Screens',
      workDir: '/work',
    });
    expect(args).toContain('--page');
    expect(args).not.toContain('--node');
    expect(args[args.indexOf('--format') + 1]).toBe('svg');
  });
});

describe('figcraft adapter: run results + finalize', () => {
  it('parseRunResults finds the first ok:false step with the binary error text', () => {
    const failed = parseRunResults([
      '{"command":"template.list","ok":true,"step":0}',
      'not json chatter',
      '{"command":"file.newFromTemplate","ok":false,"error":"`template` must be an id from `template.list`","rolledBack":true,"step":1}',
    ]);
    expect(failed).toEqual({
      command: 'file.newFromTemplate',
      error: '`template` must be an id from `template.list`',
    });
  });

  it('parseRunResults returns null when every step is ok', () => {
    expect(
      parseRunResults(['{"command":"file.new","ok":true}', '{"command":"file.saveAs","ok":true}']),
    ).toBeNull();
  });

  it('finalizeCreate: exit 0 + output -> COMPLETED', () => {
    expect(
      finalizeCreate({
        exitCode: 0, timedOut: false, outputPath: 'o.figcraft', outputExists: true,
        stderrTail: '', failedStep: null,
      }),
    ).toEqual({ status: 'COMPLETED', outputPath: 'o.figcraft' });
  });

  it('finalizeCreate: a failed step beats the exit code and names the command', () => {
    const outcome = finalizeCreate({
      exitCode: 1, timedOut: false, outputPath: 'o.figcraft', outputExists: false,
      stderrTail: 'rolled back',
      failedStep: { command: 'file.newFromTemplate', error: 'bad template' },
    });
    expect(outcome).toMatchObject({
      status: 'FAILED',
      error: expect.stringContaining('FIGCRAFT_STEP_FAILED: file.newFromTemplate: bad template'),
    });
  });

  it('finalizeCreate: non-zero exit without step detail -> FIGCRAFT_EXIT_<code>', () => {
    const outcome = finalizeCreate({
      exitCode: 2, timedOut: false, outputPath: 'o.figcraft', outputExists: false,
      stderrTail: 'boom', failedStep: null,
    });
    expect(outcome).toMatchObject({ status: 'FAILED', error: expect.stringContaining('FIGCRAFT_EXIT_2') });
  });

  it('finalizeCreate: exit 0 but no document -> DESIGN_NO_OUTPUT, never faked', () => {
    const outcome = finalizeCreate({
      exitCode: 0, timedOut: false, outputPath: 'o.figcraft', outputExists: false,
      stderrTail: '', failedStep: null,
    });
    expect(outcome).toMatchObject({ status: 'FAILED', error: expect.stringContaining('DESIGN_NO_OUTPUT') });
  });

  it('finalizeCreate: timeout -> FIGCRAFT_TIMEOUT', () => {
    const outcome = finalizeCreate({
      exitCode: null, timedOut: true, outputPath: 'o.figcraft', outputExists: false,
      stderrTail: '', failedStep: null,
    });
    expect(outcome).toMatchObject({ status: 'FAILED', error: expect.stringContaining('FIGCRAFT_TIMEOUT') });
  });

  it('finalizeExport mirrors the honesty rules with EXPORT_NO_OUTPUT', () => {
    expect(
      finalizeExport({ exitCode: 0, timedOut: false, outputPath: 'o.png', outputProduced: true, stderrTail: '' }),
    ).toEqual({ status: 'COMPLETED', outputPath: 'o.png' });
    expect(
      finalizeExport({ exitCode: 0, timedOut: false, outputPath: 'o.png', outputProduced: false, stderrTail: '' }),
    ).toMatchObject({ status: 'FAILED', error: expect.stringContaining('EXPORT_NO_OUTPUT') });
    expect(
      finalizeExport({ exitCode: 1, timedOut: false, outputPath: 'o.png', outputProduced: false, stderrTail: 'no layer' }),
    ).toMatchObject({ status: 'FAILED', error: expect.stringContaining('FIGCRAFT_EXIT_1') });
  });

  it('createDesignWithFigCraft: invalid template fails BEFORE any spawn', async () => {
    const runner = new StubRunner({ throwOnRun: true });
    const dir = mkdtempSync(join(tmpdir(), 'qc-fig-adapter-'));
    const outcome = await createDesignWithFigCraft({
      workDir: dir,
      outputPath: join(dir, 'design.figcraft'),
      template: 'bogus-template',
      runner,
    });
    expect(outcome.status).toBe('FAILED');
    expect(outcome).toMatchObject({ error: expect.stringContaining('INVALID_TEMPLATE') });
    expect(runner.calls).toHaveLength(0);
  });

  it('createDesignWithFigCraft: step failure on stdout maps to FIGCRAFT_STEP_FAILED', async () => {
    const runner = new StubRunner({
      exitCode: 1,
      stdoutLines: [
        '{"command":"file.newFromTemplate","ok":false,"error":"bad id","step":0}',
      ],
    });
    const dir = mkdtempSync(join(tmpdir(), 'qc-fig-adapter-'));
    const outcome = await createDesignWithFigCraft({
      workDir: dir,
      outputPath: join(dir, 'design.figcraft'),
      template: 'mobile-app',
      runner,
      fileExists: () => false,
    });
    expect(outcome).toMatchObject({
      status: 'FAILED',
      error: expect.stringContaining('FIGCRAFT_STEP_FAILED'),
    });
    expect(runner.calls[0]?.[0]).toBe('run');
  });

  it('exportDesignWithFigCraft: happy path COMPLETED via StubRunner', async () => {
    const runner = new StubRunner({ exitCode: 0 });
    const outcome = await exportDesignWithFigCraft({
      inputPath: 'in.figcraft',
      outputPath: 'out.png',
      format: 'png',
      workDir: '/work',
      runner,
      outputProduced: () => true,
    });
    expect(outcome).toEqual({ status: 'COMPLETED', outputPath: 'out.png' });
    expect(runner.calls[0]?.[0]).toBe('export');
  });
});

describe('figcraft env resolution + real runner (fake binary fixture)', () => {
  it('resolveFigCraftBin: unset / nonexistent -> null (fail closed)', () => {
    expect(resolveFigCraftBin({})).toBeNull();
    expect(resolveFigCraftBin({ FIGCRAFT_BIN: '/definitely/not/here' })).toBeNull();
    expect(resolveFigCraftBin({ FIGCRAFT_BIN: FIXTURE_BIN })).toBe(FIXTURE_BIN);
  });

  it('probeVersion runs the binary and reads its version', async () => {
    const runner = new NodeFigCraftRunner(FIXTURE_BIN);
    await expect(runner.probeVersion()).resolves.toBe('figcraft-cli 0.12.1 (fake fixture)');
  });

  it('a real spawn creates through the fixture: .figcraft written with ZIP magic', async () => {
    const runner = new NodeFigCraftRunner(FIXTURE_BIN);
    const dir = mkdtempSync(join(tmpdir(), 'qc-fig-runner-'));
    const outputPath = join(dir, 'design.figcraft');
    const outcome = await createDesignWithFigCraft({
      workDir: dir,
      outputPath,
      template: 'mobile-app',
      name: 'Dish App',
      runner,
    });
    expect(outcome).toEqual({ status: 'COMPLETED', outputPath });
    expect(existsSync(outputPath)).toBe(true);
    const bytes = readFileSync(outputPath);
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04])); // 'PK\x03\x04'
    expect(bytes.toString('utf8')).toContain('FAKE-FIGCRAFT-DOCUMENT');
    // The script the adapter wrote is the binary's own commands only.
    const script = JSON.parse(readFileSync(join(dir, 'create-script.json'), 'utf8'));
    expect(script.map((s: { command: string }) => s.command)).toEqual([
      'file.newFromTemplate',
      'file.saveAs',
    ]);
  });

  it('timeout kills a stuck create and finalizes FIGCRAFT_TIMEOUT', async () => {
    process.env['FAKE_FIG_SLEEP_MS'] = '30000';
    try {
      const runner = new NodeFigCraftRunner(FIXTURE_BIN, 300);
      const dir = mkdtempSync(join(tmpdir(), 'qc-fig-timeout-'));
      const outcome = await createDesignWithFigCraft({
        workDir: dir,
        outputPath: join(dir, 'design.figcraft'),
        template: 'mobile-app',
        runner,
        fileExists: () => false,
      });
      expect(outcome).toMatchObject({ status: 'FAILED', error: expect.stringContaining('FIGCRAFT_TIMEOUT') });
    } finally {
      delete process.env['FAKE_FIG_SLEEP_MS'];
    }
  }, 15_000);

  it('spawning a missing binary rejects with the real error (never a fake success)', async () => {
    const runner = new NodeFigCraftRunner('/definitely/not/a/binary');
    await expect(runner.run(['--version'])).rejects.toThrow(/ENOENT/);
  });
});
