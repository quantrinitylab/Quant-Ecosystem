// ============================================================================
// PhotoCraft adapter tests (C-3B) — in the C-2 adapter-test idiom: pin
// record, allowlist validation (the security boundary — every rejection
// must happen BEFORE any spawn), argv construction from the verified
// Phase-1 runs, finalize mapping, the wrapper's no-spawn proof for invalid
// operations, and the real Node runner against a fake-binary fixture
// (probe, happy path, timeout+kill, ENOENT).
// ============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import { chmodSync, existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PINNED_PHOTOCRAFT,
  PHOTO_OPERATIONS,
  MAX_PHOTO_OPERATIONS,
  validateOperations,
  buildRunArgs,
  finalizeEdit,
  editWithPhotoCraft,
  resolvePhotoCraftBin,
  NodePhotoCraftRunner,
  type PhotoCraftRunner,
} from '../services/photocraft.adapter';

class StubRunner implements PhotoCraftRunner {
  calls: string[][] = [];
  constructor(
    private readonly script: {
      exitCode?: number;
      timedOut?: boolean;
      stderrTail?: string;
      throwOnRun?: boolean;
    },
  ) {}
  async run(argv: string[]) {
    this.calls.push(argv);
    if (this.script.throwOnRun) throw new Error('runner must not be called');
    return {
      exitCode: this.script.exitCode ?? 0,
      stderrTail: this.script.stderrTail ?? '',
      timedOut: this.script.timedOut ?? false,
    };
  }
}

const FIXTURE_BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'fake-photocraft-cli.mjs',
);

beforeAll(() => {
  // The extract may not preserve the executable bit on the fixture.
  chmodSync(FIXTURE_BIN, 0o755);
});

describe('photocraft adapter: pin + allowlist', () => {
  it('pin is v0.17.0 with the sha256 verified against the release sums', () => {
    expect(PINNED_PHOTOCRAFT.version).toBe('0.17.0');
    expect(PINNED_PHOTOCRAFT.tag).toBe('v0.17.0');
    expect(PINNED_PHOTOCRAFT.linuxAssetSha256).toBe(
      '5259f9c428c8ee3478c35500ece98713561cafc050e4c9eb354a5050f36eb2b8',
    );
    expect(PINNED_PHOTOCRAFT.registryCommandCount).toBe(945);
  });

  it('the allowlist is exactly the 19 Phase-1-verified operations', () => {
    expect(Object.keys(PHOTO_OPERATIONS)).toEqual([
      'image.imageSize',
      'image.canvasSize',
      'image.crop',
      'image.trim',
      'image.imageRotation.flipCanvasHorizontal',
      'image.imageRotation.flipCanvasVertical',
      'image.imageRotation.180',
      'image.imageRotation.90cw',
      'image.imageRotation.90ccw',
      'image.adjustments.brightnessContrast',
      'image.adjustments.hueSaturation',
      'image.adjustments.exposure',
      'image.adjustments.vibrance',
      'image.adjustments.invert',
      'image.adjustments.desaturate',
      'image.mode.grayscale',
      'filter.blur.gaussianBlur',
      'filter.sharpen.unsharpMask',
      'filter.sharpen.sharpen',
    ]);
  });

  it('validateOperations accepts verified ops with in-range params', () => {
    const v = validateOperations([
      { id: 'image.imageSize', params: { width: 32, height: 24 } },
      { id: 'image.adjustments.brightnessContrast', params: { brightness: 40, contrast: 20 } },
      { id: 'image.adjustments.invert' },
    ]);
    expect(v).toEqual({ ok: true, errors: [] });
  });

  it('validateOperations rejects non-arrays, empty lists and > MAX_PHOTO_OPERATIONS', () => {
    expect(validateOperations(undefined).ok).toBe(false);
    expect(validateOperations([]).ok).toBe(false);
    const tooMany = Array.from({ length: MAX_PHOTO_OPERATIONS + 1 }, () => ({
      id: 'image.adjustments.invert',
    }));
    const v = validateOperations(tooMany);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/maximum of 32/);
  });

  it('validateOperations rejects an unlisted command id (no spawn will happen)', () => {
    const v = validateOperations([{ id: 'layer.createLayer' }]);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/not in the verified operations allowlist/);
  });

  it('validateOperations rejects unknown param keys, out-of-range values and non-integer px', () => {
    expect(validateOperations([{ id: 'image.imageSize', params: { width: 32, quality: 90 } }]).ok).toBe(false);
    const range = validateOperations([
      { id: 'image.adjustments.brightnessContrast', params: { brightness: 999 } },
    ]);
    expect(range.ok).toBe(false);
    expect(range.errors.join(' ')).toMatch(/brightness/);
    expect(validateOperations([{ id: 'image.imageSize', params: { width: 32.5 } }]).ok).toBe(false);
    expect(validateOperations([{ id: 'image.trim', params: { basedOn: 'edges' } }]).ok).toBe(false);
    expect(validateOperations([{ id: 'image.adjustments.invert', params: { strength: 1 } }]).ok).toBe(false);
  });
});

describe('photocraft adapter: argv + finalize', () => {
  it('buildRunArgs pairs --params with the --cmd before it (the verified binding)', () => {
    const args = buildRunArgs({
      inputPath: 'in.png',
      operations: [
        { id: 'image.imageSize', params: { width: 32, height: 24 } },
        { id: 'image.adjustments.invert' },
      ],
      outputPath: 'out.png',
    });
    expect(args).toEqual([
      'run', 'in.png',
      '--cmd', 'image.imageSize', '--params', '{"width":32,"height":24}',
      '--cmd', 'image.adjustments.invert',
      '--out', 'out.png',
    ]);
  });

  it('buildRunArgs omits --params for empty params objects (verified form)', () => {
    const args = buildRunArgs({
      inputPath: 'in.png',
      operations: [{ id: 'image.adjustments.desaturate', params: {} }],
      outputPath: 'out.png',
    });
    expect(args).toEqual(['run', 'in.png', '--cmd', 'image.adjustments.desaturate', '--out', 'out.png']);
  });

  it('finalizeEdit: exit 0 + output -> COMPLETED', () => {
    expect(
      finalizeEdit({ exitCode: 0, timedOut: false, outputPath: 'o.png', outputExists: true, stderrTail: '' }),
    ).toEqual({ status: 'COMPLETED', outputPath: 'o.png' });
  });

  it('finalizeEdit: exit 0 but no output -> FAILED EDIT_NO_OUTPUT, never faked', () => {
    const outcome = finalizeEdit({
      exitCode: 0, timedOut: false, outputPath: 'o.png', outputExists: false, stderrTail: '',
    });
    expect(outcome.status).toBe('FAILED');
    expect(outcome).toMatchObject({ error: expect.stringContaining('EDIT_NO_OUTPUT') });
  });

  it('finalizeEdit: non-zero exit -> FAILED with code and stderr tail', () => {
    const outcome = finalizeEdit({
      exitCode: 1, timedOut: false, outputPath: 'o.png', outputExists: false,
      stderrTail: 'error: `bogus.command`: unknown command',
    });
    expect(outcome.status).toBe('FAILED');
    expect(outcome).toMatchObject({ error: expect.stringContaining('PHOTO_EXIT_1') });
    expect(outcome).toMatchObject({ error: expect.stringContaining('unknown command') });
  });

  it('finalizeEdit: timeout -> FAILED PHOTO_TIMEOUT', () => {
    const outcome = finalizeEdit({
      exitCode: null, timedOut: true, outputPath: 'o.png', outputExists: false, stderrTail: '',
    });
    expect(outcome).toMatchObject({ status: 'FAILED', error: expect.stringContaining('PHOTO_TIMEOUT') });
  });

  it('editWithPhotoCraft: invalid operations fail BEFORE any spawn', async () => {
    const runner = new StubRunner({ throwOnRun: true });
    const outcome = await editWithPhotoCraft({
      inputPath: 'in.png',
      outputPath: 'out.png',
      operations: [{ id: 'layer.deleteLayer' }],
      runner,
    });
    expect(outcome.status).toBe('FAILED');
    expect(outcome).toMatchObject({ error: expect.stringContaining('INVALID_OPERATIONS') });
    expect(runner.calls).toHaveLength(0);
  });

  it('editWithPhotoCraft: happy path COMPLETED via StubRunner', async () => {
    const runner = new StubRunner({ exitCode: 0 });
    const outcome = await editWithPhotoCraft({
      inputPath: 'in.png',
      outputPath: 'out.png',
      operations: [{ id: 'image.imageSize', params: { width: 10, height: 10 } }],
      runner,
      fileExists: () => true,
    });
    expect(outcome).toEqual({ status: 'COMPLETED', outputPath: 'out.png' });
    expect(runner.calls[0]).toContain('--out');
  });

  it('editWithPhotoCraft: CLI failure and missing output map to FAILED', async () => {
    const failing = new StubRunner({ exitCode: 2, stderrTail: 'boom' });
    const failOutcome = await editWithPhotoCraft({
      inputPath: 'in.png', outputPath: 'out.png',
      operations: [{ id: 'image.adjustments.invert' }],
      runner: failing, fileExists: () => false,
    });
    expect(failOutcome).toMatchObject({ status: 'FAILED', error: expect.stringContaining('PHOTO_EXIT_2') });

    const silent = new StubRunner({ exitCode: 0 });
    const silentOutcome = await editWithPhotoCraft({
      inputPath: 'in.png', outputPath: 'out.png',
      operations: [{ id: 'image.adjustments.invert' }],
      runner: silent, fileExists: () => false,
    });
    expect(silentOutcome).toMatchObject({ status: 'FAILED', error: expect.stringContaining('EDIT_NO_OUTPUT') });
  });
});

describe('photocraft env resolution + real runner (fake binary fixture)', () => {
  it('resolvePhotoCraftBin: unset / nonexistent / non-executable -> null (fail closed)', () => {
    expect(resolvePhotoCraftBin({})).toBeNull();
    expect(resolvePhotoCraftBin({ PHOTOCRAFT_BIN: '/definitely/not/here' })).toBeNull();
    expect(resolvePhotoCraftBin({ PHOTOCRAFT_BIN: FIXTURE_BIN })).toBe(FIXTURE_BIN);
  });

  it('probeVersion runs the binary and reads its version', async () => {
    const runner = new NodePhotoCraftRunner(FIXTURE_BIN);
    await expect(runner.probeVersion()).resolves.toBe('photocraft-cli 0.17.0 (fake fixture)');
  });

  it('a real spawn edits through the fixture: output file written with PNG magic', async () => {
    const runner = new NodePhotoCraftRunner(FIXTURE_BIN);
    const dir = mkdtempSync(join(tmpdir(), 'qc-photo-runner-'));
    const outputPath = join(dir, 'edited.png');
    const outcome = await editWithPhotoCraft({
      inputPath: join(dir, 'source.png'),
      outputPath,
      operations: [{ id: 'image.imageSize', params: { width: 10, height: 10 } }],
      runner,
    });
    expect(outcome).toEqual({ status: 'COMPLETED', outputPath });
    expect(existsSync(outputPath)).toBe(true);
    const bytes = readFileSync(outputPath);
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('timeout kills a stuck edit and finalizes PHOTO_TIMEOUT', async () => {
    process.env['FAKE_PC_SLEEP_MS'] = '30000';
    try {
      const runner = new NodePhotoCraftRunner(FIXTURE_BIN, 300);
      const outcome = await editWithPhotoCraft({
        inputPath: 'in.png',
        outputPath: join(tmpdir(), 'qc-photo-timeout.png'),
        operations: [{ id: 'image.adjustments.invert' }],
        runner,
        fileExists: () => false,
      });
      expect(outcome.status).toBe('FAILED');
      expect(outcome).toMatchObject({ error: expect.stringContaining('PHOTO_TIMEOUT') });
    } finally {
      delete process.env['FAKE_PC_SLEEP_MS'];
    }
  }, 15_000);

  it('spawning a missing binary rejects with the real error (never a fake success)', async () => {
    const runner = new NodePhotoCraftRunner('/definitely/not/a/binary');
    await expect(runner.run(['--version'])).rejects.toThrow(/ENOENT/);
  });
});
