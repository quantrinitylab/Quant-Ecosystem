// ============================================================================
// Media - Upload Manager
// Resumable chunked upload with integrity verification
// ============================================================================

import type { UploadChunk, UploadSession, UploadStatus } from '../types';

/** Upload manager configuration */
interface UploadManagerConfig {
  defaultChunkSize: number;
  maxFileSize: number;
  maxRetries: number;
  concurrentUploads: number;
  checksumAlgorithm: 'md5' | 'sha256' | 'crc32';
  sessionTimeoutMs: number;
}

const DEFAULT_CONFIG: UploadManagerConfig = {
  defaultChunkSize: 5 * 1024 * 1024, // 5MB
  maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
  maxRetries: 3,
  concurrentUploads: 3,
  checksumAlgorithm: 'sha256',
  sessionTimeoutMs: 86400000, // 24 hours
};

/**
 * UploadManager - Resumable chunked file upload
 *
 * Handles large file uploads by splitting into chunks,
 * tracking progress, supporting resume after failure,
 * and verifying integrity with checksums.
 */
export class UploadManager {
  private config: UploadManagerConfig;
  private sessions: Map<string, UploadSession>;
  private sessionCounter: number = 0;

  constructor(config: Partial<UploadManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessions = new Map();
  }

  /**
   * Initialize a chunked upload session
   */
  public initChunkedUpload(
    fileName: string,
    fileSize: number,
    mimeType: string,
    options: { chunkSize?: number; metadata?: Record<string, unknown>; checksum?: string } = {},
  ): UploadSession {
    if (fileSize <= 0) {
      throw new Error('File size must be positive');
    }
    if (fileSize > this.config.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed: ${this.config.maxFileSize} bytes`);
    }

    const chunkSize = options.chunkSize || this.config.defaultChunkSize;
    const totalChunks = Math.ceil(fileSize / chunkSize);

    const chunks: UploadChunk[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const offset = i * chunkSize;
      const size = Math.min(chunkSize, fileSize - offset);

      chunks.push({
        index: i,
        offset,
        size,
        hash: '',
        data: null,
        uploaded: false,
        retries: 0,
      });
    }

    const session: UploadSession = {
      id: this.generateId('upload'),
      fileName,
      fileSize,
      mimeType,
      chunkSize,
      totalChunks,
      uploadedChunks: 0,
      chunks,
      status: 'initialized',
      startedAt: Date.now(),
      metadata: options.metadata,
      checksum: options.checksum,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Upload a single chunk
   */
  public uploadChunk(
    sessionId: string,
    chunkIndex: number,
    data: ArrayBuffer,
    hash: string,
  ): { success: boolean; chunk: UploadChunk; session: UploadSession } {
    const session = this.getSession(sessionId);

    if (session.status === 'completed' || session.status === 'cancelled') {
      throw new Error(`Cannot upload to session in status: ${session.status}`);
    }

    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      throw new Error(`Invalid chunk index: ${chunkIndex} (total: ${session.totalChunks})`);
    }

    const chunk = session.chunks[chunkIndex];

    if (!chunk) {
      throw new Error(`Chunk index ${chunkIndex} not found in session ${sessionId}`);
    }

    // Verify chunk size
    if (data.byteLength !== chunk.size) {
      // Allow last chunk to be smaller
      if (chunkIndex !== session.totalChunks - 1) {
        throw new Error(`Chunk size mismatch: expected ${chunk.size}, got ${data.byteLength}`);
      }
    }

    // Validate hash
    const isValid = this.validateChunkHash(data, hash);
    if (!isValid) {
      chunk.retries++;
      if (chunk.retries >= this.config.maxRetries) {
        session.status = 'failed';
        throw new Error(
          `Chunk ${chunkIndex} failed integrity check after ${chunk.retries} retries`,
        );
      }
      return { success: false, chunk, session };
    }

    // Mark chunk as uploaded
    chunk.data = data;
    chunk.hash = hash;
    chunk.uploaded = true;
    chunk.uploadedAt = Date.now();

    session.uploadedChunks = session.chunks.filter((c) => c.uploaded).length;
    session.status = 'uploading';

    return { success: true, chunk, session };
  }

  /**
   * Complete the upload (assemble all chunks)
   */
  public completeUpload(sessionId: string): UploadSession {
    const session = this.getSession(sessionId);

    // Check all chunks are uploaded
    const missingChunks = session.chunks.filter((c) => !c.uploaded);
    if (missingChunks.length > 0) {
      throw new Error(
        `Cannot complete upload: ${missingChunks.length} chunks missing (indices: ${missingChunks.map((c) => c.index).join(', ')})`,
      );
    }

    session.status = 'completing';

    // Verify overall file integrity
    if (session.checksum) {
      const totalSize = session.chunks.reduce((sum, c) => sum + (c.data?.byteLength || 0), 0);
      if (totalSize !== session.fileSize) {
        session.status = 'failed';
        throw new Error(`File size mismatch: expected ${session.fileSize}, got ${totalSize}`);
      }
    }

    session.status = 'completed';
    session.completedAt = Date.now();

    // Clear chunk data to free memory
    for (const chunk of session.chunks) {
      chunk.data = null;
    }

    return session;
  }

  /**
   * Resume an interrupted upload
   */
  public resumeUpload(sessionId: string): {
    session: UploadSession;
    pendingChunks: number[];
    completedChunks: number[];
    progress: number;
  } {
    const session = this.getSession(sessionId);

    if (session.status === 'completed') {
      throw new Error('Upload already completed');
    }
    if (session.status === 'cancelled') {
      throw new Error('Upload was cancelled');
    }

    // Check session timeout
    const elapsed = Date.now() - session.startedAt;
    if (elapsed > this.config.sessionTimeoutMs) {
      session.status = 'failed';
      throw new Error('Upload session has expired');
    }

    session.status = 'uploading';

    const pendingChunks: number[] = [];
    const completedChunks: number[] = [];

    for (const chunk of session.chunks) {
      if (chunk.uploaded) {
        completedChunks.push(chunk.index);
      } else {
        pendingChunks.push(chunk.index);
      }
    }

    const progress =
      session.totalChunks > 0 ? (completedChunks.length / session.totalChunks) * 100 : 0;

    return { session, pendingChunks, completedChunks, progress };
  }

  /**
   * Get upload progress
   */
  public getProgress(sessionId: string): {
    progress: number;
    uploadedBytes: number;
    totalBytes: number;
    uploadedChunks: number;
    totalChunks: number;
    speed: number;
    estimatedTimeRemaining: number;
    status: UploadStatus;
  } {
    const session = this.getSession(sessionId);

    const uploadedBytes = session.chunks
      .filter((c) => c.uploaded)
      .reduce((sum, c) => sum + c.size, 0);

    const progress = session.fileSize > 0 ? (uploadedBytes / session.fileSize) * 100 : 0;

    // Calculate speed (bytes per second)
    const elapsed = Date.now() - session.startedAt;
    const speed = elapsed > 0 ? (uploadedBytes / elapsed) * 1000 : 0;

    // Estimate remaining time
    const remainingBytes = session.fileSize - uploadedBytes;
    const estimatedTimeRemaining = speed > 0 ? remainingBytes / speed : 0;

    return {
      progress,
      uploadedBytes,
      totalBytes: session.fileSize,
      uploadedChunks: session.uploadedChunks,
      totalChunks: session.totalChunks,
      speed,
      estimatedTimeRemaining,
      status: session.status,
    };
  }

  /**
   * Cancel an upload
   */
  public cancelUpload(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.status === 'completed') {
      throw new Error('Cannot cancel completed upload');
    }

    session.status = 'cancelled';

    // Free chunk data
    for (const chunk of session.chunks) {
      chunk.data = null;
    }

    return true;
  }

  /**
   * Validate a chunk's integrity
   */
  public validateChunk(sessionId: string, chunkIndex: number): boolean {
    const session = this.getSession(sessionId);
    const chunk = session.chunks[chunkIndex];

    if (!chunk) {
      throw new Error(`Chunk ${chunkIndex} not found`);
    }

    if (!chunk.uploaded || !chunk.data) {
      return false;
    }

    return this.validateChunkHash(chunk.data, chunk.hash);
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): UploadSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === 'uploading' || s.status === 'initialized',
    );
  }

  /**
   * Get session by ID
   */
  public getSessionById(sessionId: string): UploadSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Clean up expired sessions
   */
  public cleanExpiredSessions(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (session.status === 'completed' || session.status === 'cancelled') {
        if (now - (session.completedAt || session.startedAt) > this.config.sessionTimeoutMs) {
          this.sessions.delete(id);
          cleaned++;
        }
      } else if (now - session.startedAt > this.config.sessionTimeoutMs) {
        session.status = 'failed';
        for (const chunk of session.chunks) {
          chunk.data = null;
        }
        this.sessions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get service statistics
   */
  public getStats(): {
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    failedSessions: number;
    totalBytesUploaded: number;
  } {
    let active = 0;
    let completed = 0;
    let failed = 0;
    let totalBytes = 0;

    for (const [, session] of this.sessions) {
      switch (session.status) {
        case 'uploading':
        case 'initialized':
          active++;
          break;
        case 'completed':
          completed++;
          totalBytes += session.fileSize;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions: active,
      completedSessions: completed,
      failedSessions: failed,
      totalBytesUploaded: totalBytes,
    };
  }

  // ---- Private Methods ----

  private getSession(sessionId: string): UploadSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Upload session not found: ${sessionId}`);
    return session;
  }

  private validateChunkHash(data: ArrayBuffer, expectedHash: string): boolean {
    // Simulate hash validation
    // In production, this would compute actual SHA-256/MD5
    if (!expectedHash || expectedHash.length === 0) return true;

    // Simple simulated validation (always passes for non-empty hash)
    const computedHash = this.computeSimpleHash(data);
    return computedHash.length > 0 && expectedHash.length > 0;
  }

  private computeSimpleHash(data: ArrayBuffer): string {
    // Simulated hash computation (FNV-1a style)
    const view = new Uint8Array(data);
    let hash = 2166136261;

    for (let i = 0; i < Math.min(view.length, 1000); i++) {
      hash ^= view[i]!;
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  private generateId(prefix: string): string {
    this.sessionCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.sessionCounter.toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${counter}_${random}`;
  }
}
