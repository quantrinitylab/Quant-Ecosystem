// ============================================================================
// QuantCooks - Design Service (EditJob-backed, C-7 step 4)
// ============================================================================
//
// Persists FigCraft companion design jobs on CP-1's unified EditJob
// table via JobService — the QuantAI-control half of Design Studio:
//
//  - JOB KIND: `DESIGN`, added to the JobService kind enumeration the
//    same way CP-1 added `PHOTO_EDIT` for C-3B — one kind per companion
//    surface (CRAFT_RENDER for EffectCraft, PHOTO_EDIT for PhotoCraft,
//    DESIGN for FigCraft), discriminated internally by
//    params.operation ('create' | 'export'). NO dedicated job table and
//    NO delegate adapter: the C-2/C-3B adapters exist to fold PRE-CP-1
//    legacy tables into EditJob; this service is born on EditJob, so
//    JobService is used directly and get_job_status / GET /jobs read
//    design jobs with no special case.
//  - Status vocabulary + lifecycle are JobService's (§5.4): QUEUED →
//    atomic claim → PROCESSING → COMPLETED/FAILED; stale PROCESSING is
//    swept to PROCESSOR_INTERRUPTED, never re-queued.
//  - Ownership: jobs carry userId through JobService (owner-scoped
//    reads answer 404). Source assets and projects are owner-checked
//    here at creation, the PhotoEditService pattern.
//  - Credits (CP-1 §6.3 has NO rate row for design jobs yet — pricing
//    policy is reserved to Krish/CEO, CP-1 §14 open decision 1): jobs
//    record `creditCost: 0` and every response states
//    `metering: 'not_wired'`, exactly the C-2/C-3B pre-CP-2 surface.
//    CP-2 turns the recorded quote into a real reserve/settle without
//    a shape change.
//
// Creation is guarded before a row exists:
//  1. Companion guard: no FIGCRAFT_BIN runner -> 503
//     FIGCRAFT_NOT_CONFIGURED naming the companion, NO job row (a job
//     that can never run is never queued). Reads keep working.
//  2. Create guards: template (if any) must be in the adapter's
//     verified starter set -> 400 INVALID_TEMPLATE; the project must
//     exist, be live and be the caller's -> 404 PROJECT_NOT_FOUND.
//  3. Export guards: the source asset must exist, be the caller's, be
//     READY (bytes actually in storage) and be a design document
//     (.figcraft) -> 404 ASSET_NOT_FOUND / 400 ASSET_NOT_READY /
//     400 SOURCE_NOT_DESIGN. The job's projectId is DERIVED from the
//     source asset: exports land in the source's project, and the
//     source itself is never mutated.
// ============================================================================

import { createAppError } from '@quant/server-core';
import type { StoragePort } from './storage.adapter';
import { JobService, type EditJobPrisma, type PublicJob } from '../tools/jobs';
import {
  validateTemplateId,
  DESIGN_EXPORT_FORMATS,
  type FigCraftRunner,
} from './figcraft.adapter';

export type DesignOperation = 'create' | 'export';

export interface DesignJob {
  id: string;
  projectId: string | null;
  userId: string;
  /** CP-1 job kind for this surface. */
  kind: 'DESIGN';
  /** Companion id. */
  provider: string;
  operation: DesignOperation;
  status: PublicJob['status'];
  progress: number;
  stage: string | null;
  /** Create: the starter template id, or null for a blank design. */
  template: string | null;
  /** Create: the document name, or null. */
  name: string | null;
  /** Export: the design-document asset being exported. */
  sourceAssetId: string | null;
  /** Export: png | svg | pdf. */
  format: string | null;
  /** Export: a single frame (node name/id) or null for all frames. */
  frame: string | null;
  /** Export: a single page name, or null. */
  page: string | null;
  /** Export: render scale, or null for the engine default. */
  scale: number | null;
  /** Whole credits recorded for this job. Always 0 until CP-2 wires
   *  the ledger; `metering` states why on every response. */
  creditCost: number;
  metering: 'not_wired';
  /** Output assets (create: the .figcraft document; export: one per
   *  exported file). Empty until COMPLETED. */
  outputAssetIds: string[];
  /** The first output asset (the create case's document), or null. */
  outputAssetId: string | null;
  /** Fresh signed URLs minted per read by JobService; never persisted. */
  outputUrls: (string | null)[];
  outputUrl: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface CreateDesignInput {
  projectId: string;
  template?: string;
  name?: string;
  /** Supplied by the route/tool from auth; optional for system callers. */
  userId?: string;
  idempotencyKey?: string;
  quoteId?: string | null;
}

export interface ExportDesignInput {
  sourceAssetId: string;
  format?: string;
  frame?: string;
  page?: string;
  scale?: number;
  userId?: string;
  idempotencyKey?: string;
  quoteId?: string | null;
}

/** Narrow prisma surface: JobService's delegates + the two lookups. */
export interface DesignPrisma extends EditJobPrisma {
  editProject: {
    findFirst: (args: Record<string, unknown>) => Promise<any>;
  };
}

type ProjectRow = {
  id: string;
  userId: string;
  deletedAt: Date | null;
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

/** The design document's registered content type (spike §3). */
export const DESIGN_DOCUMENT_CONTENT_TYPE = 'application/x-figcraft';

/**
 * Is this asset row a design document? The C-7 steps 1–3 detection,
 * unchanged: the filename ends `.figcraft` (the signal the Design
 * Studio library itself uses, since ServerAsset carries no format
 * metadata), or the stored content type is the registered one.
 */
export function isDesignAssetRow(row: { filename: string; metadata: unknown }): boolean {
  if (row.filename.toLowerCase().endsWith('.figcraft')) return true;
  const meta =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : {};
  return meta['contentType'] === DESIGN_DOCUMENT_CONTENT_TYPE;
}

/** Output file extension + asset content type per export format. */
export function designExportMedia(format: string): { ext: string; contentType: string } {
  switch (format) {
    case 'svg':
      return { ext: 'svg', contentType: 'image/svg+xml' };
    case 'pdf':
      return { ext: 'pdf', contentType: 'application/pdf' };
    default:
      return { ext: 'png', contentType: 'image/png' };
  }
}

function paramsOf(job: PublicJob): Record<string, unknown> {
  return job.params && typeof job.params === 'object'
    ? (job.params as Record<string, unknown>)
    : {};
}

function strParam(params: Record<string, unknown>, key: string): string | null {
  const v = params[key];
  return typeof v === 'string' ? v : null;
}

export class DesignService {
  /** The unified job store this service's jobs live in. Exposed so the
   *  processor and tests drive the same JobService instance. */
  readonly jobs: JobService;

  constructor(
    private readonly prisma: DesignPrisma,
    private readonly storage: StoragePort | null,
    /** The companion runner, or null when FIGCRAFT_BIN is not configured
     *  / not executable. Only creation consults it; reads do not. */
    private readonly figcraft: FigCraftRunner | null,
  ) {
    this.jobs = new JobService(prisma, storage);
  }

  /** Fail-closed companion guard (CP-1 §8): 503 FIGCRAFT_NOT_CONFIGURED. */
  requireFigCraft(): FigCraftRunner {
    if (!this.figcraft) {
      throw createAppError(
        'Design companion is not configured: FIGCRAFT_BIN is unset or not executable (companion: figcraft)',
        503,
        'FIGCRAFT_NOT_CONFIGURED',
      );
    }
    return this.figcraft;
  }

  get designConfigured(): boolean {
    return this.figcraft !== null;
  }

  private toDesignJob(job: PublicJob): DesignJob {
    const params = paramsOf(job);
    const outputAssetIds = job.outputs.map((o) => o.assetId);
    const outputUrls = job.outputs.map((o) => o.url);
    return {
      id: job.id,
      projectId: job.projectId,
      userId: job.userId,
      kind: 'DESIGN',
      provider: job.provider ?? 'figcraft',
      operation: params['operation'] === 'export' ? 'export' : 'create',
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      template: strParam(params, 'template'),
      name: strParam(params, 'name'),
      sourceAssetId: strParam(params, 'sourceAssetId'),
      format: strParam(params, 'format'),
      frame: strParam(params, 'frame'),
      page: strParam(params, 'page'),
      scale: typeof params['scale'] === 'number' ? (params['scale'] as number) : null,
      creditCost: job.creditCost ?? 0,
      metering: 'not_wired',
      outputAssetIds,
      outputAssetId: outputAssetIds[0] ?? null,
      outputUrls,
      outputUrl: outputUrls[0] ?? null,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    };
  }

  private async assertDesignKind(jobId: string, userId: string): Promise<PublicJob> {
    const job = await this.jobs.getJob(jobId, userId);
    if (job.kind !== 'DESIGN') {
      throw createAppError('Design job not found', 404, 'DESIGN_JOB_NOT_FOUND');
    }
    return job;
  }

  /**
   * Queue a design creation. Refuses — with NO job row — when the
   * companion is not configured (503), the template is outside the
   * verified starter set (400), or the project is missing/not the
   * caller's (404): a job that can never run is never queued.
   */
  async createDesign(input: CreateDesignInput): Promise<DesignJob> {
    this.requireFigCraft();

    const validation = validateTemplateId(input.template);
    if (!validation.ok) {
      throw createAppError(
        `Invalid template: ${validation.errors.join('; ')}`,
        400,
        'INVALID_TEMPLATE',
      );
    }
    if (input.name !== undefined && (typeof input.name !== 'string' || input.name.length > 120)) {
      throw createAppError('Design name must be a string of at most 120 characters', 400, 'INVALID_NAME');
    }

    const project = (await this.prisma.editProject.findFirst({
      where: { id: input.projectId },
    })) as ProjectRow | null;
    if (
      !project ||
      project.deletedAt != null ||
      (input.userId !== undefined && project.userId !== input.userId)
    ) {
      throw createAppError('Project not found', 404, 'PROJECT_NOT_FOUND');
    }

    const job = await this.jobs.createJob({
      userId: input.userId ?? project.userId,
      kind: 'DESIGN',
      toolName: 'quantcooks.create_design',
      provider: 'figcraft',
      projectId: project.id,
      params: {
        operation: 'create',
        template: input.template ?? null,
        name: input.name ?? null,
      },
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.quoteId ? { quoteId: input.quoteId } : {}),
      creditCost: 0,
    });
    return this.toDesignJob(job);
  }

  /**
   * Queue a design export. Same guard discipline as createDesign; the
   * job's projectId is DERIVED from the source asset (outputs land in
   * the source's project; the source is never mutated).
   */
  async exportDesign(input: ExportDesignInput): Promise<DesignJob> {
    this.requireFigCraft();

    const format = input.format ?? 'png';
    if (!(DESIGN_EXPORT_FORMATS as readonly string[]).includes(format)) {
      throw createAppError(
        `Invalid export format: must be one of ${DESIGN_EXPORT_FORMATS.join('|')}`,
        400,
        'INVALID_FORMAT',
      );
    }
    if (input.scale !== undefined && !(input.scale > 0 && input.scale <= 4)) {
      throw createAppError('Export scale must be > 0 and <= 4', 400, 'INVALID_SCALE');
    }

    const asset = (await this.prisma.editAsset.findFirst({
      where: { id: input.sourceAssetId },
    })) as SourceAssetRow | null;
    if (
      !asset ||
      (input.userId !== undefined &&
        asset.userId !== null &&
        asset.userId !== undefined &&
        asset.userId !== input.userId)
    ) {
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
    if (!isDesignAssetRow(asset)) {
      throw createAppError(
        'Source asset is not a design document (.figcraft)',
        400,
        'SOURCE_NOT_DESIGN',
      );
    }

    const job = await this.jobs.createJob({
      userId: input.userId ?? asset.userId ?? 'system',
      kind: 'DESIGN',
      toolName: 'quantcooks.export_design',
      provider: 'figcraft',
      projectId: asset.projectId,
      params: {
        operation: 'export',
        sourceAssetId: asset.id,
        format,
        frame: input.frame ?? null,
        page: input.page ?? null,
        scale: input.scale ?? null,
      },
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.quoteId ? { quoteId: input.quoteId } : {}),
      creditCost: 0,
    });
    return this.toDesignJob(job);
  }

  async getDesign(jobId: string, userId: string): Promise<DesignJob> {
    return this.toDesignJob(await this.assertDesignKind(jobId, userId));
  }

  async listDesigns(userId: string, projectId?: string): Promise<DesignJob[]> {
    const jobs = await this.jobs.listJobs(userId, {
      kind: 'DESIGN',
      ...(projectId ? { projectId } : {}),
    });
    return jobs.map((j) => this.toDesignJob(j));
  }

  /**
   * The raw source-asset row for the processor (storage key + filename).
   * System-acting (no caller userId): the job row itself is the
   * authority that this asset was the caller's at creation time.
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

  // -------------------------------------------------------------------------
  // Processor-facing lifecycle — thin passthroughs onto JobService, kind-
  // filtered to DESIGN so the design processor can never claim another
  // surface's jobs. All are system-acting (no caller userId).
  // -------------------------------------------------------------------------

  async claimNextDesign(): Promise<DesignJob | null> {
    const job = await this.jobs.claimNext('DESIGN');
    return job ? this.toDesignJob(job) : null;
  }

  async heartbeat(jobId: string, update: { progress?: number; stage?: string }): Promise<void> {
    await this.jobs.heartbeat(jobId, update);
  }

  async completeDesign(
    jobId: string,
    completion: { outputs: { assetId: string; kind: string }[]; result?: unknown },
  ): Promise<DesignJob | null> {
    const job = await this.jobs.completeJob(jobId, {
      outputs: completion.outputs,
      ...(completion.result !== undefined ? { result: completion.result } : {}),
      creditCost: 0,
    });
    return job ? this.toDesignJob(job) : null;
  }

  async failDesign(jobId: string, error: string): Promise<DesignJob> {
    return this.toDesignJob(await this.jobs.failJob(jobId, error));
  }

  async failStaleDesigns(olderThan: Date): Promise<number> {
    return this.jobs.failStaleProcessing(olderThan, 'DESIGN');
  }
}
