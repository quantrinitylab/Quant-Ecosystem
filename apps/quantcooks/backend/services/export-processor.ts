// ============================================================================
// QuantEdits - Export Processor (in-process DB-polling worker, P0-4)
// ============================================================================
//
// The missing piece that made exports stay QUEUED forever: something that
// actually processes the persisted jobs. Design decision D4-1: an in-process
// DB-polling worker — NOT BullMQ/@quant/queue (the documented CP-1 scale-out
// path). EditExportJob already has the exact shape a poller needs, staging
// runs a single backend container, and the claim seam is a single function
// (ExportService.claimNextQueued, backed by an atomic updateMany), so
// swapping the poller for a queue consumer later touches one place.
//
// Lifecycle rules:
//  - Started ONLY from backend/server.ts, and only when storage is
//    configured (buildStoragePort() non-null) and EXPORT_PROCESSOR_DISABLED
//    is not '1'. With no storage the processor never starts and jobs stay
//    honestly QUEUED — never fake progress (D4-2).
//  - Concurrency 1: ffmpeg is CPU-bound and staging is one container; a
//    `processing` flag prevents overlapping ticks from double-claiming work
//    in-process (the atomic claim protects across processes).
//  - On start, a stale sweep fails PROCESSING jobs left behind by a previous
//    incarnation (updatedAt older than staleMs, default 15 min) with
//    PROCESSOR_INTERRUPTED (D4-7).
//  - Every failure terminates FAILED with the real reason: unsupported
//    format, missing project, no renderable source, or the renderer's error.
//    Nothing can sit in QUEUED/PROCESSING forever once this runs.
//  - Render source (D4-3): the project's primary video layer asset — the
//    first `type='video'` layer (order asc) whose content.assetId resolves
//    to a READY asset — falling back to the project's earliest READY video
//    asset. Multi-layer timeline composition exists nowhere in the monorepo
//    and is explicitly out of scope; the rendered output is that primary
//    source, trimmed/re-encoded per the job's settings.
// ============================================================================

import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExportJob, ExportService } from './export.service';
import type { ExportRenderer } from './export-renderer';
import type { StoragePort } from './storage.adapter';

/** Narrow prisma surface for source resolution (DI'd for unit-testability). */
export interface ExportSourcePrisma {
  editProject: {
    findFirst: (args: Record<string, unknown>) => Promise<any>;
  };
  editLayer: {
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
  };
  editAsset: {
    findFirst: (args: Record<string, unknown>) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
  };
}

interface AssetRowLike {
  id: string;
  projectId: string;
  type: string;
  url: string | null;
  metadata: unknown;
  createdAt: Date;
}

interface LayerRowLike {
  id: string;
  projectId: string;
  type: string;
  order: number;
  startTime: number;
  endTime: number;
  content: unknown;
}

export interface ResolvedSource {
  sourceKey: string;
  assetId: string;
  trim?: { startSec: number; durationSec: number };
}

function metadataOf(row: AssetRowLike): Record<string, unknown> {
  if (row.metadata && typeof row.metadata === 'object') {
    return row.metadata as Record<string, unknown>;
  }
  if (typeof row.metadata === 'string') {
    try {
      const parsed = JSON.parse(row.metadata) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      /* fall through to empty */
    }
  }
  return {};
}

/** A READY asset has its object key persisted (url column) and READY status. */
function readyKey(row: AssetRowLike): string | null {
  const meta = metadataOf(row);
  if (meta['uploadStatus'] !== 'READY') return null;
  return row.url ?? (typeof meta['storageKey'] === 'string' ? meta['storageKey'] : null);
}

function assetIdOf(content: unknown): string | null {
  if (content && typeof content === 'object') {
    const assetId = (content as Record<string, unknown>)['assetId'];
    if (typeof assetId === 'string' && assetId.length > 0) return assetId;
  }
  return null;
}

export interface ExportProcessorDeps {
  service: ExportService;
  renderer: ExportRenderer;
  prisma: ExportSourcePrisma;
  /** Storage for discarding a mid-flight-cancelled job's output (D4-6). */
  storage?: StoragePort | null;
  pollMs?: number;
  staleMs?: number;
  workDir?: string;
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
}

const DEFAULT_POLL_MS = 2000;
const DEFAULT_STALE_MS = 15 * 60 * 1000;

export class ExportProcessor {
  private readonly service: ExportService;
  private readonly renderer: ExportRenderer;
  private readonly prisma: ExportSourcePrisma;
  private readonly storage: StoragePort | null;
  private readonly pollMs: number;
  private readonly staleMs: number;
  private readonly workDir: string;
  private readonly logger: { info: (msg: string) => void; error: (msg: string) => void };

  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(deps: ExportProcessorDeps) {
    this.service = deps.service;
    this.renderer = deps.renderer;
    this.prisma = deps.prisma;
    this.storage = deps.storage ?? null;
    this.pollMs = deps.pollMs ?? DEFAULT_POLL_MS;
    this.staleMs = deps.staleMs ?? DEFAULT_STALE_MS;
    this.workDir =
      deps.workDir ?? process.env['EXPORT_WORK_DIR'] ?? join(tmpdir(), 'quantcooks-exports');
    this.logger = deps.logger ?? {
      // eslint-disable-next-line no-console
      info: (msg: string) => console.log(msg),
      // eslint-disable-next-line no-console
      error: (msg: string) => console.error(msg),
    };
  }

  /** Stale sweep, then poll on an interval plus an immediate first tick. */
  start(): void {
    if (this.timer) return;
    void this.sweepStale().catch((err: unknown) => {
      this.logger.error(
        `EXPORT_PROCESSOR stale sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    this.timer = setInterval(() => {
      void this.tick().catch((err: unknown) => {
        this.logger.error(
          `EXPORT_PROCESSOR tick failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, this.pollMs);
    // Do not keep the process alive solely for polling (server.ts owns the
    // listener); unref where the platform supports it.
    (this.timer as unknown as { unref?: () => void }).unref?.();
    void this.tick().catch(() => undefined);
  }

  /** Stop polling. An in-flight job is left to finish/fail on its own path. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Fail PROCESSING jobs untouched since (now - staleMs). Returns the count. */
  async sweepStale(now: Date = new Date()): Promise<number> {
    return this.service.failStaleProcessing(new Date(now.getTime() - this.staleMs));
  }

  /**
   * One poll cycle: claim the oldest QUEUED job and process it to a terminal
   * state. Returns true when a job was claimed. Exposed for tests.
   */
  async tick(): Promise<boolean> {
    if (this.processing) return false;
    this.processing = true;
    try {
      const job = await this.service.claimNextQueued();
      if (!job) return false;
      await this.processJob(job);
      return true;
    } finally {
      this.processing = false;
    }
  }

  /** Process one already-claimed (PROCESSING) job to COMPLETED or FAILED. */
  async processJob(job: ExportJob): Promise<void> {
    try {
      // Format gate first (D4-4): renderClip can only produce mp4. Anything
      // else terminates FAILED immediately — no renderer call, no hang, and
      // never an mp4 mislabelled as another format.
      if (job.format !== 'mp4') {
        await this.service.failJob(
          job.id,
          'EXPORT_FORMAT_NOT_SUPPORTED: only mp4 rendering is available',
        );
        return;
      }

      const source = await this.resolveSource(job);
      if ('error' in source) {
        await this.service.failJob(job.id, source.error);
        return;
      }

      const jobWorkDir = join(this.workDir, job.id);
      await mkdir(jobWorkDir, { recursive: true });
      try {
        const { outputKey } = await this.renderer.render(
          {
            job: {
              id: job.id,
              projectId: job.projectId,
              userId: job.userId,
              format: job.format,
              resolution: job.resolution,
              quality: job.quality,
            },
            sourceKey: source.sourceKey,
            ...(source.trim ? { trim: source.trim } : {}),
          },
          jobWorkDir,
          {
            onRendered: async () => {
              await this.service.updateProgress(job.id, 70);
            },
          },
        );

        const completed = await this.service.completeJob(job.id, outputKey);
        if (!completed) {
          // D4-6: the job left PROCESSING mid-flight (cancelled/deleted).
          // Discard the uploaded object; never resurrect the job.
          if (this.storage) {
            await this.storage.delete(outputKey).catch(() => undefined);
          }
          this.logger.info(
            `EXPORT_PROCESSOR job ${job.id} was no longer PROCESSING at completion; output discarded`,
          );
        }
      } finally {
        await rm(jobWorkDir, { recursive: true, force: true }).catch(() => undefined);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.service.failJob(job.id, message).catch(() => undefined);
    }
  }

  /**
   * Resolve the render source for a job (D4-3). Returns either the resolved
   * source or a terminal `{ error }` the caller records via failJob.
   */
  async resolveSource(
    job: ExportJob,
  ): Promise<ResolvedSource | { error: string }> {
    const project = (await this.prisma.editProject.findFirst({
      where: { id: job.projectId, deletedAt: null },
    })) as { id: string } | null;

    if (!project) {
      return { error: 'PROJECT_NOT_FOUND' };
    }

    const layers = (await this.prisma.editLayer.findMany({
      where: { projectId: job.projectId },
      orderBy: { order: 'asc' },
    })) as LayerRowLike[];

    for (const layer of layers) {
      if (layer.type !== 'video') continue;
      const assetId = assetIdOf(layer.content);
      if (!assetId) continue;

      const asset = (await this.prisma.editAsset.findFirst({
        where: { id: assetId },
      })) as AssetRowLike | null;
      if (!asset) continue;

      const key = readyKey(asset);
      if (!key) continue;

      const trim =
        layer.endTime > layer.startTime
          ? { startSec: layer.startTime, durationSec: layer.endTime - layer.startTime }
          : undefined;

      return { sourceKey: key, assetId: asset.id, ...(trim ? { trim } : {}) };
    }

    // Fallback: the project's earliest READY video asset.
    const assets = (await this.prisma.editAsset.findMany({
      where: { projectId: job.projectId, type: 'video' },
      orderBy: { createdAt: 'asc' },
    })) as AssetRowLike[];

    for (const asset of assets) {
      const key = readyKey(asset);
      if (key) return { sourceKey: key, assetId: asset.id };
    }

    return {
      error: 'NO_RENDERABLE_SOURCE: project has no READY video asset to render',
    };
  }
}
