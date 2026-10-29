// ============================================================================
// QuantCooks CP-1 — JobService: the single writer of unified jobs (§5).
// ============================================================================
//
// ONE async job model (EditJob, migration 0110) for exports, generation,
// Craft renders, photo edits, design jobs, analysis, training, pipelines
// and auto-edit.
// Lifecycle is exactly §5.4 — the transitions that exist, no others:
//
//   create → QUEUED (progress 0)
//   QUEUED → PROCESSING   via claim: atomic updateMany on { id, status:
//                         'QUEUED' } (count 0 ⇒ another worker won)
//   PROCESSING → PROCESSING  heartbeat (progress/stage only)
//   PROCESSING → COMPLETED   completeJob (progress 100, outputs/result set)
//   PROCESSING → FAILED      failJob (error recorded, truncated 500)
//   QUEUED → FAILED          cancelJob only, error 'USER_CANCELLED'
//   boot sweep → FAILED      stale PROCESSING → 'PROCESSOR_INTERRUPTED'
//                            (never silently re-queued — §5.4)
//
// Idempotency (§5.3): the (userId, idempotencyKey) unique constraint makes
// a replay return the EXISTING job. Outputs are asset REFERENCES (§5.2);
// the response mapper mints a fresh signed URL per read for each READY
// output asset and persists none. Credit fields ride along honestly
// pre-CP-2: creditCost records what settled (0 until CP-2 wires the
// ledger) and every job states metering 'not_wired' until then; a FAILED
// job's `refunded` is what was actually held and released — pre-CP-2 no
// reservation ever exists, so it is 0 by construction, not by claim.
// ============================================================================

import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import type { StoragePort } from '../services/storage.adapter';

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type JobKind =
  | 'EXPORT'
  | 'IMAGE_GEN'
  | 'VIDEO_GEN'
  | 'AUDIO_GEN'
  | 'TRANSFORM'
  | 'UPSCALE'
  | 'STORYBOARD'
  | 'SHOT_SEQUENCE'
  | 'AD_GEN'
  | 'UGC_GEN'
  | 'EPISODE'
  | 'PIPELINE'
  | 'AUTO_EDIT'
  | 'CRAFT_RENDER'
  | 'PHOTO_EDIT'
  | 'DESIGN'
  | 'ANALYSIS'
  | 'TRAINING';

export interface JobOutputRef {
  assetId: string;
  kind: string;
  meta?: unknown;
}

export interface PublicJob {
  id: string;
  userId: string;
  projectId: string | null;
  kind: string;
  toolName: string;
  provider: string | null;
  status: JobStatus;
  progress: number;
  stage: string | null;
  params: unknown;
  outputs: (JobOutputRef & { url: string | null })[];
  result: unknown;
  error: string | null;
  creditCost: number;
  metering: 'not_wired';
  refunded: number;
  quoteId: string | null;
  parentJobId: string | null;
  externalRef: string | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

/** Narrow prisma surface (DI'd for unit-testability, the house pattern). */
export interface EditJobPrisma {
  editJob: {
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

type EditJobRow = {
  id: string;
  userId: string;
  projectId: string | null;
  kind: string;
  toolName: string;
  provider: string | null;
  status: string;
  progress: number;
  stage: string | null;
  params: unknown;
  idempotencyKey: string;
  quoteId: string | null;
  creditCost: number;
  reservationKey: string | null;
  outputs: unknown;
  result: unknown;
  error: string | null;
  parentJobId: string | null;
  externalRef: string | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

const MAX_ERROR_LENGTH = 500;

export interface CreateJobInput {
  userId: string;
  kind: JobKind | string;
  toolName: string;
  projectId?: string | null;
  provider?: string | null;
  params?: unknown;
  idempotencyKey?: string;
  quoteId?: string | null;
  creditCost?: number;
  parentJobId?: string | null;
  externalRef?: string | null;
}

export class JobService {
  constructor(
    private readonly prisma: EditJobPrisma,
    private readonly storage: StoragePort | null,
  ) {}

  // -- mapping ---------------------------------------------------------------

  private outputRefs(row: EditJobRow): JobOutputRef[] {
    if (!Array.isArray(row.outputs)) return [];
    return (row.outputs as JobOutputRef[]).filter(
      (o) => o && typeof o.assetId === 'string',
    );
  }

  async toPublicJob(row: EditJobRow): Promise<PublicJob> {
    const outputs = await Promise.all(
      this.outputRefs(row).map(async (ref) => ({
        ...ref,
        url: await this.mintOutputUrl(ref.assetId),
      })),
    );
    return {
      id: row.id,
      userId: row.userId,
      projectId: row.projectId ?? null,
      kind: row.kind,
      toolName: row.toolName,
      provider: row.provider ?? null,
      status: row.status as JobStatus,
      progress: row.progress ?? 0,
      stage: row.stage ?? null,
      params: row.params ?? {},
      outputs,
      result: row.result ?? null,
      error: row.error ?? null,
      creditCost: row.creditCost ?? 0,
      metering: 'not_wired',
      refunded: row.status === 'FAILED' && row.reservationKey ? (row.creditCost ?? 0) : 0,
      quoteId: row.quoteId ?? null,
      parentJobId: row.parentJobId ?? null,
      externalRef: row.externalRef ?? null,
      attempts: row.attempts ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt ?? null,
    };
  }

  /** Fresh signed URL for a READY output asset's stored key, else null. */
  private async mintOutputUrl(assetId: string): Promise<string | null> {
    if (!this.storage) return null;
    const asset = (await this.prisma.editAsset.findFirst({
      where: { id: assetId },
    })) as { url: string | null; metadata: unknown } | null;
    if (!asset) return null;
    const meta =
      asset.metadata && typeof asset.metadata === 'object'
        ? (asset.metadata as Record<string, unknown>)
        : {};
    const key =
      asset.url ?? (typeof meta['storageKey'] === 'string' ? meta['storageKey'] : null);
    if (!key || meta['uploadStatus'] !== 'READY') return null;
    return this.storage.getSignedUrl(key);
  }

  // -- reads (owner-scoped; another user's job is 404, §7.2) -----------------

  private async findRow(jobId: string): Promise<EditJobRow> {
    const row = (await this.prisma.editJob.findFirst({
      where: { id: jobId },
    })) as EditJobRow | null;
    if (!row) {
      throw createAppError('Job not found', 404, 'JOB_NOT_FOUND');
    }
    return row;
  }

  async getJob(jobId: string, userId: string): Promise<PublicJob> {
    const row = await this.findRow(jobId);
    if (row.userId !== userId) {
      throw createAppError('Job not found', 404, 'JOB_NOT_FOUND');
    }
    return this.toPublicJob(row);
  }

  /** System-side read (processors/adapters): no caller scope. */
  async getJobRow(jobId: string): Promise<EditJobRow> {
    return this.findRow(jobId);
  }

  async listJobs(
    userId: string,
    filters: { projectId?: string; kind?: string; status?: string } = {},
  ): Promise<PublicJob[]> {
    const where: Record<string, unknown> = { userId };
    if (filters.projectId) where['projectId'] = filters.projectId;
    if (filters.kind) where['kind'] = filters.kind;
    if (filters.status) where['status'] = filters.status;
    const rows = (await this.prisma.editJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })) as EditJobRow[];
    return Promise.all(rows.map((r) => this.toPublicJob(r)));
  }

  /** Idempotency lookup (§5.3): the existing job for (user, key), if any. */
  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<PublicJob | null> {
    const row = (await this.prisma.editJob.findFirst({
      where: { userId, idempotencyKey },
    })) as EditJobRow | null;
    return row ? this.toPublicJob(row) : null;
  }

  // -- lifecycle (the only writers of EditJob status for registry jobs) ------

  async createJob(input: CreateJobInput): Promise<PublicJob> {
    const idempotencyKey = input.idempotencyKey ?? `auto:${randomUUID()}`;

    const existing = await this.findByIdempotencyKey(input.userId, idempotencyKey);
    if (existing) return existing;

    try {
      const row = (await this.prisma.editJob.create({
        data: {
          userId: input.userId,
          projectId: input.projectId ?? null,
          kind: input.kind,
          toolName: input.toolName,
          provider: input.provider ?? null,
          status: 'QUEUED',
          progress: 0,
          stage: null,
          params: input.params ?? {},
          idempotencyKey,
          quoteId: input.quoteId ?? null,
          creditCost: input.creditCost ?? 0,
          reservationKey: null,
          outputs: [],
          result: null,
          error: null,
          parentJobId: input.parentJobId ?? null,
          externalRef: input.externalRef ?? null,
          attempts: 0,
          completedAt: null,
        },
      })) as EditJobRow;
      return this.toPublicJob(row);
    } catch (err) {
      // Lost a create race on the unique (userId, idempotencyKey): the
      // winner's job is the answer (§5.3 replay semantics).
      if ((err as { code?: string }).code === 'P2002') {
        const winner = await this.findByIdempotencyKey(input.userId, idempotencyKey);
        if (winner) return winner;
      }
      throw err;
    }
  }

  /** Atomically claim one specific QUEUED job; null when the race is lost. */
  async claimJob(jobId: string): Promise<PublicJob | null> {
    const current = (await this.prisma.editJob.findFirst({
      where: { id: jobId },
    })) as EditJobRow | null;
    if (!current) return null;

    const { count } = await this.prisma.editJob.updateMany({
      where: { id: jobId, status: 'QUEUED' },
      data: {
        status: 'PROCESSING',
        progress: 10,
        attempts: (current.attempts ?? 0) + 1,
      },
    });
    if (count === 0) return null;
    return this.toPublicJob(await this.findRow(jobId));
  }

  /** Claim the oldest QUEUED job (optionally kind-filtered), or null. */
  async claimNext(kindFilter?: string | string[]): Promise<PublicJob | null> {
    const kinds = kindFilter === undefined ? null : Array.isArray(kindFilter) ? kindFilter : [kindFilter];
    const candidates = (await this.prisma.editJob.findMany({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
    })) as EditJobRow[];
    for (const candidate of candidates) {
      if (kinds && !kinds.includes(candidate.kind)) continue;
      const claimed = await this.claimJob(candidate.id);
      if (claimed) return claimed;
    }
    return null;
  }

  /** Progress/stage heartbeat; only a PROCESSING job can advance. */
  async heartbeat(jobId: string, update: { progress?: number; stage?: string }): Promise<void> {
    const data: Record<string, unknown> = {};
    if (update.progress !== undefined) {
      data['progress'] = Math.max(0, Math.min(100, Math.round(update.progress)));
    }
    if (update.stage !== undefined) data['stage'] = update.stage;
    if (Object.keys(data).length === 0) return;
    await this.prisma.editJob.updateMany({
      where: { id: jobId, status: 'PROCESSING' },
      data,
    });
  }

  async completeJob(
    jobId: string,
    completion: {
      outputs?: JobOutputRef[];
      result?: unknown;
      creditCost?: number;
      externalRef?: string;
    } = {},
  ): Promise<PublicJob | null> {
    const data: Record<string, unknown> = {
      status: 'COMPLETED',
      progress: 100,
      stage: null,
      error: null,
      completedAt: new Date(),
    };
    if (completion.outputs !== undefined) data['outputs'] = completion.outputs;
    if (completion.result !== undefined) data['result'] = completion.result;
    if (completion.creditCost !== undefined) data['creditCost'] = completion.creditCost;
    if (completion.externalRef !== undefined) data['externalRef'] = completion.externalRef;

    const { count } = await this.prisma.editJob.updateMany({
      where: { id: jobId, status: 'PROCESSING' },
      data,
    });
    if (count === 0) return null;

    const job = await this.toPublicJob(await this.findRow(jobId));
    if (job.parentJobId) await this.refreshPipelineParent(job.parentJobId);
    return job;
  }

  async failJob(jobId: string, error: string): Promise<PublicJob> {
    const message = error.slice(0, MAX_ERROR_LENGTH);
    const updated = (await this.prisma.editJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', stage: null, error: message, completedAt: new Date() },
    })) as EditJobRow;
    const job = await this.toPublicJob(updated);
    if (job.parentJobId) await this.refreshPipelineParent(job.parentJobId);
    return job;
  }

  /**
   * Cancel (§3.6/§5.4): only QUEUED jobs cancel, to FAILED with
   * 'USER_CANCELLED'. PROCESSING (or terminal) → 400 CANNOT_CANCEL_JOB.
   */
  async cancelJob(jobId: string, userId: string): Promise<PublicJob> {
    const row = await this.findRow(jobId);
    if (row.userId !== userId) {
      throw createAppError('Job not found', 404, 'JOB_NOT_FOUND');
    }
    if (row.status !== 'QUEUED') {
      throw createAppError(
        `Only queued jobs can be cancelled (status: ${row.status})`,
        400,
        'CANNOT_CANCEL_JOB',
      );
    }
    const { count } = await this.prisma.editJob.updateMany({
      where: { id: jobId, status: 'QUEUED' },
      data: { status: 'FAILED', error: 'USER_CANCELLED', completedAt: new Date() },
    });
    if (count === 0) {
      throw createAppError('Only queued jobs can be cancelled', 400, 'CANNOT_CANCEL_JOB');
    }
    return this.toPublicJob(await this.findRow(jobId));
  }

  /**
   * Stale sweep (§5.4): PROCESSING jobs untouched since `olderThan` are
   * terminally FAILED with PROCESSOR_INTERRUPTED — never re-queued.
   */
  async failStaleProcessing(olderThan: Date, kindFilter?: string | string[]): Promise<number> {
    const kinds = kindFilter === undefined ? null : Array.isArray(kindFilter) ? kindFilter : [kindFilter];
    const stuck = (await this.prisma.editJob.findMany({
      where: { status: 'PROCESSING' },
    })) as EditJobRow[];
    let swept = 0;
    for (const row of stuck) {
      if (kinds && !kinds.includes(row.kind)) continue;
      if (row.updatedAt.getTime() < olderThan.getTime()) {
        await this.failJob(row.id, 'PROCESSOR_INTERRUPTED');
        swept++;
      }
    }
    return swept;
  }

  /**
   * Pipeline parent roll-up (§5.6): progress = settled children / total
   * children × 100 (a true ratio); the parent completes only when every
   * child completes, fails when any child fails (the error names the
   * step), and its creditCost is the settled sum of its children.
   */
  async refreshPipelineParent(parentJobId: string): Promise<void> {
    const parent = (await this.prisma.editJob.findFirst({
      where: { id: parentJobId },
    })) as EditJobRow | null;
    if (!parent || parent.status === 'COMPLETED' || parent.status === 'FAILED') return;

    const children = (await this.prisma.editJob.findMany({
      where: { parentJobId },
      orderBy: { createdAt: 'asc' },
    })) as EditJobRow[];
    if (children.length === 0) return;

    const settled = children.filter(
      (c) => c.status === 'COMPLETED' || c.status === 'FAILED',
    ).length;
    const failed = children.find((c) => c.status === 'FAILED');
    const creditCost = children.reduce((sum, c) => sum + (c.creditCost ?? 0), 0);
    const progress = Math.floor((settled / children.length) * 100);

    if (failed) {
      await this.prisma.editJob.updateMany({
        where: { id: parentJobId, status: parent.status },
        data: {
          status: 'FAILED',
          progress,
          creditCost,
          error: `Pipeline step failed (${failed.toolName}): ${failed.error ?? 'unknown error'}`.slice(
            0,
            MAX_ERROR_LENGTH,
          ),
          completedAt: new Date(),
        },
      });
      return;
    }
    if (settled === children.length) {
      await this.prisma.editJob.updateMany({
        where: { id: parentJobId, status: parent.status },
        data: { status: 'COMPLETED', progress: 100, creditCost, completedAt: new Date() },
      });
      return;
    }
    await this.prisma.editJob.updateMany({
      where: { id: parentJobId, status: parent.status },
      data: { progress, creditCost },
    });
  }
}
