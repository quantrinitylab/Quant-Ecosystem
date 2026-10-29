// ============================================================================
// QuantEdits - Asset Service (Prisma-backed + real object storage, P0-3)
// ============================================================================
//
// This service used to keep assets in a private in-memory array and invent
// upload URLs on a fabricated example domain. It is now
// backed by the real EditAsset model (P0-1) through a DI'd narrow prisma
// surface — the same pattern ProjectService uses — plus a DI'd StoragePort
// over @quant/storage (see storage.adapter.ts). Assets survive a backend
// restart, and every URL this service returns is a real signed URL.
//
// Storage conventions (deliberate; P0-4's export processor follows them too):
//  - The DB `url` column NEVER holds a signed URL (they expire). Before an
//    upload completes it is null; on completion it holds the object KEY.
//  - Responses pass through toAsset(), which replaces the key with a fresh
//    signed download URL (1h) when storage is configured, else null. The raw
//    key is also exposed as `storageKey` for internal consumers.
//  - `metadata` Json carries { storageKey, contentType, uploadStatus,
//    etag? } — storageKey is duplicated there so the key survives even if
//    the url-as-key convention is revisited later.
//  - Upload is 3 steps: generateUploadUrl creates the row (PENDING) and
//    returns a signed PUT URL → the client PUTs bytes directly to object
//    storage → completeUpload verifies via HeadObject and marks READY.
//  - Metadata-only create (POST /assets, the client's registerAsset) stays a
//    separate entry point: it persists a PENDING row with no key. It does
//    NOT issue upload URLs.
//  - Ownership: rows carry userId. Reads/writes are scoped to the caller's
//    rows and answer 404 (not 403) for other users' assets, matching the
//    projects routes' owner-only behaviour. Legacy rows with userId = null
//    (none can exist in a fresh DB) stay visible to any authenticated
//    caller. The one exception is listAssets(projectId), which backs the
//    intentionally-public GET /assets/project/:projectId path (P0-2).
// ============================================================================

import { createAppError } from '@quant/server-core';
import type { StoragePort } from './storage.adapter';

export type AssetUploadStatus = 'PENDING' | 'READY';

export interface Asset {
  id: string;
  projectId: string;
  filename: string;
  type: string;
  size: number;
  uploadedAt: Date;
  /** Fresh signed download URL, or null while PENDING / storage unconfigured. */
  url: string | null;
  uploadStatus: AssetUploadStatus;
  /** Raw object-storage key (internal consumers; never a signed URL). */
  storageKey: string | null;
}

export interface UploadAssetInput {
  userId: string;
  projectId: string;
  filename: string;
  type: string;
  size: number;
}

export interface GenerateUploadUrlInput {
  projectId: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface UploadUrlResult {
  uploadUrl: string;
  assetId: string;
  key: string;
  expiresAt: Date;
  requiredHeaders: Record<string, string>;
  maxBytes: number;
}

export interface ListAllAssetsFilters {
  projectId?: string;
  category?: string;
  search?: string;
}

/** Narrow prisma surface this service needs (DI'd for unit-testability). */
export interface AssetPrisma {
  editAsset: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findFirst: (args: Record<string, unknown>) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
  };
}

type AssetRow = {
  id: string;
  projectId: string;
  userId: string | null;
  filename: string;
  type: string;
  size: number;
  url: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type AssetMetadata = {
  storageKey?: string;
  contentType?: string;
  uploadStatus?: string;
  etag?: string;
};

const DEFAULT_MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

function maxUploadBytesFromEnv(): number {
  const parsed = Number(process.env['ASSET_MAX_UPLOAD_BYTES']);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_BYTES;
}

/** Basename only, no path separators or control chars, capped at 120 chars. */
export function sanitizeFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = basename.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
  return cleaned || 'file';
}

/** Asset `type` is the content-type's top-level segment (video/image/audio/...). */
function typeFromContentType(contentType: string): string {
  const top = contentType.split('/')[0]?.trim().toLowerCase();
  return top || 'file';
}

export class AssetService {
  private readonly maxUploadBytes: number;

  constructor(
    private readonly prisma: AssetPrisma,
    private readonly storage: StoragePort | null,
    options: { maxUploadBytes?: number } = {},
  ) {
    this.maxUploadBytes = options.maxUploadBytes ?? maxUploadBytesFromEnv();
  }

  /** Fail-closed storage guard: 503 STORAGE_NOT_CONFIGURED, never a silent no-op. */
  private requireStorage(): StoragePort {
    if (!this.storage) {
      throw createAppError(
        'Object storage is not configured',
        503,
        'STORAGE_NOT_CONFIGURED',
      );
    }
    return this.storage;
  }

  private metadataOf(row: AssetRow): AssetMetadata {
    if (row.metadata && typeof row.metadata === 'object') {
      return row.metadata as AssetMetadata;
    }
    return {};
  }

  private keyOf(row: AssetRow): string | null {
    return row.url ?? this.metadataOf(row).storageKey ?? null;
  }

  private async toAsset(row: AssetRow): Promise<Asset> {
    const meta = this.metadataOf(row);
    const key = this.keyOf(row);
    const ready = meta.uploadStatus === 'READY' && key !== null;
    return {
      id: row.id,
      projectId: row.projectId,
      filename: row.filename,
      type: row.type,
      size: row.size,
      uploadedAt: row.createdAt,
      url: ready && this.storage ? await this.storage.getSignedUrl(key) : null,
      uploadStatus: ready ? 'READY' : 'PENDING',
      storageKey: key,
    };
  }

  /** Owner check that also admits legacy userId = null rows (see header). */
  private owns(row: AssetRow, userId: string): boolean {
    return row.userId === null || row.userId === userId;
  }

  private async findOwnedAsset(assetId: string, userId: string): Promise<AssetRow> {
    const row = (await this.prisma.editAsset.findFirst({
      where: { id: assetId },
    })) as AssetRow | null;

    if (!row || !this.owns(row, userId)) {
      throw createAppError('Asset not found', 404, 'ASSET_NOT_FOUND');
    }

    return row;
  }

  /**
   * Metadata-only create (POST /assets). Persists a PENDING row with no
   * storage key; the byte-upload entry point is generateUploadUrl.
   */
  async uploadAsset(input: UploadAssetInput): Promise<Asset> {
    const row = await this.prisma.editAsset.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        filename: input.filename,
        type: input.type,
        size: input.size,
        url: null,
        metadata: { uploadStatus: 'PENDING' },
      },
    });

    return this.toAsset(row as AssetRow);
  }

  /** Per-project list. Backs the intentionally-public project path (P0-2). */
  async listAssets(projectId: string): Promise<Asset[]> {
    const rows = (await this.prisma.editAsset.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    })) as AssetRow[];

    return Promise.all(rows.map((r) => this.toAsset(r)));
  }

  /**
   * Global list across the caller's projects (backs GET /assets, the path
   * the frontend api-client and its proxy agreed on in P0-2). `category`
   * maps to the asset `type`; `search` matches the filename,
   * case-insensitively. Newest first (createdAt has DB precision; the fake
   * in tests guarantees distinct timestamps).
   */
  async listAllAssets(userId: string, filters: ListAllAssetsFilters = {}): Promise<Asset[]> {
    const where: Record<string, unknown> = {
      OR: [{ userId }, { userId: null }],
    };
    if (filters.projectId) where['projectId'] = filters.projectId;
    if (filters.category) where['type'] = filters.category;
    if (filters.search) {
      where['filename'] = { contains: filters.search, mode: 'insensitive' };
    }

    const rows = (await this.prisma.editAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })) as AssetRow[];

    return Promise.all(rows.map((r) => this.toAsset(r)));
  }

  async getAsset(assetId: string, userId: string): Promise<Asset> {
    return this.toAsset(await this.findOwnedAsset(assetId, userId));
  }

  async deleteAsset(assetId: string, userId: string): Promise<void> {
    const row = await this.findOwnedAsset(assetId, userId);
    const key = this.keyOf(row);

    await this.prisma.editAsset.delete({ where: { id: assetId } });

    // Best-effort byte cleanup (D3-7): the row is already gone; an orphaned
    // object is cheaper than a lying API, so a storage failure is swallowed.
    if (key && this.storage) {
      try {
        await this.storage.delete(key);
      } catch {
        /* logged by the storage layer; row deletion already succeeded */
      }
    }
  }

  /**
   * Upload step 1: create the PENDING row, then issue a signed PUT URL for
   * its deterministic key. Content-length is signed, so `size` is the exact
   * byte count the client must PUT. Creates NO row when storage is
   * unconfigured (503) or the file exceeds the cap (413).
   */
  async generateUploadUrl(
    userId: string,
    input: GenerateUploadUrlInput,
  ): Promise<UploadUrlResult> {
    const storage = this.requireStorage();

    if (input.size > this.maxUploadBytes) {
      throw createAppError(
        `Asset exceeds the maximum upload size of ${this.maxUploadBytes} bytes`,
        413,
        'ASSET_TOO_LARGE',
      );
    }

    const filename = sanitizeFilename(input.filename);
    const row = (await this.prisma.editAsset.create({
      data: {
        userId,
        projectId: input.projectId,
        filename,
        type: typeFromContentType(input.contentType),
        size: input.size,
        url: null,
        metadata: { uploadStatus: 'PENDING', contentType: input.contentType },
      },
    })) as AssetRow;

    const key = `quantcooks/${userId}/${input.projectId}/${row.id}/${filename}`;

    await this.prisma.editAsset.update({
      where: { id: row.id },
      data: {
        metadata: {
          uploadStatus: 'PENDING',
          contentType: input.contentType,
          storageKey: key,
        },
      },
    });

    const signed = await storage.getSignedUploadUrl({
      key,
      contentType: input.contentType,
      contentLength: input.size,
      maxBytes: this.maxUploadBytes,
    });

    return {
      uploadUrl: signed.url,
      assetId: row.id,
      key,
      expiresAt: signed.expiresAt,
      requiredHeaders: signed.requiredHeaders,
      maxBytes: signed.maxBytes,
    };
  }

  /**
   * Upload step 3: verify the bytes actually landed (HeadObject) and mark
   * the row READY, persisting the object key in `url`. Idempotent for an
   * already-READY asset. 409 when nothing was uploaded or the landed size
   * differs from the declared size.
   */
  async completeUpload(assetId: string, userId: string): Promise<Asset> {
    const storage = this.requireStorage();
    const row = await this.findOwnedAsset(assetId, userId);
    const meta = this.metadataOf(row);

    if (meta.uploadStatus === 'READY' && row.url) {
      return this.toAsset(row);
    }

    const key = this.keyOf(row);
    if (!key) {
      throw createAppError(
        'Upload was never initiated for this asset',
        409,
        'UPLOAD_NOT_CONFIRMED',
      );
    }

    const head = await storage.headObject(key);
    if (!head) {
      throw createAppError(
        'Upload not confirmed: no object found in storage',
        409,
        'UPLOAD_NOT_CONFIRMED',
      );
    }

    if (head.contentLength !== row.size) {
      throw createAppError(
        `Upload size mismatch: expected ${row.size} bytes, found ${head.contentLength}`,
        409,
        'UPLOAD_SIZE_MISMATCH',
      );
    }

    const updated = (await this.prisma.editAsset.update({
      where: { id: row.id },
      data: {
        url: key,
        size: head.contentLength,
        metadata: {
          ...meta,
          storageKey: key,
          uploadStatus: 'READY',
          ...(head.etag ? { etag: head.etag } : {}),
        },
      },
    })) as AssetRow;

    return this.toAsset(updated);
  }
}
