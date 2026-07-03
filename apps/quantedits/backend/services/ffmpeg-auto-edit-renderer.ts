// ============================================================================
// QuantEdits - Real ffmpeg-backed auto-edit renderer
// ============================================================================
//
// Implements AutoEditOrchestrator's RenderPort with the REAL, already-shipped
// fluent-ffmpeg pipeline from @quant/media (`VideoTranscoder.renderClip`) --
// previously the orchestrator only ever ran against the default `NullRenderer`
// (RENDER_NOT_CONFIGURED), even though a real ffmpeg renderer already existed
// elsewhere in the monorepo, just unwired to this pipeline.
//
// SOURCE RESOLUTION: `sourceRef` from the orchestrator is resolved to a local
// input file path via an injectable `SourceResolver` (download-then-render for
// a remote asset, or an identity resolver in tests / when the source is
// already a local path). This keeps the renderer itself dependency-free of any
// particular storage backend.
//
// FAIL CLOSED: this renderer is REAL ffmpeg work -- it is only wired in when
// an output directory is configured (env `AUTO_EDIT_OUTPUT_DIR` /
// `AUTO_EDIT_OUTPUT_BASE_URL`). Without that configuration the orchestrator
// keeps using the default `NullRenderer` (see routes/auto-edit.ts), so a
// missing/misconfigured render backend never fakes success.

import { join } from 'node:path';
import { VideoTranscoder } from '@quant/media';
import type { RenderInput, RenderPort, RenderResult } from './auto-edit-orchestrator.service';

/** Resolves a pipeline `sourceRef` to a local file path ffmpeg can read. */
export interface SourceResolver {
  resolve(sourceRef: string): Promise<string>;
}

/** Identity resolver: treats `sourceRef` as already being a local file path. */
export class LocalPathSourceResolver implements SourceResolver {
  async resolve(sourceRef: string): Promise<string> {
    return sourceRef;
  }
}

export interface FfmpegAutoEditRendererOptions {
  /** Directory rendered MP4s are written to. */
  outputDir: string;
  /** Public base URL the output directory is served from (e.g. a CDN/S3 prefix). */
  outputBaseUrl: string;
  sourceResolver?: SourceResolver;
  transcoder?: VideoTranscoder;
  generateId?: () => string;
}

/**
 * Real render implementation: resolve the source -> ffmpeg re-encode (with an
 * optional template-driven trim/caption) -> a servable output URL.
 */
export class FfmpegAutoEditRenderer implements RenderPort {
  private readonly outputDir: string;
  private readonly outputBaseUrl: string;
  private readonly sourceResolver: SourceResolver;
  private readonly transcoder: VideoTranscoder;
  private readonly generateId: () => string;

  constructor(options: FfmpegAutoEditRendererOptions) {
    this.outputDir = options.outputDir;
    this.outputBaseUrl = options.outputBaseUrl.replace(/\/$/, '');
    this.sourceResolver = options.sourceResolver ?? new LocalPathSourceResolver();
    this.transcoder = options.transcoder ?? new VideoTranscoder();
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  async render(input: RenderInput): Promise<RenderResult> {
    try {
      const inputPath = await this.sourceResolver.resolve(input.sourceRef);
      const outputFile = `${this.generateId()}.mp4`;
      const outputPath = join(this.outputDir, outputFile);

      const template = resolveTemplate(input.templateId);
      await this.transcoder.renderClip(inputPath, outputPath, template);

      return { ok: true, outputUrl: `${this.outputBaseUrl}/${outputFile}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'RENDER_FAILED';
      return { ok: false, error: message };
    }
  }
}

/**
 * Minimal template -> render-option mapping. Templates are keyed by id;
 * unknown/absent templateId renders the source unmodified (no trim, no
 * caption). Extending this catalog is additive -- it never changes the
 * fail-closed contract of the renderer itself.
 */
function resolveTemplate(templateId: string | undefined): {
  startSec?: number;
  durationSec?: number;
  caption?: string;
} {
  switch (templateId) {
    case 'daily-recap-30s':
      return { startSec: 0, durationSec: 30, caption: 'Daily Recap' };
    case 'highlight-60s':
      return { startSec: 0, durationSec: 60 };
    default:
      return {};
  }
}
