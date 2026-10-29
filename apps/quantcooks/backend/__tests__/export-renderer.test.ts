// ============================================================================
// StorageExportRenderer tests (P0-4).
//
// Runs against the shared FakeStoragePort + a stub VideoTranscoder that
// records its renderClip arguments and writes a dummy output file — the same
// seam FfmpegAutoEditRenderer's tests use. No real ffmpeg runs here (the
// gated e2e covers that in CI). Covered: source downloaded from the right
// key, output uploaded to the spec key, resolution mapping incl. the
// never-upscale rule, quality mapping (bitrate ladder + lossless CRF 0),
// trim passthrough, the onRendered (progress-70) hook, and temp-file cleanup
// on success AND on failure.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  StorageExportRenderer,
  scaleBoxFor,
  encodingFor,
  exportOutputKey,
  type ExportRenderClipOptions,
  type ExportTranscoder,
} from '../services/export-renderer';
import { createFakeStorage, type FakeStorage } from './fake-storage';

const SOURCE_KEY = 'quantcooks/user-1/project-1/asset-1/clip.mp4';

interface StubTranscoder extends ExportTranscoder {
  renderCalls: Array<{ inputPath: string; outputPath: string; options?: ExportRenderClipOptions }>;
}

function stubTranscoder(
  dims: { width: number; height: number } = { width: 3840, height: 2160 },
  behavior: { failWith?: Error } = {},
): StubTranscoder {
  const renderCalls: StubTranscoder['renderCalls'] = [];
  return {
    renderCalls,
    async getMediaInfo() {
      return {
        streams: [{ codec_type: 'video', width: dims.width, height: dims.height }],
        format: { duration: 30 },
      };
    },
    async renderClip(inputPath, outputPath, options) {
      renderCalls.push({ inputPath, outputPath, options });
      if (behavior.failWith) throw behavior.failWith;
      await writeFile(outputPath, Buffer.from('rendered-bytes'));
      return { outputPath, duration: 30 };
    },
  };
}

function job(overrides: Record<string, string> = {}) {
  return {
    id: 'job-1',
    projectId: 'project-1',
    userId: 'user-1',
    format: 'mp4',
    resolution: '1080p',
    quality: 'high',
    ...overrides,
  };
}

describe('StorageExportRenderer', () => {
  let storage: FakeStorage;
  let workDir: string;

  beforeEach(async () => {
    storage = createFakeStorage();
    storage.put(SOURCE_KEY, Buffer.from('source-bytes'), 'video/mp4');
    workDir = await mkdtemp(join(tmpdir(), 'qc-export-renderer-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('downloads the source key and uploads the render to the spec output key', async () => {
    const transcoder = stubTranscoder();
    const renderer = new StorageExportRenderer(storage.port, transcoder);

    const result = await renderer.render({ job: job(), sourceKey: SOURCE_KEY }, workDir);

    expect(result.outputKey).toBe('quantcooks/user-1/project-1/exports/job-1.mp4');
    expect(result.durationSec).toBe(30);
    expect(transcoder.renderCalls[0]?.inputPath).toBe(join(workDir, 'job-1-src.mp4'));
    expect(storage.has(result.outputKey)).toBe(true);
    expect(storage.objects.get(result.outputKey)?.bytes.toString()).toBe('rendered-bytes');
    expect(storage.objects.get(result.outputKey)?.contentType).toBe('video/mp4');
  });

  it('scales a 4K source down to the 1080p box and uses the 1080p high bitrate', async () => {
    const transcoder = stubTranscoder({ width: 3840, height: 2160 });
    const renderer = new StorageExportRenderer(storage.port, transcoder);

    await renderer.render({ job: job(), sourceKey: SOURCE_KEY }, workDir);

    const options = transcoder.renderCalls[0]?.options;
    expect(options?.width).toBe(1920);
    expect(options?.height).toBe(1080);
    expect(options?.videoBitrate).toBe('5000k');
    expect(options?.crf).toBeUndefined();
  });

  it('never upscales: a 720p source with a 1080p job gets no scale options', async () => {
    const transcoder = stubTranscoder({ width: 1280, height: 720 });
    const renderer = new StorageExportRenderer(storage.port, transcoder);

    await renderer.render({ job: job(), sourceKey: SOURCE_KEY }, workDir);

    const options = transcoder.renderCalls[0]?.options;
    expect(options?.width).toBeUndefined();
    expect(options?.height).toBeUndefined();
    // Effective height is the source's 720 → the 720p ladder rung.
    expect(options?.videoBitrate).toBe('2500k');
  });

  it('maps quality low/medium/high onto the bitrate ladder and lossless onto CRF 0', async () => {
    const cases: Array<{ quality: string; bitrate?: string; crf?: number }> = [
      { quality: 'low', bitrate: '2500k' },
      { quality: 'medium', bitrate: '3750k' },
      { quality: 'high', bitrate: '5000k' },
      { quality: 'lossless', crf: 0 },
    ];

    for (const c of cases) {
      const transcoder = stubTranscoder({ width: 1920, height: 1080 });
      const renderer = new StorageExportRenderer(storage.port, transcoder);
      await renderer.render({ job: job({ quality: c.quality }), sourceKey: SOURCE_KEY }, workDir);
      const options = transcoder.renderCalls[0]?.options;
      expect(options?.videoBitrate, `quality ${c.quality}`).toBe(c.bitrate);
      expect(options?.crf, `quality ${c.quality}`).toBe(c.crf);
    }
  });

  it('passes the trim window through to renderClip', async () => {
    const transcoder = stubTranscoder();
    const renderer = new StorageExportRenderer(storage.port, transcoder);

    await renderer.render(
      { job: job(), sourceKey: SOURCE_KEY, trim: { startSec: 5, durationSec: 10 } },
      workDir,
    );

    const options = transcoder.renderCalls[0]?.options;
    expect(options?.startSec).toBe(5);
    expect(options?.durationSec).toBe(10);
  });

  it('fires the onRendered hook after render, before upload completes the job', async () => {
    const transcoder = stubTranscoder();
    const renderer = new StorageExportRenderer(storage.port, transcoder);
    const outputKey = 'quantcooks/user-1/project-1/exports/job-1.mp4';

    let uploadedAtHookTime: boolean | undefined;
    await renderer.render({ job: job(), sourceKey: SOURCE_KEY }, workDir, {
      onRendered: () => {
        uploadedAtHookTime = storage.has(outputKey);
      },
    });

    expect(uploadedAtHookTime).toBe(false);
    expect(storage.has(outputKey)).toBe(true);
  });

  it('cleans temp files on success and on render failure', async () => {
    const okTranscoder = stubTranscoder();
    const okRenderer = new StorageExportRenderer(storage.port, okTranscoder);
    await okRenderer.render({ job: job(), sourceKey: SOURCE_KEY }, workDir);
    expect(existsSync(join(workDir, 'job-1-src.mp4'))).toBe(false);
    expect(existsSync(join(workDir, 'job-1-out.mp4'))).toBe(false);

    const failTranscoder = stubTranscoder({ width: 1920, height: 1080 }, { failWith: new Error('boom') });
    const failRenderer = new StorageExportRenderer(storage.port, failTranscoder);
    await expect(
      failRenderer.render({ job: job({ id: 'job-2' }), sourceKey: SOURCE_KEY }, workDir),
    ).rejects.toThrow('boom');
    expect(existsSync(join(workDir, 'job-2-src.mp4'))).toBe(false);
    expect(existsSync(join(workDir, 'job-2-out.mp4'))).toBe(false);
  });

  it('propagates a missing-source download error', async () => {
    const transcoder = stubTranscoder();
    const renderer = new StorageExportRenderer(storage.port, transcoder);

    await expect(
      renderer.render({ job: job(), sourceKey: 'quantcooks/nope.mp4' }, workDir),
    ).rejects.toThrow('NoSuchKey');
    expect(transcoder.renderCalls).toHaveLength(0);
  });
});

describe('scaleBoxFor / encodingFor / exportOutputKey (pure mapping)', () => {
  it('original resolution never scales', () => {
    expect(scaleBoxFor('original', { width: 3840, height: 2160 })).toBeUndefined();
  });

  it('caps the box at the source dimensions', () => {
    expect(scaleBoxFor('4k', { width: 1920, height: 1080 })).toBeUndefined();
    expect(scaleBoxFor('720p', { width: 3840, height: 2160 })).toEqual({
      width: 1280,
      height: 720,
    });
    expect(scaleBoxFor('720p', null)).toEqual({ width: 1280, height: 720 });
  });

  it('lossless is CRF 0 regardless of ladder', () => {
    expect(encodingFor('720p', 'lossless', { width: 1280, height: 720 }, undefined)).toEqual({
      crf: 0,
    });
  });

  it('builds the sibling-prefix output key', () => {
    expect(exportOutputKey({ id: 'j1', projectId: 'p1', userId: 'u1' })).toBe(
      'quantcooks/u1/p1/exports/j1.mp4',
    );
  });
});
