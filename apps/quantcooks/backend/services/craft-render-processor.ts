// ============================================================================
// QuantCooks - Craft Render Processor (C-2)
// ============================================================================
//
// In-process, DB-polling processor for EffectCraft companion renders — the
// P0-4 ExportProcessor pattern, adapted to the companion's realities:
//
//  - Started ONLY from server.ts, and only when the companion binary is
//    configured (EFFECTCRAFT_BIN resolves and the kill switch is off). No
//    binary -> no processor exists and no render can even be created
//    (the service refuses creation with CRAFT_NOT_CONFIGURED).
//  - Unlike exports, a craft render CAN be claimed without storage — but it
//    can never COMPLETE: the brief's rule is fail honestly at claim time
//    with the precise code, not hang. A job claimed while storage is
//    unconfigured terminates FAILED 'STORAGE_NOT_CONFIGURED' before the
//    binary is ever spawned.
//  - Concurrency is 1: the companion's own MCP surface refuses a second
//    concurrent render, and the CLI path must self-limit (spike §5 step 2).
//  - Progress is wired from the binary's real --progress lines through the
//    adapter into CraftRenderService.updateProgress (CP-1 §5.5 names this
//    wiring as the heartbeat source).
//  - On completion the rendered file lands through the P0-3 seam: a real
//    EditAsset row (upload-url -> storage.upload -> complete) whose id the
//    job records as outputAssetId. Downloaded bytes never persist as URLs —
//    the asset row's stored `url` is the object key; signed URLs are minted
//    per response by the service.
//  - At start, PROCESSING jobs left by a previous incarnation (older than
//    staleMs) are swept to FAILED/PROCESSOR_INTERRUPTED, and the in-flight
//    job of THIS instance is failed the same way if the process stops
//    mid-render (the child is killed — a restart never leaves a phantom).
//
// The per-job workspace is removed in `finally` on success and failure.
// ============================================================================

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CraftRenderJob, CraftRenderService } from './craft-render.service';
import { craftOutputMedia } from './craft-render.service';
import type { AssetService } from './asset.service';
import type { StoragePort } from './storage.adapter';
import {
  renderWithEffectCraft,
  type EffectCraftRunner,
  type FinalizeOutcome,
} from './effectcraft.adapter';

export interface CraftRenderProcessorDeps {
  service: CraftRenderService;
  assets: AssetService;
  runner: EffectCraftRunner;
  storage: StoragePort | null;
  pollMs?: number;
  staleMs?: number;
  workDir?: string;
  logger?: Pick<typeof console, 'info' | 'error'>;
}

const DEFAULT_POLL_MS = 2_000;
const DEFAULT_STALE_MS = 15 * 60 * 1000;

export class CraftRenderProcessor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private currentJobId: string | null = null;

  constructor(private readonly deps: CraftRenderProcessorDeps) {}

  private get pollMs(): number {
    return this.deps.pollMs ?? DEFAULT_POLL_MS;
  }

  private get staleMs(): number {
    return this.deps.staleMs ?? DEFAULT_STALE_MS;
  }

  private get workDir(): string {
    return this.deps.workDir ?? process.env['CRAFT_RENDER_WORK_DIR'] ?? tmpdir();
  }

  private get log(): Pick<typeof console, 'info' | 'error'> {
    return this.deps.logger ?? console;
  }

  /** Begin polling. Safe to call repeatedly. */
  async start(): Promise<void> {
    if (this.timer) return;

    const cutoff = new Date(Date.now() - this.staleMs);
    const swept = await this.deps.service.failStaleProcessing(cutoff);
    if (swept > 0) {
      this.log.info(`[quantcooks] craft render processor swept ${swept} stale PROCESSING job(s)`);
    }

    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        this.log.error('[quantcooks] craft render processor tick failed', error);
      });
    }, this.pollMs);
    // Polling must never keep a dying process alive.
    (this.timer as unknown as { unref?: () => void }).unref?.();

    void this.tick().catch((error) => {
      this.log.error('[quantcooks] craft render processor initial tick failed', error);
    });
  }

  /** Stop polling; an in-flight job is failed honestly, never orphaned. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.currentJobId) {
      try {
        await this.deps.service.failJob(this.currentJobId, 'PROCESSOR_INTERRUPTED');
      } catch {
        // Best effort — the stale sweep on the next boot finishes the job.
      }
    }
  }

  /**
   * One poll: claim the oldest QUEUED job and process it to a terminal
   * state, never overlapping with itself. Bounded per call (one job) —
   * the next job is picked up on the next interval.
   */
  async tick(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const job = await this.deps.service.claimNextQueued();
      if (!job) return;
      this.currentJobId = job.id;
      await this.processJob(job);
    } finally {
      this.currentJobId = null;
      this.processing = false;
    }
  }

  /** Process one claimed job end-to-end. Never throws. */
  async processJob(job: CraftRenderJob): Promise<void> {
    const { service } = this.deps;
    try {
      // A render with storage unconfigured cannot complete and must fail
      // honestly at claim time with the precise code — not hang, not spawn.
      if (!this.deps.storage) {
        await service.failJob(
          job.id,
          'STORAGE_NOT_CONFIGURED: craft render output cannot be stored (no S3/R2 storage configured)',
        );
        return;
      }

      const row = await service.getJobRow(job.id);
      const params =
        row && typeof (row as { params?: unknown }).params === 'object'
          ? ((row as { params: Record<string, unknown> }).params ?? {})
          : {};
      const ecproj = params['ecproj'];

      const { ext, contentType } = craftOutputMedia(job.format);
      const workDir = await mkdtemp(join(this.workDir, 'quantcooks-craft-'));
      const outputPath = join(workDir, `render.${ext}`);

      try {
        const outcome: FinalizeOutcome = await renderWithEffectCraft({
          ecprojJson: ecproj,
          outputPath,
          comp: job.comp ?? undefined,
          format: job.format,
          resolution: job.resolution ?? undefined,
          quality: job.quality ?? undefined,
          startSec:
            typeof params['startSec'] === 'number' ? (params['startSec'] as number) : undefined,
          endSec: typeof params['endSec'] === 'number' ? (params['endSec'] as number) : undefined,
          runner: this.deps.runner,
          onProgress: (percent) => {
            void service.updateProgress(job.id, percent).catch(() => undefined);
          },
        });

        if (outcome.status === 'FAILED') {
          await service.failJob(job.id, outcome.error);
          return;
        }

        // Land the render through the P0-3 seam as a real asset row.
        const body = await readFile(outputPath);
        const filename = `${(job.comp ?? 'composition').replace(/[^\w.-]+/g, '_')}-render.${ext}`;
        const ownerId = job.userId ?? 'system';
        const upload = await this.deps.assets.generateUploadUrl(ownerId, {
          projectId: job.projectId,
          filename,
          contentType,
          size: body.byteLength,
        });
        await this.deps.storage.upload(upload.key, body, contentType);
        const asset = await this.deps.assets.completeUpload(upload.assetId, ownerId);

        const completed = await service.completeJob(job.id, asset.id);
        if (!completed) {
          // The job left PROCESSING mid-flight (sweep/shutdown): discard the
          // output instead of completing a job nobody owns (P0-4 D4-6).
          try {
            await this.deps.storage.delete(upload.key);
          } catch {
            /* best effort */
          }
          try {
            await this.deps.assets.deleteAsset(asset.id, ownerId);
          } catch {
            /* best effort */
          }
          return;
        }
      } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await service.failJob(job.id, message);
      } catch (failError) {
        this.log.error('[quantcooks] craft render processor could not fail job', job.id, failError);
      }
    }
  }

  /** Test/ops introspection: is a render in flight right now? */
  get isProcessing(): boolean {
    return this.processing;
  }
}
