// ============================================================================
// QuantCooks - Craft Render Service (Prisma-backed, C-2)
// ============================================================================
//
// Persists EffectCraft companion renders as EditCraftRenderJob rows — the
// CP-1 job kind CRAFT_RENDER (§5.8) on a dedicated sibling table, in the
// exact conventions ExportService (P0-4) established for EditExportJob:
//
//  - Status vocabulary is exactly QUEUED | PROCESSING | COMPLETED | FAILED.
//  - Claims are atomic: `updateMany({ where: { id, status: 'QUEUED' } })`.
//  - ALL status writes go through this service's transition methods.
//  - Progress is the binary's own frames-done ratio, wired from its
//    --progress lines by the processor (CP-1 §5.5's named exception to
//    coarse progress) — clamped to [10, 99] while PROCESSING so 100 only
//    ever means COMPLETED, and 0 only ever means QUEUED.
//  - Ownership: rows carry userId; caller-scoped reads answer 404 (not 403)
//    for other users' jobs, matching AssetService/ExportService. Legacy
//    userId = null rows stay visible to any authenticated caller.
//  - Credits (CP-1 §6.3 has NO rate row for CRAFT_RENDER yet — pricing
//    policy is reserved to Krish/CEO, CP-1 §14 open decision 1): jobs record
//    `creditCost: 0` and every response states `metering: 'not_wired'`,
//    exactly the pre-CP-2 surface CP-1 §3.5 pins for run_auto_edit. No
//    number is displayed as a charge that the ledger never made; CP-2 turns
//    the recorded quote into a real reserve/settle without a shape change.
//
// Why a dedicated table and not CP-1's EditJob: CP-1 §5.1 J1 + §12 step 1
// assign the generalised EditJob table and its JobService to the CP-1 unit
// itself — the same pattern by which P0-4 landed EditExportJob and CP-1
// freezes/folds it later. This model's columns mirror EditJob's
// CRAFT_RENDER subset so that fold-in is mechanical.
//
// Fail-closed configuration: the service is constructed with the companion
// runner (or null). With null, createRender refuses with 503
// CRAFT_NOT_CONFIGURED naming the companion (CP-1 §8 matrix) and NO job row
// is created — a job that can never run is never queued. Reads of persisted
// jobs keep working (metadata reads, CP-1 §8's storage-row principle).
// ============================================================================

import { createAppError } from '@quant/server-core';
import type { StoragePort } from './storage.adapter';
import { validateEcproj, type EffectCraftRunner } from './effectcraft.adapter';

export type CraftRenderStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface CraftRenderJob {
  id: string;
  projectId: string;
  userId: string | null;
  /** CP-1 job kind — constant for this service; stated so job surfaces that
   *  speak kinds (the Phase 2 job strip) need no special case. */
  kind: 'CRAFT_RENDER';
  /** Companion id (CP-1 §5.8). */
  provider: string;
  comp: string | null;
  format: string;
  resolution: string | null;
  quality: string | null;
  status: CraftRenderStatus;
  progress: number;
  stage: string | null;
  /** Whole credits recorded for this job. Always 0 until CP-2 wires the
   *  ledger; `metering` states why on every response. */
  creditCost: number;
  metering: 'not_wired';
  /** The rendered output as a real P0-3 asset (COMPLETED only). */
  outputAssetId: string | null;
  /** Fresh signed URL for the output asset, minted per response; null
   *  unless COMPLETED with storage configured. Never persisted. */
  outputUrl: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface CreateCraftRenderInput {
  projectId: string;
  /** The .ecproj document (parsed JSON). Validated structurally here and
   *  again by the adapter before any spawn. */
  ecproj: unknown;
  comp?: string;
  format?: string;
  resolution?: string;
  quality?: string;
  startSec?: number;
  endSec?: number;
  /** Supplied by the route from auth; optional so system/test callers can queue. */
  userId?: string;
}

/** Narrow prisma surface this service needs (DI'd for unit-testability). */
export interface CraftRenderPrisma {
  editCraftRenderJob: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findFirst: (args: Record<string, unknown>) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
  editAsset: {
    findFirst: (args: Record<string, unknown>) => Promise<any>;
  };
}

type CraftRenderJobRow = {
  id: string;
  projectId: string;
  userId: string | null;
  provider: string;
  comp: string | null;
  format: string;
  resolution: string | null;
  quality: string | null;
  status: string;
  progress: number;
  stage: string | null;
  params: unknown;
  creditCost: number;
  outputAssetId: string | null;
  externalRef: string | null;
  error: string | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

type AssetRowLike = {
  id: string;
  url: string | null;
  metadata: unknown;
};

const MAX_ERROR_LENGTH = 500;

/** Render formats this slice lands as video assets (CLI --format values). */
export const CRAFT_RENDER_FORMATS = ['h264', 'hevc', 'av1', 'prores', 'webm'] as const;
export const CRAFT_RENDER_RESOLUTIONS = ['full', 'half', 'third', 'quarter'] as const;
export const CRAFT_RENDER_QUALITIES = ['best', 'draft'] as const;

/** Output file extension + asset content type per render format. */
export function craftOutputMedia(format: string): { ext: string; contentType: string } {
  switch (format) {
    case 'webm':
      return { ext: 'webm', contentType: 'video/webm' };
    case 'prores':
      return { ext: 'mov', contentType: 'video/quicktime' };
    default:
      return { ext: 'mp4', contentType: 'video/mp4' };
  }
}

export class CraftRenderService {
  constructor(
    private readonly prisma: CraftRenderPrisma,
    private readonly storage: StoragePort | null,
    /** The companion runner, or null when EFFECTCRAFT_BIN is not configured
     *  / not executable. Only creation/execution consult it; reads do not. */
    private readonly craft: EffectCraftRunner | null,
  ) {}

  /** Fail-closed companion guard (CP-1 §8): 503 CRAFT_NOT_CONFIGURED. */
  requireCraft(): EffectCraftRunner {
    if (!this.craft) {
      throw createAppError(
        'Craft companion is not configured: EFFECTCRAFT_BIN is unset or not executable (companion: effectcraft)',
        503,
        'CRAFT_NOT_CONFIGURED',
      );
    }
    return this.craft;
  }

  get craftConfigured(): boolean {
    return this.craft !== null;
  }

  private async toJob(row: CraftRenderJobRow): Promise<CraftRenderJob> {
    let outputUrl: string | null = null;
    if (row.status === 'COMPLETED' && row.outputAssetId && this.storage) {
      const asset = (await this.prisma.editAsset.findFirst({
        where: { id: row.outputAssetId },
      })) as AssetRowLike | null;
      const meta =
        asset?.metadata && typeof asset.metadata === 'object'
          ? (asset.metadata as Record<string, unknown>)
          : {};
      const key =
        asset?.url ?? (typeof meta['storageKey'] === 'string' ? meta['storageKey'] : null);
      if (key && meta['uploadStatus'] === 'READY') {
        outputUrl = await this.storage.getSignedUrl(key);
      }
    }
    return {
      id: row.id,
      projectId: row.projectId,
      userId: row.userId ?? null,
      kind: 'CRAFT_RENDER',
      provider: row.provider,
      comp: row.comp ?? null,
      format: row.format,
      resolution: row.resolution ?? null,
      quality: row.quality ?? null,
      status: row.status as CraftRenderStatus,
      progress: row.progress ?? 0,
      stage: row.stage ?? null,
      creditCost: row.creditCost ?? 0,
      metering: 'not_wired',
      outputAssetId: row.outputAssetId ?? null,
      outputUrl,
      error: row.error ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt ?? null,
    };
  }

  /** Owner check that also admits legacy userId = null rows (see header). */
  private owns(row: CraftRenderJobRow, userId: string): boolean {
    return row.userId === null || row.userId === undefined || row.userId === userId;
  }

  private async findJobRow(jobId: string): Promise<CraftRenderJobRow> {
    const row = (await this.prisma.editCraftRenderJob.findFirst({
      where: { id: jobId },
    })) as CraftRenderJobRow | null;

    if (!row) {
      throw createAppError('Craft render job not found', 404, 'CRAFT_RENDER_NOT_FOUND');
    }
    return row;
  }

  private async findOwnedJobRow(jobId: string, userId?: string): Promise<CraftRenderJobRow> {
    const row = await this.findJobRow(jobId);
    if (userId !== undefined && !this.owns(row, userId)) {
      throw createAppError('Craft render job not found', 404, 'CRAFT_RENDER_NOT_FOUND');
    }
    return row;
  }

  /**
   * Queue a render. Refuses (503 CRAFT_NOT_CONFIGURED, no row) when the
   * companion is not configured, and (400 INVALID_ECPROJ, no row) when the
   * document fails the adapter's structural gate — a job that can never run
   * is never queued.
   */
  async createRender(input: CreateCraftRenderInput): Promise<CraftRenderJob> {
    this.requireCraft();

    const validation = validateEcproj(input.ecproj);
    if (!validation.ok) {
      throw createAppError(
        `Invalid .ecproj document: ${validation.errors.join('; ')}`,
        400,
        'INVALID_ECPROJ',
      );
    }

    const row = await this.prisma.editCraftRenderJob.create({
      data: {
        projectId: input.projectId,
        userId: input.userId ?? null,
        provider: 'effectcraft',
        comp: input.comp ?? null,
        format: input.format ?? 'h264',
        resolution: input.resolution ?? null,
        quality: input.quality ?? null,
        status: 'QUEUED',
        progress: 0,
        stage: null,
        // Provenance + the processor's input (CP-1 §5.2's params role). The
        // document rides here until CP-1's end-state, where params holds the
        // .ecproj ASSET id instead (§5.8) — that form needs an authoring
        // flow that produces .ecproj assets, which this slice is not.
        params: {
          ecproj: input.ecproj,
          ...(input.startSec != null ? { startSec: input.startSec } : {}),
          ...(input.endSec != null ? { endSec: input.endSec } : {}),
        },
        creditCost: 0,
        outputAssetId: null,
        externalRef: null,
        error: null,
        attempts: 0,
        completedAt: null,
      },
    });

    return this.toJob(row as CraftRenderJobRow);
  }

  async getRender(jobId: string, userId?: string): Promise<CraftRenderJob> {
    return this.toJob(await this.findOwnedJobRow(jobId, userId));
  }

  /** Raw row accessor for the processor (params carry the .ecproj document). */
  async getJobRow(jobId: string, userId?: string): Promise<CraftRenderJobRow> {
    return this.findOwnedJobRow(jobId, userId);
  }

  async listRenders(userId: string, projectId?: string): Promise<CraftRenderJob[]> {
    const rows = (await this.prisma.editCraftRenderJob.findMany({
      where: projectId ? { projectId } : {},
      orderBy: { createdAt: 'desc' },
    })) as CraftRenderJobRow[];

    const visible = rows.filter((r) => this.owns(r, userId));
    return Promise.all(visible.map((r) => this.toJob(r)));
  }

  // -------------------------------------------------------------------------
  // Processor transitions — the ONLY writers of PROCESSING/COMPLETED and of
  // processor-side FAILED. All are system-acting (no caller userId).
  // -------------------------------------------------------------------------

  /**
   * Atomically claim one specific QUEUED job: the updateMany matches only
   * while the row is still QUEUED, so a second claim affects 0 rows and
   * returns null. Increments attempts (CP-1 §5.4 lifecycle).
   */
  async claimJob(jobId: string): Promise<CraftRenderJob | null> {
    const current = (await this.prisma.editCraftRenderJob.findFirst({
      where: { id: jobId },
    })) as CraftRenderJobRow | null;
    if (!current) return null;

    const { count } = await this.prisma.editCraftRenderJob.updateMany({
      where: { id: jobId, status: 'QUEUED' },
      data: {
        status: 'PROCESSING',
        progress: 10,
        stage: 'rendering',
        attempts: (current.attempts ?? 0) + 1,
      },
    });
    if (count === 0) return null;

    return this.toJob(await this.findJobRow(jobId));
  }

  /** Claim the oldest QUEUED job (FIFO), or null when the queue is drained. */
  async claimNextQueued(): Promise<CraftRenderJob | null> {
    const next = (await this.prisma.editCraftRenderJob.findFirst({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
    })) as CraftRenderJobRow | null;

    if (!next) return null;
    return this.claimJob(next.id);
  }

  /**
   * Progress heartbeat (CP-1 §5.5): the binary's real frames-done percent,
   * clamped to [10, 99] while PROCESSING — 100 is reserved for COMPLETED.
   * Only a PROCESSING job can advance.
   */
  async updateProgress(jobId: string, percent: number): Promise<void> {
    const clamped = Math.max(10, Math.min(99, Math.round(percent)));
    await this.prisma.editCraftRenderJob.updateMany({
      where: { id: jobId, status: 'PROCESSING' },
      data: { progress: clamped },
    });
  }

  /**
   * Mark a claimed job COMPLETED with its output asset id. Returns null when
   * the job is no longer PROCESSING (left mid-flight): the caller must
   * discard the landed asset instead of resurrecting the job (P0-4 D4-6).
   */
  async completeJob(jobId: string, outputAssetId: string): Promise<CraftRenderJob | null> {
    const { count } = await this.prisma.editCraftRenderJob.updateMany({
      where: { id: jobId, status: 'PROCESSING' },
      data: {
        status: 'COMPLETED',
        progress: 100,
        stage: null,
        outputAssetId,
        error: null,
        completedAt: new Date(),
      },
    });
    if (count === 0) return null;

    return this.toJob(await this.findJobRow(jobId));
  }

  /** Terminate a job FAILED with a recorded reason (truncated at 500 chars). */
  async failJob(jobId: string, error: string): Promise<CraftRenderJob> {
    const message = error.slice(0, MAX_ERROR_LENGTH);
    const updated = await this.prisma.editCraftRenderJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', stage: null, error: message, completedAt: new Date() },
    });

    return this.toJob(updated as CraftRenderJobRow);
  }

  /**
   * Stale sweep: jobs left PROCESSING by a previous process incarnation,
   * untouched since `olderThan`, are terminally FAILED with
   * PROCESSOR_INTERRUPTED — never silently re-queued (a render is not
   * blind-retry-safe). Returns how many were swept.
   */
  async failStaleProcessing(olderThan: Date): Promise<number> {
    const stuck = (await this.prisma.editCraftRenderJob.findMany({
      where: { status: 'PROCESSING' },
    })) as CraftRenderJobRow[];

    let swept = 0;
    for (const row of stuck) {
      if (row.updatedAt.getTime() < olderThan.getTime()) {
        await this.failJob(row.id, 'PROCESSOR_INTERRUPTED');
        swept++;
      }
    }
    return swept;
  }
}
