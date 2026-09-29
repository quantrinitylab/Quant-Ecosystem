import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import type { VideoTranscoder } from '@quant/media';
import {
  FfmpegAutoEditRenderer,
  LocalPathSourceResolver,
  type SourceResolver,
} from '../services/ffmpeg-auto-edit-renderer';

/** Minimal stub of VideoTranscoder exposing only renderClip. */
function stubTranscoder(
  impl: (inputPath: string, outputPath: string, opts: unknown) => Promise<unknown>,
): VideoTranscoder {
  return { renderClip: vi.fn(impl) } as unknown as VideoTranscoder;
}

describe('FfmpegAutoEditRenderer', () => {
  it('renders a real clip and returns a servable output URL', async () => {
    const transcoder = stubTranscoder(async (_i, outputPath) => ({ outputPath, duration: 30 }));
    const renderer = new FfmpegAutoEditRenderer({
      outputDir: '/tmp/out',
      outputBaseUrl: 'https://cdn.example.com/edits/',
      transcoder,
      generateId: () => 'fixed-id',
    });

    const result = await renderer.render({ userId: 'u1', sourceRef: '/local/src.mp4' });

    expect(result.ok).toBe(true);
    // trailing slash on base URL is normalized; id-based filename appended.
    expect(result.outputUrl).toBe('https://cdn.example.com/edits/fixed-id.mp4');
    expect(transcoder.renderClip).toHaveBeenCalledWith(
      '/local/src.mp4',
      join('/tmp/out', 'fixed-id.mp4'),
      {},
    );
  });

  it('applies the daily-recap-30s template (trim + caption)', async () => {
    const transcoder = stubTranscoder(async (_i, outputPath) => ({ outputPath, duration: 30 }));
    const renderer = new FfmpegAutoEditRenderer({
      outputDir: '/tmp/out',
      outputBaseUrl: 'https://cdn.example.com',
      transcoder,
      generateId: () => 'id2',
    });

    const result = await renderer.render({
      userId: 'u1',
      sourceRef: '/local/src.mp4',
      templateId: 'daily-recap-30s',
    });

    expect(result.ok).toBe(true);
    expect(transcoder.renderClip).toHaveBeenCalledWith(
      '/local/src.mp4',
      join('/tmp/out', 'id2.mp4'),
      {
        startSec: 0,
        durationSec: 30,
        caption: 'Daily Recap',
      },
    );
  });

  it('fails closed when the transcoder throws (never fabricates success)', async () => {
    const transcoder = stubTranscoder(async () => {
      throw new Error('ffmpeg exited 1');
    });
    const renderer = new FfmpegAutoEditRenderer({
      outputDir: '/tmp/out',
      outputBaseUrl: 'https://cdn.example.com',
      transcoder,
    });

    const result = await renderer.render({ userId: 'u1', sourceRef: '/local/src.mp4' });

    expect(result.ok).toBe(false);
    expect(result.outputUrl).toBeUndefined();
    expect(result.error).toBe('ffmpeg exited 1');
  });

  it('resolves the source via an injected SourceResolver before rendering', async () => {
    const resolver: SourceResolver = { resolve: vi.fn(async (ref) => `/downloaded/${ref}.mp4`) };
    const transcoder = stubTranscoder(async (_i, outputPath) => ({ outputPath, duration: 5 }));
    const renderer = new FfmpegAutoEditRenderer({
      outputDir: '/tmp/out',
      outputBaseUrl: 'https://cdn.example.com',
      transcoder,
      sourceResolver: resolver,
      generateId: () => 'id3',
    });

    await renderer.render({ userId: 'u1', sourceRef: 'remote-asset' });

    expect(resolver.resolve).toHaveBeenCalledWith('remote-asset');
    expect(transcoder.renderClip).toHaveBeenCalledWith(
      '/downloaded/remote-asset.mp4',
      join('/tmp/out', 'id3.mp4'),
      {},
    );
  });

  it('LocalPathSourceResolver returns the ref unchanged', async () => {
    const resolver = new LocalPathSourceResolver();
    await expect(resolver.resolve('/a/b.mp4')).resolves.toBe('/a/b.mp4');
  });
});
