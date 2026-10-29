// ============================================================================
// QuantEdits - Export Service (Prisma-backed, P0-4)
// ============================================================================
//
// This service used to keep export jobs in a private in-memory array and no
// code path anywhere ever transitioned a job out of QUEUED — exports stayed
// QUEUED forever and `outputUrl` stayed null. It is now backed by the real
// EditExportJob model (P0-1) through a DI'd narrow prisma surface — the same
// pattern ProjectService (P0-1) and AssetService (P0-3) use — plus a DI'd
// StoragePort over @quant/storage. Jobs survive a backend restart, and the
// ExportProcessor (export-processor.ts, started only from server.ts) drives
// them QUEUED → PROCESSING → COMPLETED/FAILED.
//
// Job-model conventions (deliberate; CP-1's unified QuantAI job model
// generalises THIS shape, so names stay clean and consistent):
//  - Status vocabulary is exactly QUEUED | PROCESSING | COMPLETED | FAILED.
//  - `progress` is coarse and truthful: 0 QUEUED → 10 on claim → 70 after
//    the render finishes (before upload completes the job) → 100 COMPLETED.
//    renderClip exposes no progress events; no interpolated numbers are
//    invented.
//  - The DB `outputUrl` column NEVER holds a signed URL (they expire). It
//    holds the object KEY once a job completes (same convention as
//    EditAsset.url in P0-3). Responses pass through toJob(), which replaces
//    the key with a fresh signed URL (1h) when storage is configured, else
//    null. The raw key is also exposed as `outputKey` for internal
//    consumers (the download route uses the service's raw accessor, not
//    this response shape).
//  - ALL status writes go through this service's transition methods
//    (claimJob / claimNextQueued / updateProgress / completeJob / failJob /
//    failStaleProcessing / cancelExport). No other code writes job status.
//  - Claims are atomic: `updateMany({ where: { id, status: 'QUEUED' } })`
//    transitions at most the one row still QUEUED, so two processors can
//    never take the same job.
//  - Ownership: rows carry userId. Caller-scoped reads/writes answer 404
//    (not 403) for other users' jobs, matching AssetService. Legacy rows
//    with userId = null (none can exist in a fresh DB) stay visible to any
//    authenticated caller. Processor-internal transitions take no userId —
//    they act on behalf of the system, not a caller.
// ============================================================================

import { createAppError } from '@quant/server-core';
import type { StoragePort } from './storage.adapter';

export type ExportStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ExportJob {
  id: string;
  projectId: string;
  userId: string | null;
  format: string;
  resolution: string;
  quality: string;
  status: ExportStatus;
  progress: number;
  /** Fresh signed download URL (COMPLETED + storage configured), else null. */
  outputUrl: string | null;
  /** Raw object-storage key of the rendered output (internal consumers). */
  outputKey: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface QueueExportInput {
  projectId: string;
  format: string;
  resolution: string;
  quality: string;
  /** Supplied by the route from auth; optional so system/test callers can queue. */
  userId?: string;
}

/** Narrow prisma surface this service needs (DI'd for unit-testability). */
export interface ExportPrisma {
  editExportJob: {
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
}

type ExportJobRow = {
  id: string;
  projectId: string;
  userId: string | null;
  format: string;
  resolution: string;
  quality: string;
  status: string;
  progress: number;
  outputUrl: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

const MAX_ERROR_LENGTH = 500;

export class ExportService {
  constructor(
    private readonly prisma: ExportPrisma,
    private readonly storage: StoragePort | null,
  ) {}

  private async toJob(row: ExportJobRow): Promise<ExportJob> {
    const key = row.outputUrl ?? null;
    const completed = row.status === 'COMPLETED' && key !== null;
    return {
      id: row.id,
      projectId: row.projectId,
      userId: row.userId ?? null,
      format: row.format,
      resolution: row.resolution,
      quality: row.quality,
      status: row.status as ExportStatus,
      progress: row.progress ?? 0,
      outputUrl: completed && this.storage ? await this.storage.getSignedUrl(key) : null,
      outputKey: key,
      error: row.error ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt ?? null,
    };
  }

  /** Owner check that also admits legacy userId = null rows (see header). */
  private owns(row: ExportJobRow, userId: string): boolean {
    return row.userId === null || row.userId === undefined || row.userId === userId;
  }

  private async findJobRow(exportId: string): Promise<ExportJobRow> {
    const row = (await this.prisma.editExportJob.findFirst({
      where: { id: exportId },
    })) as ExportJobRow | null;

    if (!row) {
      throw createAppError('Export job not found', 404, 'EXPORT_NOT_FOUND');
    }
    return row;
  }

  private async findOwnedJobRow(exportId: string, userId?: string): Promise<ExportJobRow> {
    const row = await this.findJobRow(exportId);
    if (userId !== undefined && !this.owns(row, userId)) {
      throw createAppError('Export job not found', 404, 'EXPORT_NOT_FOUND');
    }
    return row;
  }

  async queueExport(input: QueueExportInput): Promise<ExportJob> {
    const row = await this.prisma.editExportJob.create({
      data: {
        projectId: input.projectId,
        userId: input.userId ?? null,
        format: input.format,
        resolution: input.resolution,
        quality: input.quality,
        status: 'QUEUED',
        progress: 0,
        outputUrl: null,
        error: null,
        completedAt: null,
      },
    });

    return this.toJob(row as ExportJobRow);
  }

  async getExportStatus(exportId: string, userId?: string): Promise<ExportJob> {
    return this.toJob(await this.findOwnedJobRow(exportId, userId));
  }

  /**
   * Raw row accessor for internal consumers that need the stored output KEY
   * (the download route) rather than the signed response shape. Throws
   * EXPORT_NOT_FOUND, owner-scoped when userId is given.
   */
  async getJobRow(exportId: string, userId?: string): Promise<ExportJobRow> {
    return this.findOwnedJobRow(exportId, userId);
  }

  async listExports(projectId: string, userId?: string): Promise<ExportJob[]> {
    const rows = (await this.prisma.editExportJob.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    })) as ExportJobRow[];

    const visible =
      userId === undefined ? rows : rows.filter((r) => this.owns(r, userId));
    return Promise.all(visible.map((r) => this.toJob(r)));
  }

  async cancelExport(exportId: string, userId?: string): Promise<ExportJob> {
    const row = await this.findOwnedJobRow(exportId, userId);

    if (row.status !== 'QUEUED') {
      throw createAppError('Only queued exports can be cancelled', 400, 'CANNOT_CANCEL_EXPORT');
    }

    const updated = await this.prisma.editExportJob.update({
      where: { id: exportId },
      data: { status: 'FAILED', error: 'Cancelled by user', completedAt: new Date() },
    });

    return this.toJob(updated as ExportJobRow);
  }

  // -------------------------------------------------------------------------
  // Processor transitions — the ONLY writers of PROCESSING/COMPLETED and of
  // processor-side FAILED. All are system-acting (no caller userId).
  // -------------------------------------------------------------------------

  /**
   * Atomically claim one specific QUEUED job: the updateMany matches only
   * while the row is still QUEUED, so a second claim of the same job (from
   * this or any other processor instance) affects 0 rows and returns null.
   */
  async claimJob(exportId: string): Promise<ExportJob | null> {
    const { count } = await this.prisma.editExportJob.updateMany({
      where: { id: exportId, status: 'QUEUED' },
      data: { status: 'PROCESSING', progress: 10 },
    });
    if (count === 0) return null;

    return this.toJob(await this.findJobRow(exportId));
  }

  /** Claim the oldest QUEUED job (FIFO), or null when the queue is drained. */
  async claimNextQueued(): Promise<ExportJob | null> {
    const next = (await this.prisma.editExportJob.findFirst({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
    })) as ExportJobRow | null;

    if (!next) return null;
    // Another worker may win the race between findFirst and the atomic
    // claim; claimJob returning null is that lost race, reported as "no job".
    return this.claimJob(next.id);
  }

  /** Coarse progress write (D4-5); only a PROCESSING job can advance. */
  async updateProgress(exportId: string, progress: number): Promise<void> {
    await this.prisma.editExportJob.updateMany({
      where: { id: exportId, status: 'PROCESSING' },
      data: { progress },
    });
  }

  /**
   * Mark a claimed job COMPLETED with its output object key. Returns null
   * when the job is no longer PROCESSING (cancelled/deleted mid-flight —
   * D4-6): the caller must discard the uploaded object instead of the job
   * being resurrected to COMPLETED.
   */
  async completeJob(exportId: string, outputKey: string): Promise<ExportJob | null> {
    const { count } = await this.prisma.editExportJob.updateMany({
      where: { id: exportId, status: 'PROCESSING' },
      data: {
        status: 'COMPLETED',
        progress: 100,
        outputUrl: outputKey,
        error: null,
        completedAt: new Date(),
      },
    });
    if (count === 0) return null;

    return this.toJob(await this.findJobRow(exportId));
  }

  /** Terminate a job FAILED with a recorded reason (truncated at 500 chars). */
  async failJob(exportId: string, error: string): Promise<ExportJob> {
    const message = error.slice(0, MAX_ERROR_LENGTH);
    const updated = await this.prisma.editExportJob.update({
      where: { id: exportId },
      data: { status: 'FAILED', error: message, completedAt: new Date() },
    });

    return this.toJob(updated as ExportJobRow);
  }

  /**
   * Stale sweep (D4-7): jobs left PROCESSING by a previous process
   * incarnation, untouched since `olderThan`, are terminally FAILED with
   * PROCESSOR_INTERRUPTED — never silently re-queued, because a render is
   * not idempotent-safe to blind-retry. Returns how many were swept.
   */
  async failStaleProcessing(olderThan: Date): Promise<number> {
    const stuck = (await this.prisma.editExportJob.findMany({
      where: { status: 'PROCESSING' },
    })) as ExportJobRow[];

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
