// ============================================================================
// EffectCraft adapter tests (C-2) — the TypeScript port of the C-2 spike's
// 14 adapter tests (~/workspace/quantcooks-craft-spike/
// effectcraft-adapter.test.mjs), plus the production additions the spike's
// §5 step 2 names: the ticks-corruption guard, the real Node runner against
// a fake-binary fixture, timeout+kill, and the version probe.
//
// Mapping from the spike sketch to this module: the spike's finalizeJob /
// createJobRecord job-object semantics live here as finalizeRender outcomes
// (the service owns the job record); progressToJobPatch is the percent on
// the parsed event, which CraftRenderService.updateProgress clamps into the
// PROCESSING band (covered in craft-render.service.test.ts).
// ============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PINNED_EFFECTCRAFT,
  ECPROJ_TICKS_PER_SECOND,
  buildRenderArgs,
  parseProgressLine,
  validateEcproj,
  finalizeRender,
  renderWithEffectCraft,
  resolveEffectCraftBin,
  NodeEffectCraftRunner,
  type EffectCraftRunner,
} from '../services/effectcraft.adapter';

// Minimal .ecproj in the shape the pinned binary itself writes (the spike's
// fixture; top-level keys + item/kind structure verified from a real save).
const MINIMAL_ECPROJ = {
  savedBy: '0.18.0',
  schema: 2,
  activeComp: 502,
  openComps: [502],
  compTimes: {},
  settings: { bit_depth: 8 },
  items: {
    '502': {
      id: 502,
      name: 'Main',
      label: 'None',
      comment: '',
      parent: null,
      kind: {
        type: 'Comp',
        width: 1920,
        height: 1080,
        pixel_aspect: 1,
        frame_rate: { num: 30000, den: 1001 },
        duration: 254016000000,
        background: [0, 0, 0],
        layers: [],
      },
    },
  },
  next_id: 503,
};

class StubRunner implements EffectCraftRunner {
  calls: string[][] = [];
  constructor(
    private readonly script: {
      lines?: string[];
      exitCode?: number;
      timedOut?: boolean;
      stderrTail?: string;
    },
  ) {}
  async run(argv: string[], options?: { onStderrLine?: (line: string) => void }) {
    this.calls.push(argv);
    for (const line of this.script.lines ?? []) options?.onStderrLine?.(line);
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
  'fake-effectcraft-cli.mjs',
);

beforeAll(() => {
  // The extract may not preserve the executable bit on the fixture.
  chmodSync(FIXTURE_BIN, 0o755);
});

describe('effectcraft adapter (spike port)', () => {
  it('pin is v0.18.0 with a recorded sha256', () => {
    expect(PINNED_EFFECTCRAFT.version).toBe('0.18.0');
    expect(PINNED_EFFECTCRAFT.linuxAssetSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(PINNED_EFFECTCRAFT.tag).toBe('v0.18.0');
  });

  it('buildRenderArgs produces the verified CLI form', () => {
    const args = buildRenderArgs({
      projectPath: 'p.ecproj',
      comp: 'Main',
      outputPath: 'o.mp4',
      format: 'h264',
      startSec: 0,
      endSec: 5,
      resolution: 'half',
      quality: 'draft',
    });
    expect(args).toEqual([
      '--project', 'p.ecproj', 'render', '--comp', 'Main', '--out', 'o.mp4',
      '--format', 'h264', '--start', '0', '--end', '5',
      '--resolution', 'half', '--quality', 'draft', '--progress',
    ]);
  });

  it('buildRenderArgs requires project and output', () => {
    expect(() => buildRenderArgs({ outputPath: 'o.mp4' } as never)).toThrow(/projectPath/);
    expect(() => buildRenderArgs({ projectPath: 'p.ecproj' } as never)).toThrow(/outputPath/);
  });

  it('parseProgressLine parses real captured progress lines', () => {
    expect(parseProgressLine('progress 24 30 0.8 0.2')).toEqual({
      type: 'progress', done: 24, total: 30, elapsedSec: 0.8, etaSec: 0.2, percent: 80,
    });
    const unknownEta = parseProgressLine('progress 4 30 0.3 -');
    expect(unknownEta).toMatchObject({ type: 'progress', etaSec: null, percent: 13 });
  });

  it('parseProgressLine parses the done line and ignores noise', () => {
    const done = parseProgressLine('done: EffectCraft Intro → /tmp/o.mp4 in 1.12s');
    expect(done).toMatchObject({ type: 'done', outputPath: '/tmp/o.mp4', seconds: 1.12 });
    expect(parseProgressLine('EffectCraft Intro → x (480×270, 30 frames, H.264)')).toBeNull();
    expect(parseProgressLine('')).toBeNull();
    expect(parseProgressLine(undefined)).toBeNull();
  });

  it('progress percent maps onto the PROCESSING band (15/30 -> 50)', () => {
    const event = parseProgressLine('progress 15 30 0.5 0.5');
    expect(event).toMatchObject({ type: 'progress', percent: 50 });
    expect(parseProgressLine('done: Main → o.mp4 in 1.0s')).not.toMatchObject({ type: 'progress' });
  });

  it('validateEcproj accepts the verified minimal shape', () => {
    expect(validateEcproj(MINIMAL_ECPROJ)).toEqual({ ok: true, errors: [] });
  });

  it('validateEcproj rejects non-objects, missing schema/items, and comp-less projects', () => {
    expect(validateEcproj(null).ok).toBe(false);
    expect(validateEcproj([1, 2]).ok).toBe(false);
    expect(validateEcproj({ items: {} }).ok).toBe(false);
    const noComp = structuredClone(MINIMAL_ECPROJ) as typeof MINIMAL_ECPROJ;
    (noComp.items['502']!.kind as { type: string }).type = 'Folder';
    const v = validateEcproj(noComp);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/Comp/);
  });

  it('validateEcproj rejects hand-written seconds in tick fields (the ticks gotcha)', () => {
    expect(ECPROJ_TICKS_PER_SECOND).toBe(254_016_000_000);
    const seconds = structuredClone(MINIMAL_ECPROJ) as typeof MINIMAL_ECPROJ;
    // A 10-second comp hand-written as `10` instead of 2540160000000 ticks.
    (seconds.items['502']!.kind as { duration: unknown }).duration = 10;
    const v = validateEcproj(seconds);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/ticks/);

    const stringy = structuredClone(MINIMAL_ECPROJ) as typeof MINIMAL_ECPROJ;
    (stringy.items['502']!.kind as { duration: unknown }).duration = '254016000000';
    expect(validateEcproj(stringy).ok).toBe(false);
  });

  it('finalizeRender: exit 0 + output -> COMPLETED', () => {
    expect(
      finalizeRender({ exitCode: 0, timedOut: false, outputPath: 'o.mp4', outputExists: true, stderrTail: '' }),
    ).toEqual({ status: 'COMPLETED', outputPath: 'o.mp4' });
  });

  it('finalizeRender: exit 0 but no output -> FAILED RENDER_NO_OUTPUT, never faked', () => {
    const outcome = finalizeRender({
      exitCode: 0, timedOut: false, outputPath: 'o.mp4', outputExists: false, stderrTail: '',
    });
    expect(outcome.status).toBe('FAILED');
    expect(outcome).toMatchObject({ error: expect.stringContaining('RENDER_NO_OUTPUT') });
  });

  it('finalizeRender: non-zero exit -> FAILED with code and stderr tail', () => {
    const outcome = finalizeRender({
      exitCode: 1, timedOut: false, outputPath: 'o.mp4', outputExists: false,
      stderrTail: '{"error":"no comp"}',
    });
    expect(outcome.status).toBe('FAILED');
    expect(outcome).toMatchObject({ error: expect.stringContaining('EFFECTCRAFT_EXIT_1') });
    expect(outcome).toMatchObject({ error: expect.stringContaining('no comp') });
  });

  it('finalizeRender: timeout -> FAILED EFFECTCRAFT_TIMEOUT', () => {
    const outcome = finalizeRender({
      exitCode: null, timedOut: true, outputPath: 'o.mp4', outputExists: false, stderrTail: '',
    });
    expect(outcome).toMatchObject({ status: 'FAILED', error: expect.stringContaining('EFFECTCRAFT_TIMEOUT') });
  });

  it('renderWithEffectCraft: happy path COMPLETED via StubRunner, progress streamed', async () => {
    const runner = new StubRunner({
      lines: ['progress 15 30 0.5 0.5', 'progress 30 30 1.0 0.0', 'done: Main → o.mp4 in 1.0s'],
      exitCode: 0,
    });
    const percents: number[] = [];
    const outcome = await renderWithEffectCraft({
      ecprojJson: MINIMAL_ECPROJ,
      outputPath: 'o.mp4',
      comp: 'Main',
      runner,
      fileExists: () => true,
      onProgress: (p) => percents.push(p),
    });
    expect(outcome).toEqual({ status: 'COMPLETED', outputPath: 'o.mp4' });
    expect(percents).toContain(50);
    // argv handed to the runner is the verified render form, ending in --progress
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]!.at(-1)).toBe('--progress');
    expect(runner.calls[0]).toContain('render');
  });

  it('renderWithEffectCraft: invalid ecproj fails before any spawn', async () => {
    const runner = new StubRunner({ exitCode: 0 });
    const outcome = await renderWithEffectCraft({
      ecprojJson: { nope: true },
      outputPath: 'o.mp4',
      runner,
      fileExists: () => true,
    });
    expect(outcome.status).toBe('FAILED');
    expect(outcome).toMatchObject({ error: expect.stringContaining('INVALID_ECPROJ') });
    expect(runner.calls).toHaveLength(0);
  });

  it('renderWithEffectCraft: CLI failure maps to FAILED', async () => {
    const runner = new StubRunner({ lines: [], exitCode: 1 });
    const outcome = await renderWithEffectCraft({
      ecprojJson: MINIMAL_ECPROJ,
      outputPath: 'o.mp4',
      runner,
      fileExists: () => false,
    });
    expect(outcome.status).toBe('FAILED');
    expect(outcome).toMatchObject({ error: expect.stringContaining('EFFECTCRAFT_EXIT_1') });
  });
});

describe('effectcraft env resolution + real runner (fake binary fixture)', () => {
  it('resolveEffectCraftBin: unset / nonexistent / non-executable -> null (fail closed)', () => {
    expect(resolveEffectCraftBin({})).toBeNull();
    expect(resolveEffectCraftBin({ EFFECTCRAFT_BIN: '/definitely/not/here' })).toBeNull();
    expect(resolveEffectCraftBin({ EFFECTCRAFT_BIN: FIXTURE_BIN })).toBe(FIXTURE_BIN);
  });

  it('probeVersion runs the binary and reads its version', async () => {
    const runner = new NodeEffectCraftRunner(FIXTURE_BIN);
    await expect(runner.probeVersion()).resolves.toBe('effectcraft-cli 0.18.0');
  });

  it('a real spawn renders through the fixture: progress lines + output file', async () => {
    const runner = new NodeEffectCraftRunner(FIXTURE_BIN);
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'qc-craft-runner-'));
    const outputPath = join(dir, 'render.mp4');
    const percents: number[] = [];
    const outcome = await renderWithEffectCraft({
      ecprojJson: MINIMAL_ECPROJ,
      outputPath,
      comp: 'Main',
      runner,
      onProgress: (p) => percents.push(p),
    });
    expect(outcome).toEqual({ status: 'COMPLETED', outputPath });
    expect(percents).toEqual([50, 80, 100]);
    expect(existsSync(outputPath)).toBe(true);
    const bytes = readFileSync(outputPath);
    expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
  });

  it('timeout kills a stuck render and finalizes EFFECTCRAFT_TIMEOUT', async () => {
    process.env['FAKE_EC_SLEEP_MS'] = '30000';
    try {
      const runner = new NodeEffectCraftRunner(FIXTURE_BIN, 300);
      const outcome = await renderWithEffectCraft({
        ecprojJson: MINIMAL_ECPROJ,
        outputPath: join('/tmp', 'qc-craft-timeout.mp4'),
        runner,
        fileExists: () => false,
      });
      expect(outcome.status).toBe('FAILED');
      expect(outcome).toMatchObject({ error: expect.stringContaining('EFFECTCRAFT_TIMEOUT') });
    } finally {
      delete process.env['FAKE_EC_SLEEP_MS'];
    }
  }, 15_000);

  it('spawning a missing binary rejects with the real error (never a fake success)', async () => {
    const runner = new NodeEffectCraftRunner('/definitely/not/a/binary');
    await expect(runner.run(['--version'])).rejects.toThrow(/ENOENT/);
  });
});
