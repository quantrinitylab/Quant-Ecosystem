// ============================================================================
// QuantMail Drive — Chunked Resumable Upload Service (Tasks QD-01, QD-02)
//
// Supports chunked multipart / TUS-style uploads for large files (> 50MB).
// Integrates with StorageQuotaService transactional reservation locks to prevent
// parallel upload quota bypasses.
// ============================================================================
import { createHash, randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import {
  encryptForDrive,
  putDriveObject,
  safeFileName,
  driveObjectKey,
  driveStorageReady,
  driveStorageUnavailableReason,
} from './drive-storage.service';
import { StorageQuotaService } from './storage-quota.service';

export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MiB
export const MIN_CHUNK_SIZE = 64 * 1024; // 64 KiB
export const MAX_CHUNK_SIZE = 20 * 1024 * 1024; // 20 MiB
export const MAX_UPLOAD_FILE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB
export const UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ChunkedSession {
  uploadId: string;
  userId: string;
  name: string;
  mimeType: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  folderId: string | null;
  chunks: Map<number, Buffer>;
  createdAt: number;
  expiresAt: number;
}

export interface InitiateChunkedInput {
  name: string;
  totalSize: number;
  mimeType?: string;
  folderId?: string | null;
  chunkSize?: number;
}

export interface ChunkedUploadPrismaClient {
  file: {
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
    delete(args: any): Promise<any>;
  };
  fileVersion: {
    create(args: any): Promise<any>;
  };
  folder: {
    findFirst(args: any): Promise<any>;
  };
  $transaction(callbackOrPromises: any): Promise<any>;
}

export class ChunkedUploadService {
  private static sessions = new Map<string, ChunkedSession>();

  constructor(
    private readonly prisma: ChunkedUploadPrismaClient,
    private readonly quotaService: StorageQuotaService,
  ) {}

  /**
   * Initiates a resumable chunked upload session.
   * Atomically locks storage quota for the full file size via StorageQuotaService.
   */
  async initiate(
    userId: string,
    input: InitiateChunkedInput,
  ): Promise<{
    uploadId: string;
    chunkSize: number;
    totalChunks: number;
    expiresAt: number;
  }> {
    if (!driveStorageReady()) {
      throw createAppError(driveStorageUnavailableReason(), 503, 'STORAGE_UNAVAILABLE');
    }

    const { name, totalSize, mimeType, folderId } = input;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw createAppError('File name is required', 400, 'VALIDATION_ERROR');
    }
    if (!Number.isSafeInteger(totalSize) || totalSize <= 0) {
      throw createAppError('Invalid file size', 400, 'VALIDATION_ERROR');
    }
    if (totalSize > MAX_UPLOAD_FILE_BYTES) {
      throw createAppError(
        `File exceeds maximum upload size of ${MAX_UPLOAD_FILE_BYTES} bytes`,
        413,
        'FILE_TOO_LARGE',
      );
    }

    const chunkSize = input.chunkSize ?? DEFAULT_CHUNK_SIZE;
    if (chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_CHUNK_SIZE) {
      throw createAppError(
        `Chunk size must be between ${MIN_CHUNK_SIZE} and ${MAX_CHUNK_SIZE} bytes`,
        400,
        'INVALID_CHUNK_SIZE',
      );
    }

    // Verify parent folder ownership if provided
    let verifiedFolderId: string | null = null;
    if (folderId) {
      const folder = await this.prisma.folder.findFirst({
        where: { id: folderId, userId, isDeleted: false },
      });
      if (!folder) {
        throw createAppError('Destination folder not found', 404, 'NOT_FOUND');
      }
      verifiedFolderId = folder.id;
    }

    const uploadId = randomUUID();
    const totalChunks = Math.ceil(totalSize / chunkSize);
    const now = Date.now();
    const expiresAt = now + UPLOAD_SESSION_TTL_MS;

    // Atomically reserve quota so parallel uploads cannot bypass quota limits
    await this.quotaService.reserveQuota(userId, totalSize, uploadId, UPLOAD_SESSION_TTL_MS);

    const session: ChunkedSession = {
      uploadId,
      userId,
      name: safeFileName(name),
      mimeType: mimeType || 'application/octet-stream',
      totalSize,
      chunkSize,
      totalChunks,
      folderId: verifiedFolderId,
      chunks: new Map(),
      createdAt: now,
      expiresAt,
    };

    ChunkedUploadService.sessions.set(uploadId, session);

    return {
      uploadId,
      chunkSize,
      totalChunks,
      expiresAt,
    };
  }

  /**
   * Uploads a single chunk of the file.
   */
  async uploadChunk(
    userId: string,
    uploadId: string,
    chunkIndex: number,
    chunkBuffer: Buffer,
    checksumSha256?: string,
  ): Promise<{
    uploadId: string;
    chunkIndex: number;
    receivedChunks: number;
    totalChunks: number;
    isComplete: boolean;
  }> {
    const session = this.getAndValidateSession(userId, uploadId);

    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      throw createAppError(
        `Invalid chunk index ${chunkIndex}. Total chunks: ${session.totalChunks}`,
        400,
        'INVALID_CHUNK_INDEX',
      );
    }

    // Determine expected size for this chunk
    const isLastChunk = chunkIndex === session.totalChunks - 1;
    const expectedSize = isLastChunk
      ? session.totalSize - chunkIndex * session.chunkSize
      : session.chunkSize;

    if (chunkBuffer.length !== expectedSize) {
      throw createAppError(
        `Chunk size mismatch: received ${chunkBuffer.length} bytes, expected ${expectedSize} bytes`,
        400,
        'CHUNK_SIZE_MISMATCH',
      );
    }

    // Verify SHA-256 checksum if provided by client
    if (checksumSha256) {
      const actualHash = createHash('sha256').update(chunkBuffer).digest('hex');
      if (actualHash.toLowerCase() !== checksumSha256.toLowerCase()) {
        throw createAppError('Chunk checksum verification failed', 400, 'CHECKSUM_MISMATCH');
      }
    }

    session.chunks.set(chunkIndex, chunkBuffer);

    return {
      uploadId,
      chunkIndex,
      receivedChunks: session.chunks.size,
      totalChunks: session.totalChunks,
      isComplete: session.chunks.size === session.totalChunks,
    };
  }

  /**
   * Returns current upload progress and missing chunk indices.
   */
  getStatus(
    userId: string,
    uploadId: string,
  ): {
    uploadId: string;
    name: string;
    totalSize: number;
    chunkSize: number;
    totalChunks: number;
    receivedChunks: number[];
    missingChunks: number[];
    isComplete: boolean;
    percentComplete: number;
  } {
    const session = this.getAndValidateSession(userId, uploadId);
    const received = Array.from(session.chunks.keys()).sort((a, b) => a - b);
    const missing: number[] = [];
    for (let i = 0; i < session.totalChunks; i++) {
      if (!session.chunks.has(i)) missing.push(i);
    }

    return {
      uploadId,
      name: session.name,
      totalSize: session.totalSize,
      chunkSize: session.chunkSize,
      totalChunks: session.totalChunks,
      receivedChunks: received,
      missingChunks: missing,
      isComplete: missing.length === 0,
      percentComplete: Number(((received.length / session.totalChunks) * 100).toFixed(1)),
    };
  }

  /**
   * Finalizes the chunked upload:
   * Stitches all chunks in order, encrypts with AES-256-GCM, stores to S3,
   * writes database records, and commits the quota reservation.
   */
  async complete(
    userId: string,
    uploadId: string,
  ): Promise<{
    file: any;
    quota: any;
  }> {
    const session = this.getAndValidateSession(userId, uploadId);

    if (session.chunks.size !== session.totalChunks) {
      const missing: number[] = [];
      for (let i = 0; i < session.totalChunks; i++) {
        if (!session.chunks.has(i)) missing.push(i);
      }
      throw createAppError(
        `Cannot complete upload: missing chunks [${missing.slice(0, 10).join(', ')}${
          missing.length > 10 ? '...' : ''
        }]`,
        400,
        'INCOMPLETE_UPLOAD',
      );
    }

    // Concatenate chunks in sequence
    const orderedBuffers: Buffer[] = [];
    for (let i = 0; i < session.totalChunks; i++) {
      orderedBuffers.push(session.chunks.get(i)!);
    }
    const fullBuffer = Buffer.concat(orderedBuffers, session.totalSize);

    // Encrypt ciphertext for Drive object storage
    const envelope = encryptForDrive(fullBuffer);

    // Create file DB row
    const file = await this.prisma.file.create({
      data: {
        userId,
        name: session.name,
        mimeType: session.mimeType,
        size: session.totalSize,
        folderId: session.folderId,
        encryptedContent: '',
        encryptionIV: envelope.iv,
        encryptionAuthTag: envelope.authTag,
        encryptionKey: envelope.wrappedKey,
        contentHash: envelope.contentHash,
      },
    });

    const key = driveObjectKey(
      userId,
      `${file.id}/versions/1-${randomUUID()}-${envelope.contentHash}`,
    );

    try {
      await putDriveObject(key, envelope.ciphertext);
      await this.prisma.$transaction([
        this.prisma.file.update({
          where: { id: file.id },
          data: { encryptedContent: key },
        }),
        this.prisma.fileVersion.create({
          data: {
            fileId: file.id,
            versionNumber: 1,
            encryptedContent: key,
            encryptionIV: envelope.iv,
            encryptionAuthTag: envelope.authTag,
            encryptionKey: envelope.wrappedKey,
            size: session.totalSize,
          },
        }),
      ]);
    } catch (error) {
      await this.prisma.file.delete({ where: { id: file.id } }).catch(() => undefined);
      throw error;
    }

    // Commit the quota reservation so it's converted to permanent usage
    this.quotaService.commitReservation(uploadId);
    ChunkedUploadService.sessions.delete(uploadId);

    const quota = await this.quotaService.getQuota(userId);

    return {
      file: {
        ...file,
        encryptedContent: key,
      },
      quota: {
        used: quota.usedBytes,
        total: quota.limitBytes,
      },
    };
  }

  /**
   * Aborts an upload session and releases the reserved quota.
   */
  async abort(userId: string, uploadId: string): Promise<void> {
    const session = ChunkedUploadService.sessions.get(uploadId);
    if (session) {
      if (session.userId !== userId) {
        throw createAppError('Forbidden', 403, 'FORBIDDEN');
      }
      session.chunks.clear();
      ChunkedUploadService.sessions.delete(uploadId);
    }
    this.quotaService.releaseReservation(uploadId);
  }

  /**
   * Cleans up expired sessions.
   */
  static cleanExpiredSessions(quotaService?: StorageQuotaService): void {
    const now = Date.now();
    for (const [id, session] of ChunkedUploadService.sessions.entries()) {
      if (session.expiresAt <= now) {
        session.chunks.clear();
        ChunkedUploadService.sessions.delete(id);
        if (quotaService) quotaService.releaseReservation(id);
      }
    }
  }

  /**
   * Clears all sessions (used in unit tests).
   */
  static clearSessions(): void {
    ChunkedUploadService.sessions.clear();
  }

  private getAndValidateSession(userId: string, uploadId: string): ChunkedSession {
    const session = ChunkedUploadService.sessions.get(uploadId);
    if (!session) {
      throw createAppError('Upload session not found or expired', 404, 'SESSION_NOT_FOUND');
    }
    if (session.userId !== userId) {
      throw createAppError('Forbidden', 403, 'FORBIDDEN');
    }
    if (session.expiresAt <= Date.now()) {
      ChunkedUploadService.sessions.delete(uploadId);
      this.quotaService.releaseReservation(uploadId);
      throw createAppError('Upload session has expired', 410, 'SESSION_EXPIRED');
    }
    return session;
  }
}
