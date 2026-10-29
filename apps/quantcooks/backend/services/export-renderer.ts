// ============================================================================
// QuantEdits - Storage-native export renderer (P0-4)
// ============================================================================
//
// The render step of the export pipeline, modelled on FfmpegAutoEditRenderer's
// shape (injectable transcoder, one input file → one MP4) but with the output
// model P0-4 requires: inputs are downloaded from P0-3 object storage and the
// rendered file is uploaded back to object storage — never a local dir + base
// URL string-concat (spec flag F5). The auto-edit renderer is untouched; this
// class is deliberately parallel to it, not a modification of it.
//
// Flow: StoragePort.download(sourceKey) → temp file → probe dimensions →
// VideoTranscoder.renderClip (with the P0-4 scale/bitrate/CRF options, so the
// job's resolution/quality are honoured instead of silently ignored) →
// StoragePort.upload(outputKey) → temp files removed in `finally`, on success
// AND on failure. Errors propagate with the real ffmpeg/storage message; the
// ExportProcessor records them on the job.
//
// The default VideoTranscoder is loaded lazily (dynamic import) so unit tests
// injecting a stub transcoder never load the @quant/media module graph — the
// same reason routes dynamic-import the storage adapter.
// ============================================================================

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { StoragePort } from './storage.adapter';

/** The renderClip options shape this renderer uses (subset of @quant/media's). */
export interface ExportRenderClipOptions {
  startSec?: number;
  durationSec?: number;
  width?: number;
  height?: number;
  videoBitrate?: string;
  crf?: number;
}

/** Narrow transcoder surface (DI'd for tests; VideoTranscoder satisfies it). */
export interface ExportTranscoder {
  renderClip(
    inputPath: string,
    outputPath: string,
    options?: ExportRenderClipOptions,
  ): Promise<{ outputPath: string; duration: number }>;
  getMediaInfo(inputPath: string): Promise<{
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    format?: { duration?: number };
  }>;
}

export interface ExportRenderRequest {
  job: {
    id: string;
    projectId: string;
    userId: string | null;
    format: string;
    resolution: string;
    quality: string;
  };
  /** P0-3 storage key of the source asset (EditAsset.url once READY). */
  sourceKey: string;
  trim?: { startSec: number; durationSec: number };
}

export interface ExportRenderer {
  render(
    req: ExportRenderRequest,
    workDir: string,
    hooks?: { onRendered?: () => Promise<void> | void },
  ): Promise<{ outputKey: string; durationSec: number }>;
}

export const RESOLUTION_BOXES: Record<string, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
};

interface SourceDimensions {
  width: number;
  height: number;
}

/**
 * Scale-to-fit box for a job resolution against the probed source: capped at
 * the source dimensions (never upscale); undefined when no scaling applies
 * (`original`, unknown resolution, or the box already equals the source).
 */
export function scaleBoxFor(
  resolution: string,
  source: SourceDimensions | null,
): { width: number; height: number } | undefined {
  if (resolution === 'original') return undefined;
  const box = RESOLUTION_BOXES[resolution];
  if (!box) return undefined;
  if (!source) return { ...box };

  const width = Math.min(box.width, source.width);
  const height = Math.min(box.height, source.height);
  if (width === source.width && height === source.height) return undefined;
  return { width, height };
}

/**
 * Quality → encoding: `lossless` is CRF 0; the rest scale the bitrate ladder
 * (720p 2500k / 1080p 5000k / 4k 15000k, mirroring @quant/media's
 * DEFAULT_PROFILES) by low 0.5× / medium 0.75× / high 1×, keyed by the
 * effective output height (scale box if scaling, else the source's).
 */
export function encodingFor(
  resolution: string,
  quality: string,
  source: SourceDimensions | null,
  scaleBox: { width: number; height: number } | undefined,
): { videoBitrate: string } | { crf: number } {
  if (quality === 'lossless') return { crf: 0 };

  const effectiveHeight =
    scaleBox?.height ?? source?.height ?? RESOLUTION_BOXES[resolution]?.height ?? 1080;
  const base = effectiveHeight <= 720 ? 2500 : effectiveHeight <= 1080 ? 5000 : 15000;
  const factor = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
  return { videoBitrate: `${Math.round(base * factor)}k` };
}

/** The sibling-prefix output key scheme from spec D3-3. */
export function exportOutputKey(job: { id: string; projectId: string; userId: string | null }): string {
  return `quantcooks/${job.userId ?? 'system'}/${job.projectId}/exports/${job.id}.mp4`;
}

export class StorageExportRenderer implements ExportRenderer {
  private transcoder: ExportTranscoder | null;

  constructor(
    private readonly storage: StoragePort,
    transcoder?: ExportTranscoder,
  ) {
    this.transcoder = transcoder ?? null;
  }

  private async requireTranscoder(): Promise<ExportTranscoder> {
    if (this.transcoder) return this.transcoder;
    const media = (await import('@quant/media')) as unknown as {
      VideoTranscoder: new () => ExportTranscoder;
    };
    this.transcoder = new media.VideoTranscoder();
    return this.transcoder;
  }

  async render(
    req: ExportRenderRequest,
    workDir: string,
    hooks?: { onRendered?: () => Promise<void> | void },
  ): Promise<{ outputKey: string; durationSec: number }> {
    const transcoder = await this.requireTranscoder();
    await mkdir(workDir, { recursive: true });

    const srcExt = extname(req.sourceKey) || '.mp4';
    const srcPath = join(workDir, `${req.job.id}-src${srcExt}`);
    const outPath = join(workDir, `${req.job.id}-out.mp4`);

    try {
      const download = await this.storage.download(req.sourceKey);
      await pipeline(download.body, createWriteStream(srcPath));

      let source: SourceDimensions | null = null;
      try {
        const info = await transcoder.getMediaInfo(srcPath);
        const video = info.streams?.find((s) => s.codec_type === 'video');
        if (video?.width && video?.height) {
          source = { width: video.width, height: video.height };
        }
      } catch {
        // Probing is best-effort: without dimensions we fall back to the
        // job's resolution box uncapped. A genuinely unreadable source fails
        // at renderClip below, with the real ffmpeg error.
      }

      const scaleBox = scaleBoxFor(req.job.resolution, source);
      const options: ExportRenderClipOptions = {
        ...(req.trim
          ? { startSec: req.trim.startSec, durationSec: req.trim.durationSec }
          : {}),
        ...(scaleBox ? { width: scaleBox.width, height: scaleBox.height } : {}),
        ...encodingFor(req.job.resolution, req.job.quality, source, scaleBox),
      };

      const rendered = await transcoder.renderClip(srcPath, outPath, options);

      // Render is done, upload is not: the processor writes progress 70 here.
      await hooks?.onRendered?.();

      const outputKey = exportOutputKey(req.job);
      await this.storage.upload(outputKey, createReadStream(outPath), 'video/mp4');

      return { outputKey, durationSec: rendered.duration };
    } finally {
      await rm(srcPath, { force: true }).catch(() => undefined);
      await rm(outPath, { force: true }).catch(() => undefined);
    }
  }
}
