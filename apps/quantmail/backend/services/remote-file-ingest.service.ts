/**
 * ============================================================================
 * QuantMail Drive — Portus v1.0.6-Grade Remote URL File Ingest & Download Token Engine
 *
 * Industrial remote URL file leeching and time-limited token-governed file distribution:
 * - Remote URL file ingestion: RFC protocol validation, path-derived filename inference,
 *   streaming size probing, storage quota cap checks, and asynchronous progress tracking.
 * - Time-limited HMAC-SHA256 download tokens: Cryptographically tamper-proof tokens
 *   binding file ID, expiration timestamp, maximum download quotas, IP restriction gating,
 *   and instantaneous revocation.
 * ============================================================================
 */

import { createHmac, randomUUID } from 'node:crypto';

export interface RemoteUrlIngestRequest {
  workspaceId: string;
  userId: string;
  sourceUrl: string;
  destinationFolderId?: string;
  customFileName?: string;
  maxSizeBytes?: number;
}

export interface RemoteUrlIngestJob {
  id: string;
  workspaceId: string;
  userId: string;
  sourceUrl: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  status: 'PENDING' | 'DOWNLOADING' | 'COMPLETED' | 'FAILED';
  downloadedBytes: number;
  progressPercentage: number;
  fileRecordId?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  destinationFolderId?: string;
  maxSizeBytes?: number;
}

export interface DownloadTokenConfig {
  fileId: string;
  workspaceId: string;
  ttlSeconds?: number; // default 3600 (1 hour)
  maxDownloads?: number; // default unlimited (null)
  allowedIp?: string;
  speedLimitKbps?: number;
}

export interface GeneratedDownloadToken {
  token: string;
  fileId: string;
  downloadUrl: string;
  expiresAt: number; // timestamp ms
  maxDownloads: number | null;
  downloadCount: number;
  speedLimitKbps: number;
  isRevoked: boolean;
  allowedIp?: string;
  workspaceId?: string;
}

// In-memory job and token stores
const ingestJobsStore = new Map<string, RemoteUrlIngestJob>();
const downloadTokensStore = new Map<string, GeneratedDownloadToken>();

/**
 * Standard MIME map by file extension
 */
const EXTENSION_MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.tar.gz': 'application/gzip',
  '.tgz': 'application/gzip',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.bin': 'application/octet-stream',
  '.iso': 'application/x-iso9660-image',
};

/**
 * Infers MIME type from a filename extension.
 */
export function inferMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  for (const [ext, mime] of Object.entries(EXTENSION_MIME_MAP)) {
    if (lower.endsWith(ext)) {
      return mime;
    }
  }
  return 'application/octet-stream';
}

/**
 * Derives a clean filename from a remote URL pathname if not supplied.
 */
export function deriveFileNameFromUrl(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const pathname = parsed.pathname;
    const segments = pathname.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1];

    if (lastSegment && lastSegment.trim().length > 0) {
      const decoded = decodeURIComponent(lastSegment.trim());
      // Sanitize unsafe path characters
      const sanitized = decoded.replace(/[\\/:*?"<>|]/g, '_');
      if (sanitized.length > 0) {
        return sanitized;
      }
    }
  } catch {
    // Malformed URL will be caught during validation
  }
  return 'downloaded_file.bin';
}

/**
 * Creates a new remote URL ingest job.
 * - Validates URL protocol (`http:` or `https:`).
 * - Derives filename from URL pathname if not supplied.
 * - Initializes job with status `'PENDING'`.
 */
export function createUrlIngestJob(
  request: RemoteUrlIngestRequest,
  _secretKey?: string,
): RemoteUrlIngestJob {
  if (!request.sourceUrl || typeof request.sourceUrl !== 'string') {
    throw new Error('sourceUrl is required and must be a valid string');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(request.sourceUrl);
  } catch {
    throw new Error(`Invalid URL format: '${request.sourceUrl}'`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Unsupported protocol '${parsedUrl.protocol}'. Only HTTP and HTTPS URLs are supported.`,
    );
  }

  const fileName =
    request.customFileName && request.customFileName.trim().length > 0
      ? request.customFileName.trim()
      : deriveFileNameFromUrl(request.sourceUrl);

  const mimeType = inferMimeType(fileName);

  const job: RemoteUrlIngestJob = {
    id: `ingest_${randomUUID()}`,
    workspaceId: request.workspaceId,
    userId: request.userId,
    sourceUrl: request.sourceUrl,
    fileName,
    fileSizeBytes: 0,
    mimeType,
    status: 'PENDING',
    downloadedBytes: 0,
    progressPercentage: 0,
    destinationFolderId: request.destinationFolderId,
    maxSizeBytes: request.maxSizeBytes,
    createdAt: new Date().toISOString(),
  };

  ingestJobsStore.set(job.id, job);
  return { ...job };
}

/**
 * Simulates remote header probe and streaming download.
 * Sets progressPercentage = 100, status 'COMPLETED', and sets fileRecordId.
 */
export async function processUrlIngestJob(
  jobId: string,
  simulatedFileSize?: number,
  simulatedMime?: string,
): Promise<RemoteUrlIngestJob> {
  const job = ingestJobsStore.get(jobId);
  if (!job) {
    throw new Error(`Ingest job not found: '${jobId}'`);
  }

  if (job.status === 'COMPLETED' || job.status === 'FAILED') {
    return { ...job };
  }

  // Transition to DOWNLOADING
  job.status = 'DOWNLOADING';
  job.progressPercentage = 30;

  const targetSize =
    simulatedFileSize !== undefined && simulatedFileSize >= 0
      ? simulatedFileSize
      : job.fileSizeBytes > 0
        ? job.fileSizeBytes
        : 1048576; // 1 MiB default

  // Quota / maximum size validation gate
  if (job.maxSizeBytes !== undefined && targetSize > job.maxSizeBytes) {
    job.status = 'FAILED';
    job.error = `Remote file size (${targetSize} bytes) exceeds maximum allowed size (${job.maxSizeBytes} bytes)`;
    job.completedAt = new Date().toISOString();
    return { ...job };
  }

  // Simulate streaming download completion
  job.fileSizeBytes = targetSize;
  job.downloadedBytes = targetSize;
  job.progressPercentage = 100;
  if (simulatedMime) {
    job.mimeType = simulatedMime;
  }
  job.status = 'COMPLETED';
  job.fileRecordId = `file_${randomUUID()}`;
  job.completedAt = new Date().toISOString();

  return { ...job };
}

/**
 * Retrieves the status of an ingest job by ID.
 */
export function getIngestJobStatus(jobId: string): RemoteUrlIngestJob | null {
  const job = ingestJobsStore.get(jobId);
  return job ? { ...job } : null;
}

/**
 * Lists all ingest jobs, optionally filtered by workspace ID.
 */
export function listIngestJobs(workspaceId?: string): RemoteUrlIngestJob[] {
  const jobs = Array.from(ingestJobsStore.values());
  if (workspaceId) {
    return jobs.filter((j) => j.workspaceId === workspaceId);
  }
  return jobs.map((j) => ({ ...j }));
}

/**
 * Generates an HMAC-SHA256 signature token binding (fileId, expiresAt, maxDownloads).
 * Returns GeneratedDownloadToken.
 */
export function generateDownloadToken(
  config: DownloadTokenConfig,
  secretKey: string,
): GeneratedDownloadToken {
  if (!secretKey || typeof secretKey !== 'string' || secretKey.trim().length === 0) {
    throw new Error('Secret key is required for download token generation');
  }

  if (!config.fileId || typeof config.fileId !== 'string') {
    throw new Error('File ID is required');
  }

  const ttlSeconds = config.ttlSeconds !== undefined ? config.ttlSeconds : 3600;
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const maxDownloads = config.maxDownloads !== undefined ? config.maxDownloads : null;
  const speedLimitKbps = config.speedLimitKbps !== undefined ? config.speedLimitKbps : 0;
  const nonce = randomUUID();

  // Bind fileId, expiresAt, maxDownloads, and nonce into payload
  const payloadData = `${config.fileId}:${expiresAt}:${maxDownloads ?? 'null'}:${nonce}`;
  const encodedPayload = Buffer.from(payloadData, 'utf8').toString('base64url');
  const signature = createHmac('sha256', secretKey).update(payloadData).digest('hex');

  const tokenString = `${encodedPayload}.${signature}`;
  const downloadUrl = `/api/drive/download?token=${tokenString}`;

  const generatedToken: GeneratedDownloadToken = {
    token: tokenString,
    fileId: config.fileId,
    downloadUrl,
    expiresAt,
    maxDownloads,
    downloadCount: 0,
    speedLimitKbps,
    isRevoked: false,
    allowedIp: config.allowedIp,
    workspaceId: config.workspaceId,
  };

  downloadTokensStore.set(tokenString, generatedToken);
  return { ...generatedToken };
}

/**
 * Validates an HMAC-signed download token.
 * - Verifies HMAC signature against payload.
 * - Checks expiration (expiresAt > Date.now()).
 * - Checks download cap against maxDownloads.
 * - Verifies IP restriction if allowedIp is configured.
 * - If valid, increments downloadCount.
 */
export function validateDownloadToken(
  tokenString: string,
  secretKey: string,
  clientIp?: string,
): { valid: boolean; token?: GeneratedDownloadToken; error?: string } {
  if (!tokenString || typeof tokenString !== 'string') {
    return { valid: false, error: 'Token string is required' };
  }

  const parts = tokenString.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed token structure' };
  }

  const [encodedPayload, signature] = parts;
  let payloadData: string;
  try {
    payloadData = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return { valid: false, error: 'Invalid token payload encoding' };
  }

  // Cryptographic signature check
  const expectedSignature = createHmac('sha256', secretKey).update(payloadData).digest('hex');
  if (signature !== expectedSignature) {
    return { valid: false, error: 'Invalid or tampered token signature' };
  }

  // Store lookup
  const stored = downloadTokensStore.get(tokenString);
  if (!stored) {
    return { valid: false, error: 'Token not found or expired' };
  }

  // Revocation gate
  if (stored.isRevoked) {
    return { valid: false, error: 'Download token has been revoked' };
  }

  // Expiration check
  if (stored.expiresAt <= Date.now()) {
    return { valid: false, error: 'Download token has expired' };
  }

  // Max downloads check
  if (stored.maxDownloads !== null && stored.downloadCount >= stored.maxDownloads) {
    return { valid: false, error: 'Maximum download limit reached' };
  }

  // IP restriction check
  if (stored.allowedIp) {
    if (!clientIp) {
      return { valid: false, error: 'Client IP address required for restricted download token' };
    }
    if (stored.allowedIp !== clientIp) {
      return {
        valid: false,
        error: `Client IP '${clientIp}' is not authorized to use this download token`,
      };
    }
  }

  // Valid token: increment download counter
  stored.downloadCount += 1;

  return {
    valid: true,
    token: { ...stored },
  };
}

/**
 * Revokes a download token immediately.
 */
export function revokeDownloadToken(tokenString: string): boolean {
  const token = downloadTokensStore.get(tokenString);
  if (!token) {
    return false;
  }
  token.isRevoked = true;
  return true;
}

/**
 * Lists all download tokens, optionally filtered by file ID.
 */
export function listDownloadTokens(fileId?: string): GeneratedDownloadToken[] {
  const tokens = Array.from(downloadTokensStore.values());
  if (fileId) {
    return tokens.filter((t) => t.fileId === fileId).map((t) => ({ ...t }));
  }
  return tokens.map((t) => ({ ...t }));
}

/**
 * Clears in-memory stores for isolated test runs.
 */
export function clearRemoteIngestForTesting(): void {
  ingestJobsStore.clear();
  downloadTokensStore.clear();
}
