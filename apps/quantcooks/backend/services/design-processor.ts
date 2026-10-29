// ============================================================================
// QuantCooks - Design Processor (C-7 step 4)
// ============================================================================
//
// In-process, DB-polling processor for FigCraft companion design jobs —
// the C-2/C-3B processor pattern over CP-1's unified JobService (jobs
// are kind DESIGN on EditJob; see design.service.ts for the kind call):
//
//  - Started ONLY from server.ts, and only when the companion binary is
//    configured (FIGCRAFT_BIN resolves and the kill switch is off). No
//    binary -> no processor exists and no design job can even be
//    created (the service refuses creation with FIGCRAFT_NOT_CONFIGURED).
//  - A job claimed while storage is unconfigured terminates FAILED
//    'STORAGE_NOT_CONFIGURED' before the binary is ever spawned — it
//    can neither read an export's source nor land its outputs, so it
//    fails honestly at claim time with the precise code, never hangs.
//  - Concurrency is 1 (the C-2 discipline for companion binaries).
//  - CREATE: the workspace gets a run script (the binary's own
//    file.newFromTemplate / file.new + file.saveAs — never hand-written
//    document JSON), the CLI authors the .figcraft confined to the
//    workspace, and the document lands through the P0-3 seam as a REAL
//    EditAsset in the job's project (generateUploadUrl ->
//    storage.upload -> completeUpload).
//  - EXPORT: the source document's bytes are pulled from P0-3 storage
//    (downloaded bytes never persist as URLs), written to the
//    workspace, exported by the companion, and every produced file
//    lands as a NEW EditAsset in the source's project. Single-file
//    form (a frame is named, or the format is PDF) yields one asset;
//    the per-frame form (PNG/SVG, no frame) yields one asset per
//    top-level frame. The source asset is only ever read — never
//    mutated, never overwritten.
//  - Progress is coarse and truthful (10 at claim / 70 while storing /
//    100 COMPLETED): the one-shot CLI emits no progress stream, so no
//    finer number is ever claimed.
//  - At start, PROCESSING jobs left by a previous incarnation (older
//    than staleMs) are swept to FAILED/PROCESSOR_INTERRUPTED, and the
//    in-flight job of THIS instance is failed the same way if the
//    process stops mid-job (a restart never leaves a phantom).
//
// The per-job workspace is removed in `finally` on success and failure.
// ============================================================================

import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DesignJob, DesignService } from './design.service';
import { designExportMedia, DESIGN_DOCUMENT_CONTENT_TYPE } from './design.service';
import type { AssetService } from './asset.service';
import { sanitizeFilename } from './asset.service';
import type { StoragePort } from './storage.adapter';
import {
  createDesignWithFigCraft,
  exportDesignWithFigCraft,
  type FigCraftRunner,
} from './figcraft.adapter';

export interface DesignProcessorDeps {
  service: DesignService;
  assets: AssetService;
  runner: FigCraftRunner;
  storage: StoragePort | null;
  pollMs?: number;
  staleMs?: number;
  workDir?: string;
  logger?: Pick<typeof console, 'info' | 'error'>;
}

const DEFAULT_POLL_MS = 2_000;
const DEFAULT_STALE_MS = 15 * 60 * 1000;

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as Uint8Array));
  }
  return Buffer.concat(chunks);
}

/** Document filename for a created design (always a .figcraft). */
function createdFilename(name: string | null, template: string | null): string {
  const raw = (name ?? '').trim() || (template ? `${template}-design` : 'design');
  const base = raw.toLowerCase().endsWith('.figcraft') ? raw.slice(0, -'.figcraft'.length) : raw;
  return sanitizeFilename(`${base}.figcraft`);
}

/** Output filename for a single-file export of a source document. */
function singleExportFilename(sourceFilename: string, frame: string | null, ext: string): string {
  const base =
    (sourceFilename ?? 'design').replace(/\.figcraft$/i, '') || 'design';
  return sanitizeFilename(frame ? `${base}-${frame}.${ext}` : `${base}.${ext}`);
}

export class DesignProcessor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private currentJobId: string | null = null;

  constructor(private readonly deps: DesignProcessorDeps) {}

  private get pollMs(): number {
    return this.deps.pollMs ?? DEFAULT_POLL_MS;
  }

  private get staleMs(): number {
    return this.deps.staleMs ?? DEFAULT_STALE_MS;
  }

  private get workDir(): string {
    return this.deps.workDir ?? process.env['DESIGN_WORK_DIR'] ?? tmpdir();
  }

  private get log(): Pick<typeof console, 'info' | 'error'> {
    return this.deps.logger ?? console;
  }

  /** Begin polling. Safe to call repeatedly. */
  async start(): Promise<void> {
    if (this.timer) return;

    const cutoff = new Date(Date.now() - this.staleMs);
    const swept = await this.deps.service.failStaleDesigns(cutoff);
    if (swept > 0) {
      this.log.info(`[quantcooks] design processor swept ${swept} stale PROCESSING job(s)`);
    }

    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        this.log.error('[quantcooks] design processor tick failed', error);
      });
    }, this.pollMs);
    // Polling must never keep a dying process alive.
    (this.timer as unknown as { unref?: () => void }).unref?.();

    void this.tick().catch((error) => {
      this.log.error('[quantcooks] design processor initial tick failed', error);
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
        await this.deps.service.failDesign(this.currentJobId, 'PROCESSOR_INTERRUPTED');
      } catch {
        // Best effort — the stale sweep on the next boot finishes the job.
      }
    }
  }

  /**
   * One poll: claim the oldest QUEUED DESIGN job and process it to a
   * terminal state, never overlapping with itself. Bounded per call
   * (one job) — the next job is picked up on the next interval.
   */
  async tick(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const job = await this.deps.service.claimNextDesign();
      if (!job) return;
      this.currentJobId = job.id;
      await this.processJob(job);
    } finally {
      this.currentJobId = null;
      this.processing = false;
    }
  }

  /** Process one claimed job end-to-end. Never throws. */
  async processJob(job: DesignJob): Promise<void> {
    const { service } = this.deps;
    try {
      // A design job with storage unconfigured can neither read an
      // export's source nor land its outputs: fail honestly at claim
      // time with the precise code — not hang, not spawn.
      if (!this.deps.storage) {
        await service.failDesign(
          job.id,
          'STORAGE_NOT_CONFIGURED: design source/output cannot move without object storage (no S3/R2 storage configured)',
        );
        return;
      }

      if (job.operation === 'create') {
        await this.processCreate(job);
      } else {
        await this.processExport(job);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await service.failDesign(job.id, message);
      } catch (failError) {
        this.log.error('[quantcooks] design processor could not fail job', job.id, failError);
      }
    }
  }

  // -- create -----------------------------------------------------------------

  private async processCreate(job: DesignJob): Promise<void> {
    const { service } = this.deps;
    const storage = this.deps.storage!;
    const workDir = await mkdtemp(join(this.workDir, 'quantcooks-design-'));
    const outputPath = join(workDir, 'design.figcraft');
    try {
      const outcome = await createDesignWithFigCraft({
        workDir,
        outputPath,
        template: job.template ?? undefined,
        name: job.name ?? undefined,
        runner: this.deps.runner,
      });
      if (outcome.status === 'FAILED') {
        await service.failDesign(job.id, outcome.error);
        return;
      }

      await service.heartbeat(job.id, { progress: 70, stage: 'storing' });

      // Land the document through the P0-3 seam as a real asset row.
      const body = await readFile(outputPath);
      const filename = createdFilename(job.name, job.template);
      const ownerId = job.userId;
      const upload = await this.deps.assets.generateUploadUrl(ownerId, {
        projectId: job.projectId!,
        filename,
        contentType: DESIGN_DOCUMENT_CONTENT_TYPE,
        size: body.byteLength,
      });
      await storage.upload(upload.key, body, DESIGN_DOCUMENT_CONTENT_TYPE);
      const asset = await this.deps.assets.completeUpload(upload.assetId, ownerId);

      const completed = await service.completeDesign(job.id, {
        outputs: [{ assetId: asset.id, kind: 'design-document' }],
        result: { operation: 'create', template: job.template, name: job.name },
      });
      if (!completed) {
        // The job left PROCESSING mid-flight (sweep/shutdown): discard
        // the output instead of completing a job nobody owns (P0-4 D4-6).
        await this.discardLandedAsset(upload.key, asset.id, ownerId);
      }
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  // -- export -----------------------------------------------------------------

  private async processExport(job: DesignJob): Promise<void> {
    const { service } = this.deps;
    const storage = this.deps.storage!;

    const assetRow = await service.getSourceAssetRow(job.sourceAssetId!);
    const meta =
      assetRow.metadata && typeof assetRow.metadata === 'object'
        ? (assetRow.metadata as Record<string, unknown>)
        : {};
    const key =
      assetRow.url ??
      (typeof meta['storageKey'] === 'string' ? (meta['storageKey'] as string) : null);
    if (!key) {
      await service.failDesign(
        job.id,
        'SOURCE_BYTES_UNAVAILABLE: source design asset has no storage object to export',
      );
      return;
    }

    const { body } = await storage.download(key);
    const sourceBytes = await readAll(body);

    const format = job.format ?? 'png';
    const { ext, contentType } = designExportMedia(format);
    // Single-file form when a frame is named or the format is PDF
    // (one multi-page document); otherwise the per-frame directory form.
    const singleFile = format === 'pdf' || job.frame !== null;

    const workDir = await mkdtemp(join(this.workDir, 'quantcooks-design-'));
    const inputPath = join(workDir, 'source.figcraft');
    try {
      await writeFile(inputPath, sourceBytes);

      let produced: { path: string; filename: string }[] = [];
      if (singleFile) {
        const outputPath = join(workDir, `export.${ext}`);
        const outcome = await exportDesignWithFigCraft({
          inputPath,
          outputPath,
          format,
          scale: job.scale ?? undefined,
          page: job.page ?? undefined,
          node: job.frame ?? undefined,
          workDir,
          runner: this.deps.runner,
          outputProduced: () => existsSync(outputPath),
        });
        if (outcome.status === 'FAILED') {
          await service.failDesign(job.id, outcome.error);
          return;
        }
        produced = [
          { path: outputPath, filename: singleExportFilename(assetRow.filename, job.frame, ext) },
        ];
      } else {
        const outDir = join(workDir, 'exports');
        const outcome = await exportDesignWithFigCraft({
          inputPath,
          outputPath: outDir,
          format,
          scale: job.scale ?? undefined,
          page: job.page ?? undefined,
          workDir,
          runner: this.deps.runner,
          outputProduced: () => {
            try {
              return existsSync(outDir) && readdirSync(outDir).length > 0;
            } catch {
              return false;
            }
          },
        });
        if (outcome.status === 'FAILED') {
          await service.failDesign(job.id, outcome.error);
          return;
        }
        const names = (await readdir(outDir)).sort();
        produced = names.map((n) => ({ path: join(outDir, n), filename: sanitizeFilename(n) }));
        if (produced.length === 0) {
          await service.failDesign(job.id, 'EXPORT_NO_OUTPUT: CLI exited 0 but produced no export file');
          return;
        }
      }

      await service.heartbeat(job.id, { progress: 70, stage: 'storing' });

      // Land every produced file through the P0-3 seam as a NEW asset
      // in the source's project. The source row/bytes are untouched.
      const ownerId = job.userId;
      const landed: { assetId: string; key: string }[] = [];
      for (const file of produced) {
        const bytes = await readFile(file.path);
        const upload = await this.deps.assets.generateUploadUrl(ownerId, {
          projectId: job.projectId!,
          filename: file.filename,
          contentType,
          size: bytes.byteLength,
        });
        await storage.upload(upload.key, bytes, contentType);
        const asset = await this.deps.assets.completeUpload(upload.assetId, ownerId);
        landed.push({ assetId: asset.id, key: upload.key });
      }

      const completed = await service.completeDesign(job.id, {
        outputs: landed.map((l) => ({ assetId: l.assetId, kind: 'design-export' })),
        result: {
          operation: 'export',
          format,
          files: produced.map((p) => p.filename),
        },
      });
      if (!completed) {
        for (const l of landed) {
          await this.discardLandedAsset(l.key, l.assetId, ownerId);
        }
      }
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Best-effort discard of a landed asset whose job left PROCESSING. */
  private async discardLandedAsset(key: string, assetId: string, ownerId: string): Promise<void> {
    try {
      await this.deps.storage?.delete(key);
    } catch {
      /* best effort */
    }
    try {
      await this.deps.assets.deleteAsset(assetId, ownerId);
    } catch {
      /* best effort */
    }
  }

  /** Test/ops introspection: is a design job in flight right now? */
  get isProcessing(): boolean {
    return this.processing;
  }
}
