// ============================================================================
// QuantCooks - Photo Edit Processor (C-3B)
// ============================================================================
//
// In-process, DB-polling processor for PhotoCraft companion photo edits —
// the C-2 CraftRenderProcessor pattern, adapted to an edit (input bytes
// in, edited bytes out) instead of a render:
//
//  - Started ONLY from server.ts, and only when the companion binary is
//    configured (PHOTOCRAFT_BIN resolves and the kill switch is off). No
//    binary -> no processor exists and no edit can even be created (the
//    service refuses creation with PHOTO_NOT_CONFIGURED).
//  - A job claimed while storage is unconfigured terminates FAILED
//    'STORAGE_NOT_CONFIGURED' before the binary is ever spawned — it can
//    neither read its source nor land its output, so it fails honestly at
//    claim time with the precise code, never hangs.
//  - Concurrency is 1 (the C-2 discipline for companion binaries).
//  - The source asset's bytes are pulled from P0-3 storage (storage key
//    from the asset row; downloaded bytes never persist as URLs), written
//    to a per-job workspace, edited by the companion, and the result lands
//    through the P0-3 seam as a NEW EditAsset row in the SOURCE's project
//    (generateUploadUrl -> storage.upload -> completeUpload). The source
//    asset is only ever read — never mutated, never overwritten.
//  - Progress is coarse and truthful (10 at claim / 70 while storing /
//    100 COMPLETED): the one-shot CLI emits no progress stream, so no
//    finer number is ever claimed.
//  - At start, PROCESSING jobs left by a previous incarnation (older than
//    staleMs) are swept to FAILED/PROCESSOR_INTERRUPTED, and the in-flight
//    job of THIS instance is failed the same way if the process stops
//    mid-edit (a restart never leaves a phantom).
//
// The per-job workspace is removed in `finally` on success and failure.
// ============================================================================

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PhotoEditJob, PhotoEditService } from './photo-edit.service';
import { photoOutputMedia } from './photo-edit.service';
import type { AssetService } from './asset.service';
import { sanitizeFilename } from './asset.service';
import type { StoragePort } from './storage.adapter';
import {
  editWithPhotoCraft,
  type PhotoCraftRunner,
  type FinalizeEditOutcome,
  type PhotoOperation,
} from './photocraft.adapter';

export interface PhotoEditProcessorDeps {
  service: PhotoEditService;
  assets: AssetService;
  runner: PhotoCraftRunner;
  storage: StoragePort | null;
  pollMs?: number;
  staleMs?: number;
  workDir?: string;
  logger?: Pick<typeof console, 'info' | 'error'>;
}

const DEFAULT_POLL_MS = 2_000;
const DEFAULT_STALE_MS = 15 * 60 * 1000;

/** Extension for the workspace copy of the source (the CLI opens by
 *  extension); falls back through the filename, then the stored content
 *  type, then png. */
function sourceExtension(filename: string, contentType: unknown): string {
  const fromName = filename.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName) && fromName !== filename.toLowerCase()) {
    return fromName;
  }
  if (typeof contentType === 'string') {
    if (contentType === 'image/jpeg') return 'jpg';
    if (contentType === 'image/png') return 'png';
    if (contentType === 'image/webp') return 'webp';
    if (contentType === 'image/vnd.adobe.photoshop') return 'psd';
    if (contentType === 'image/tiff') return 'tif';
  }
  return 'png';
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as Uint8Array));
  }
  return Buffer.concat(chunks);
}

export class PhotoEditProcessor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private currentJobId: string | null = null;

  constructor(private readonly deps: PhotoEditProcessorDeps) {}

  private get pollMs(): number {
    return this.deps.pollMs ?? DEFAULT_POLL_MS;
  }

  private get staleMs(): number {
    return this.deps.staleMs ?? DEFAULT_STALE_MS;
  }

  private get workDir(): string {
    return this.deps.workDir ?? process.env['PHOTO_EDIT_WORK_DIR'] ?? tmpdir();
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
      this.log.info(`[quantcooks] photo edit processor swept ${swept} stale PROCESSING job(s)`);
    }

    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        this.log.error('[quantcooks] photo edit processor tick failed', error);
      });
    }, this.pollMs);
    // Polling must never keep a dying process alive.
    (this.timer as unknown as { unref?: () => void }).unref?.();

    void this.tick().catch((error) => {
      this.log.error('[quantcooks] photo edit processor initial tick failed', error);
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
  async processJob(job: PhotoEditJob): Promise<void> {
    const { service } = this.deps;
    try {
      // An edit with storage unconfigured can neither read its source nor
      // land its output: fail honestly at claim time with the precise
      // code — not hang, not spawn.
      if (!this.deps.storage) {
        await service.failJob(
          job.id,
          'STORAGE_NOT_CONFIGURED: photo edit source/output cannot move without object storage (no S3/R2 storage configured)',
        );
        return;
      }

      const assetRow = await service.getSourceAssetRow(job.sourceAssetId);
      const meta =
        assetRow.metadata && typeof assetRow.metadata === 'object'
          ? (assetRow.metadata as Record<string, unknown>)
          : {};
      const key =
        assetRow.url ??
        (typeof meta['storageKey'] === 'string' ? (meta['storageKey'] as string) : null);
      if (!key) {
        await service.failJob(
          job.id,
          'SOURCE_BYTES_UNAVAILABLE: source asset has no storage object to edit',
        );
        return;
      }

      const { body } = await this.deps.storage.download(key);
      const sourceBytes = await readAll(body);

      const { ext, contentType } = photoOutputMedia(job.outputFormat);
      const workDir = await mkdtemp(join(this.workDir, 'quantcooks-photo-'));
      const inputPath = join(
        workDir,
        `source.${sourceExtension(assetRow.filename, meta['contentType'])}`,
      );
      const outputPath = join(workDir, `edited.${ext}`);

      try {
        await writeFile(inputPath, sourceBytes);

        const outcome: FinalizeEditOutcome = await editWithPhotoCraft({
          inputPath,
          outputPath,
          operations: job.operations as PhotoOperation[],
          runner: this.deps.runner,
        });

        if (outcome.status === 'FAILED') {
          await service.failJob(job.id, outcome.error);
          return;
        }

        await service.updateProgress(job.id, 70, 'storing');

        // Land the edit through the P0-3 seam as a NEW asset in the
        // source's project. The source row/bytes are untouched.
        const outBody = await readFile(outputPath);
        const base = (assetRow.filename ?? 'photo').replace(/\.[^.]+$/, '') || 'photo';
        const filename = sanitizeFilename(`${base}-edited.${ext}`);
        const ownerId = job.userId ?? assetRow.userId ?? 'system';
        const upload = await this.deps.assets.generateUploadUrl(ownerId, {
          projectId: job.projectId,
          filename,
          contentType,
          size: outBody.byteLength,
        });
        await this.deps.storage.upload(upload.key, outBody, contentType);
        const asset = await this.deps.assets.completeUpload(upload.assetId, ownerId);

        const completed = await service.completeJob(job.id, asset.id);
        if (!completed) {
          // The job left PROCESSING mid-flight (sweep/shutdown): discard
          // the output instead of completing a job nobody owns (P0-4 D4-6).
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
        this.log.error('[quantcooks] photo edit processor could not fail job', job.id, failError);
      }
    }
  }

  /** Test/ops introspection: is an edit in flight right now? */
  get isProcessing(): boolean {
    return this.processing;
  }
}
