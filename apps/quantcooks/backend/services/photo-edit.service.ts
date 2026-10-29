// ============================================================================
// QuantCooks - Photo Edit Service (Prisma-backed, C-3B)
// ============================================================================
//
// Persists PhotoCraft companion photo edits as EditPhotoEditJob rows — the
// CP-1 job-model pattern CraftRenderService (C-2) established, on a
// dedicated sibling table (see migration 0109 for why not EditJob):
//
//  - Status vocabulary is exactly QUEUED | PROCESSING | COMPLETED | FAILED.
//  - Claims are atomic: `updateMany({ where: { id, status: 'QUEUED' } })`.
//  - ALL status writes go through this service's transition methods.
//  - Progress is coarse and truthful: 0 QUEUED -> 10 at claim -> 70 once
//    the companion has produced the output and it is being stored -> 100
//    only on COMPLETED. The one-shot CLI emits no progress stream (unlike
//    EffectCraft's --progress lines), so no finer number is ever claimed.
//  - Ownership: rows carry userId; caller-scoped reads answer 404 (not 403)
//    for other users' jobs, matching AssetService/ExportService. Legacy
//    userId = null rows stay visible to any authenticated caller.
//  - Credits (CP-1 §6.3 has NO rate row for photo edits yet — pricing
//    policy is reserved to Krish/CEO, CP-1 §14 open decision 1): jobs
//    record `creditCost: 0` and every response states
//    `metering: 'not_wired'`, exactly the pre-CP-2 surface C-2 pinned for
//    craft renders. No number is displayed as a charge the ledger never
//    made; CP-2 turns the recorded quote into a real reserve/settle
//    without a shape change.
//
// Creation is guarded three ways, all before a row exists:
//  1. Companion guard: no PHOTOCRAFT_BIN runner -> 503 PHOTO_NOT_CONFIGURED
//     naming the companion, NO job row (a job that can never run is never
//     queued). Reads of persisted jobs keep working (metadata reads).
//  2. Operations guard: the operations[] list is validated against the
//     adapter's verified allowlist -> 400 INVALID_OPERATIONS, no row.
//  3. Source guard: the source asset must exist, be the caller's, be READY
//     (bytes actually in storage) and be an image -> 404 ASSET_NOT_FOUND /
//     400 ASSET_NOT_READY / 400 SOURCE_NOT_IMAGE. The job's projectId is
//     DERIVED from the source asset: outputs land in the source's project,
//     and the source itself is never mutated (the processor reads its
//     bytes; the output is a new asset).
// ============================================================================

import { createAppError } from '@quant/server-core';
import type { StoragePort } from './storage.adapter';
import {
  validateOperations,
  type PhotoCraftRunner,
  type PhotoOperation,
} from './photocraft.adapter';

export type PhotoEditStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface PhotoEditJob {
  id: string;
  /** Derived from the source asset at creation — outputs land here. */
  projectId: string;
  userId: string | null;
  /** CP-1 job kind for this surface. */
  kind: 'PHOTO_EDIT';
  /** Companion id. */
  provider: string;
  sourceAssetId: string;
  outputFormat: string;
  /** The allowlist-validated operations this job runs, in order. */
  operations: PhotoOperation[];
  status: PhotoEditStatus;
  progress: number;
  stage: string | null;
  /** Whole credits recorded for this job. Always 0 until CP-2 wires the
   *  ledger; `metering` states why on every response. */
  creditCost: number;
  metering: 'not_wired';
  /** The edited output as a real P0-3 asset (COMPLETED only). */
  outputAssetId: string | null;
  /** Fresh signed URL for the output asset, minted per response; null
   *  unless COMPLETED with storage configured. Never persisted. */
  outputUrl: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface CreatePhotoEditInput {
  sourceAssetId: string;
  operations: PhotoOperation[];
  outputFormat?: string;
  /** Supplied by the route/tool from auth; optional for system callers. */
  userId?: string;
}

/** Narrow prisma surface this service needs (DI'd for unit-testability). */
export interface PhotoEditPrisma {
  editPhotoEditJob: {
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

type PhotoEditJobRow = {
  id: string;
  projectId: string;
  userId: string | null;
  provider: string;
  sourceAssetId: string;
  outputFormat: string;
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

export type SourceAssetRow = {
  id: string;
  projectId: string;
  userId: string | null;
  filename: string;
  type: string;
  url: string | null;
  metadata: unknown;
};

type AssetRowLike = {
  id: string;
  url: string | null;
  metadata: unknown;
};

const MAX_ERROR_LENGTH = 500;

/** Output formats the companion writes by extension (Phase-1 verified). */
export const PHOTO_OUTPUT_FORMATS = ['png', 'jpg', 'webp', 'psd'] as const;

/** Output file extension + asset content type per output format. */
export function photoOutputMedia(format: string): { ext: string; contentType: string } {
  switch (format) {
    case 'jpg':
      return { ext: 'jpg', contentType: 'image/jpeg' };
    case 'webp':
      return { ext: 'webp', contentType: 'image/webp' };
    case 'psd':
      return { ext: 'psd', contentType: 'image/vnd.adobe.photoshop' };
    default:
      return { ext: 'png', contentType: 'image/png' };
  }
}

function operationsOf(params: unknown): PhotoOperation[] {
  if (params && typeof params === 'object') {
    const ops = (params as Record<string, unknown>)['operations'];
    if (Array.isArray(ops)) return ops as PhotoOperation[];
  }
  return [];
}

export class PhotoEditService {
  constructor(
    private readonly prisma: PhotoEditPrisma,
    private readonly storage: StoragePort | null,
    /** The companion runner, or null when PHOTOCRAFT_BIN is not configured
     *  / not executable. Only creation/execution consult it; reads do not. */
    private readonly photo: PhotoCraftRunner | null,
  ) {}

  /** Fail-closed companion guard (CP-1 §8): 503 PHOTO_NOT_CONFIGURED. */
  requirePhoto(): PhotoCraftRunner {
    if (!this.photo) {
      throw createAppError(
        'Photo companion is not configured: PHOTOCRAFT_BIN is unset or not executable (companion: photocraft)',
        503,
        'PHOTO_NOT_CONFIGURED',
      );
    }
    return this.photo;
  }

  get photoConfigured(): boolean {
    return this.photo !== null;
  }

  private async toJob(row: PhotoEditJobRow): Promise<PhotoEditJob> {
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
      kind: 'PHOTO_EDIT',
      provider: row.provider,
      sourceAssetId: row.sourceAssetId,
      outputFormat: row.outputFormat,
      operations: operationsOf(row.params),
      status: row.status as PhotoEditStatus,
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
  private owns(row: { userId: string | null }, userId: string): boolean {
    return row.userId === null || row.userId === undefined || row.userId === userId;
  }

  private async findJobRow(jobId: string): Promise<PhotoEditJobRow> {
    const row = (await this.prisma.editPhotoEditJob.findFirst({
      where: { id: jobId },
    })) as PhotoEditJobRow | null;

    if (!row) {
      throw createAppError('Photo edit job not found', 404, 'PHOTO_EDIT_NOT_FOUND');
    }
    return row;
  }

  private async findOwnedJobRow(jobId: string, userId?: string): Promise<PhotoEditJobRow> {
    const row = await this.findJobRow(jobId);
    if (userId !== undefined && !this.owns(row, userId)) {
      throw createAppError('Photo edit job not found', 404, 'PHOTO_EDIT_NOT_FOUND');
    }
    return row;
  }

  /**
   * The raw source-asset row for the processor (storage key + filename).
   * System-acting (no caller userId): the job row itself is the authority
   * that this asset was the caller's at creation time.
   */
  async getSourceAssetRow(assetId: string): Promise<SourceAssetRow> {
    const row = (await this.prisma.editAsset.findFirst({
      where: { id: assetId },
    })) as SourceAssetRow | null;
    if (!row) {
      throw createAppError('Asset not found', 404, 'ASSET_NOT_FOUND');
    }
    return row;
  }

  /**
   * Queue a photo edit. Refuses — with NO job row — when the companion is
   * not configured (503), the operations fail the allowlist (400), or the
   * source asset fails the source guard (404/400): a job that can never
   * run is never queued.
   */
  async createEdit(input: CreatePhotoEditInput): Promise<PhotoEditJob> {
    this.requirePhoto();

    const validation = validateOperations(input.operations);
    if (!validation.ok) {
      throw createAppError(
        `Invalid operations: ${validation.errors.join('; ')}`,
        400,
        'INVALID_OPERATIONS',
      );
    }

    const asset = (await this.prisma.editAsset.findFirst({
      where: { id: input.sourceAssetId },
    })) as SourceAssetRow | null;
    if (!asset || (input.userId !== undefined && !this.owns(asset, input.userId))) {
      throw createAppError('Asset not found', 404, 'ASSET_NOT_FOUND');
    }
    const meta =
      asset.metadata && typeof asset.metadata === 'object'
        ? (asset.metadata as Record<string, unknown>)
        : {};
    if (meta['uploadStatus'] !== 'READY') {
      throw createAppError(
        'Source asset is not READY: its bytes have not finished uploading',
        400,
        'ASSET_NOT_READY',
      );
    }
    if (asset.type !== 'image') {
      throw createAppError(
        `Source asset is not an image (type: ${asset.type})`,
        400,
        'SOURCE_NOT_IMAGE',
      );
    }

    const row = await this.prisma.editPhotoEditJob.create({
      data: {
        projectId: asset.projectId,
        userId: input.userId ?? asset.userId ?? null,
        provider: 'photocraft',
        sourceAssetId: asset.id,
        outputFormat: input.outputFormat ?? 'png',
        status: 'QUEUED',
        progress: 0,
        stage: null,
        params: { operations: input.operations },
        creditCost: 0,
        outputAssetId: null,
        externalRef: null,
        error: null,
        attempts: 0,
        completedAt: null,
      },
    });

    return this.toJob(row as PhotoEditJobRow);
  }

  async getEdit(jobId: string, userId?: string): Promise<PhotoEditJob> {
    return this.toJob(await this.findOwnedJobRow(jobId, userId));
  }

  /** Raw row accessor for the processor. */
  async getJobRow(jobId: string, userId?: string): Promise<PhotoEditJobRow> {
    return this.findOwnedJobRow(jobId, userId);
  }

  async listEdits(userId: string, projectId?: string): Promise<PhotoEditJob[]> {
    const rows = (await this.prisma.editPhotoEditJob.findMany({
      where: projectId ? { projectId } : {},
      orderBy: { createdAt: 'desc' },
    })) as PhotoEditJobRow[];

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
  async claimJob(jobId: string): Promise<PhotoEditJob | null> {
    const current = (await this.prisma.editPhotoEditJob.findFirst({
      where: { id: jobId },
    })) as PhotoEditJobRow | null;
    if (!current) return null;

    const { count } = await this.prisma.editPhotoEditJob.updateMany({
      where: { id: jobId, status: 'QUEUED' },
      data: {
        status: 'PROCESSING',
        progress: 10,
        stage: 'editing',
        attempts: (current.attempts ?? 0) + 1,
      },
    });
    if (count === 0) return null;

    return this.toJob(await this.findJobRow(jobId));
  }

  /** Claim the oldest QUEUED job (FIFO), or null when the queue is drained. */
  async claimNextQueued(): Promise<PhotoEditJob | null> {
    const next = (await this.prisma.editPhotoEditJob.findFirst({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
    })) as PhotoEditJobRow | null;

    if (!next) return null;
    return this.claimJob(next.id);
  }

  /**
   * Stage heartbeat: coarse, truthful progress only (see header) — clamped
   * to [10, 99] while PROCESSING; 100 is reserved for COMPLETED. Only a
   * PROCESSING job can advance.
   */
  async updateProgress(jobId: string, percent: number, stage?: string): Promise<void> {
    const clamped = Math.max(10, Math.min(99, Math.round(percent)));
    await this.prisma.editPhotoEditJob.updateMany({
      where: { id: jobId, status: 'PROCESSING' },
      data: { progress: clamped, ...(stage ? { stage } : {}) },
    });
  }

  /**
   * Mark a claimed job COMPLETED with its output asset id. Returns null when
   * the job is no longer PROCESSING (left mid-flight): the caller must
   * discard the landed asset instead of resurrecting the job (P0-4 D4-6).
   */
  async completeJob(jobId: string, outputAssetId: string): Promise<PhotoEditJob | null> {
    const { count } = await this.prisma.editPhotoEditJob.updateMany({
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
  async failJob(jobId: string, error: string): Promise<PhotoEditJob> {
    const message = error.slice(0, MAX_ERROR_LENGTH);
    const updated = await this.prisma.editPhotoEditJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', stage: null, error: message, completedAt: new Date() },
    });

    return this.toJob(updated as PhotoEditJobRow);
  }

  /**
   * Stale sweep: jobs left PROCESSING by a previous process incarnation,
   * untouched since `olderThan`, are terminally FAILED with
   * PROCESSOR_INTERRUPTED — never silently re-queued (an edit is not
   * blind-retry-safe). Returns how many were swept.
   */
  async failStaleProcessing(olderThan: Date): Promise<number> {
    const stuck = (await this.prisma.editPhotoEditJob.findMany({
      where: { status: 'PROCESSING' },
    })) as PhotoEditJobRow[];

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
