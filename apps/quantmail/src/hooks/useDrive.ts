// ============================================================================
// QuantMail - useDrive Hook
// Drive operations: upload with progress, folder CRUD, share, versions, move
// ============================================================================

import { useState, useCallback, useRef } from 'react';
import { logger } from '@quant/common';
import { browserApiRequest as apiRequest } from '../services/browser-api-request';
import { getUploadBatchError } from '../lib/drive-upload-results';

export interface DriveFile {
  id: string;
  name: string;
  // QM-UIUX-079: the /drive/files projection of doc-editor documents
  // (backend id `doc:<documentId>`) flows through the same listings.
  type: 'file' | 'folder' | 'document';
  mimeType: string;
  size: number;
  path: string;
  parentId: string | null;
  modifiedAt: string;
  // QM-M39-002: last explicit open (preview/download/open). Null when the file
  // was never opened — clients fall back to modifiedAt for recency display.
  lastOpenedAt?: string | null;
  owner: { name: string; email: string };
  sharedWith: { email: string; permission: 'view' | 'edit' | 'admin' }[];
  isStarred: boolean;
  versions: { id: string; version: number; size: number; date: string }[];
  thumbnailUrl?: string;
  deletedAt?: string;
  // QM-M39-009: security scan state from the backend. 'unknown' is honest for
  // unscanned files — the UI must never render it as safe.
  scanStatus?: string | null;
  scanReason?: string | null;
  scannedAt?: string | null;
}

export interface ReceivedShare {
  id: string;
  fileId: string | null;
  folderId: string | null;
  permission: 'view' | 'edit' | 'admin';
  status: string;
  createdAt: string;
  owner: { name: string; email: string };
  file: { id: string; name: string; mimeType: string; size: number; updatedAt: string; scanStatus?: string | null; scanReason?: string | null } | null;
  folder: { id: string; name: string; path: string; updatedAt: string } | null;
}

// QM-M39-002 — "Recent" view: one page of the server-side recency-ordered
// file list from GET /api/drive/recent. Ordering is computed by the backend
// (max(lastOpenedAt, updatedAt)); the client must not re-sort.
export interface RecentFilesPage {
  files: DriveFile[];
  totalCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}
// QM-M39-001 — "Shared by me": one record per owned file/folder the user has
// shared, as returned by GET /api/drive/shares/sent.
export interface SentShareRecipient {
  name: string;
  email: string;
  permission: 'view' | 'edit' | 'admin';
  status: string;
  sharedAt: string;
}

export interface SentShareItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType: string;
  size: number;
  updatedAt: string;
  sharedCount: number;
  // QM-M39-009: real scan state from GET /drive/shares/sent. 'unknown' is
  // honest for unscanned files — the badge never renders it as safe.
  scanStatus?: string | null;
  scanReason?: string | null;
  sharedWith: SentShareRecipient[];
  linkShare: {
    role: string;
    requiresPassword: boolean;
    expiresAt: string | null;
    createdAt?: string;
  } | null;
}

interface StorageQuota {
  used: number;
  total: number;
}

interface ShareParams {
  fileId: string;
  email: string;
  permission: 'view' | 'edit' | 'admin';
}

export interface UseDriveReturn {
  files: DriveFile[];
  loading: boolean;
  error: string | null;
  quota: StorageQuota | null;
  currentFolderId: string | null;
  breadcrumbs: { id: string | null; name: string }[];
  fetchFiles: (folderId?: string | null, filter?: string | null) => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  createFolder: (name: string, parentId?: string | null) => Promise<DriveFile>;
  deleteFiles: (fileIds: string[]) => Promise<void>;
  renameFile: (fileId: string, newName: string) => Promise<void>;
  moveFiles: (fileIds: string[], targetFolderId: string) => Promise<void>;
  copyFile: (fileId: string, targetFolderId: string) => Promise<DriveFile | null>;
  shareFile: (params: ShareParams) => Promise<void>;
  unshareFile: (fileId: string, email: string) => Promise<void>;
  starFile: (fileId: string) => Promise<void>;
  unstarFile: (fileId: string) => Promise<void>;
  getVersionHistory: (fileId: string) => Promise<void>;
  restoreVersion: (fileId: string, versionId: string) => Promise<void>;
  navigateToFolder: (folderId: string | null, folderName?: string) => void;
  navigateToBreadcrumb: (index: number) => void;
  searchFiles: (query: string) => Promise<void>;
  getDownloadUrl: (fileId: string) => string;
  downloadFile: (fileId: string, fileName?: string) => Promise<void>;
  acceptShare: (shareId: string) => Promise<{ success: boolean; share: any }>;
  declineShare: (shareId: string) => Promise<{ success: boolean; share: any }>;
  fetchReceivedShares: () => Promise<ReceivedShare[]>;
  fetchRecentFiles: (cursor?: string | null) => Promise<RecentFilesPage>;
  recordFileOpen: (fileId: string) => Promise<void>;
  fetchSentShares: () => Promise<SentShareItem[]>;
  fetchTrashFiles: () => Promise<DriveFile[]>;
  restoreFile: (fileId: string) => Promise<void>;
  purgeFile: (fileId: string) => Promise<void>;
}

const getDriveErrorMessage = (err: unknown, fallback: string): string => {
  const message = err instanceof Error ? err.message : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('401') || normalized.includes('unauthorized')) {
    return 'Your Drive session expired. Refresh or sign in again, then retry.';
  }

  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('load failed') ||
    normalized.includes('fetch files')
  ) {
    return `${fallback} Your files are safe.`;
  }

  return message || fallback;
};

// QM-M39-009: read the backend's error instruction (e.g. FILE_QUARANTINED)
// so quarantine blocks surface an instruction, never a generic error.
// Returns null when the body carries no usable message.
// QM-SCREEN-011: exported so the Drive preview modal reuses the same honest
// error surfacing for its authenticated blob-preview fetches.
export const readErrorInstruction = async (response: Response): Promise<string | null> => {
  try {
    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) return null;
    const data = await response.clone().json();
    const message = data?.error?.message;
    return typeof message === 'string' && message.trim() ? message : null;
  } catch {
    return null;
  }
};

// isDocumentDriveId lives in lib/drive-ids.ts (zero-dependency) so
// presentational components can use it without pulling this module.
export { isDocumentDriveId } from '../lib/drive-ids';

// ============================================================================
// Resumable chunked uploads (QM-SCREEN-011 P0).
//
// The one-shot base64 JSON POST meant a dropped network restarted the whole
// file from zero. The backend already exposes a FastCDC chunk protocol —
// POST /api/drive/upload/chunk/initiate, POST /:uploadId, GET /:uploadId/status,
// POST /:uploadId/complete, POST /:uploadId/abort — and the catch-all
// src/app/api/[...path]/route.ts forwards every /api/drive/* path, so no
// dedicated Next proxy routes are needed. The client below slices each file
// into chunks, POSTs them sequentially with progress, retries failed chunks,
// and resumes an interrupted upload from the server-reported missing chunks.
// ============================================================================

/** 5 MiB per chunk — inside the backend's 64 KiB..20 MiB per-chunk window. */
const RESUMABLE_CHUNK_SIZE = 5 * 1024 * 1024;
/** Backend MAX_UPLOAD_FILE_BYTES for chunked uploads; 413 above this. */
const RESUMABLE_MAX_BYTES = 5 * 1024 * 1024 * 1024;
const CHUNK_RETRY_ATTEMPTS = 3;
const CHUNK_RETRY_BASE_MS = 800;

interface ChunkedSessionBinding {
  serverUploadId: string;
  fingerprint: string;
}

/**
 * Browser-side registry of live server sessions, keyed by file fingerprint
 * (name + size + mtime + folder). Survives a failed uploadFiles call, so
 * retrying the same File resumes the SAME server session through the status
 * endpoint instead of re-uploading chunks the server already received.
 */
const resumableSessions = new Map<string, string>();

/** Test-only escape hatch: drop all remembered sessions between cases. */
export function clearResumableUploadSessionsForTests(): void {
  resumableSessions.clear();
}

const resumableFingerprint = (file: File, folderId: string | null): string =>
  `${file.name}|${file.size}|${file.lastModified}|${folderId ?? ''}`;

const sleepAbortable = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Upload cancelled'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Upload cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

const blobToBase64 = async (blob: Blob): Promise<string> => {
  // arrayBuffer + chunked btoa: no FileReader dependency, so this works in
  // the node-environment unit tests as well as the browser.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + STEP)));
  }
  return btoa(binary);
};

/** Verbatim backend error message when the body carries one — honest errors only. */
const extractChunkApiError = async (response: Response, fallback: string): Promise<string> => {
  const text = await response.text().catch(() => '');
  if (!text) return response.statusText || fallback;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return parsed.error?.message || parsed.message || text || fallback;
  } catch {
    return text || response.statusText || fallback;
  }
};

const initiateChunkedSession = async (
  file: File,
  folderId: string | null,
  signal: AbortSignal,
): Promise<{ uploadId: string; chunkSize: number; totalChunks: number }> => {
  const response = await apiRequest('/api/drive/upload/chunk/initiate', {
    method: 'POST',
    signal,
    body: JSON.stringify({
      name: file.name || 'untitled',
      totalSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      folderId,
      chunkSize: RESUMABLE_CHUNK_SIZE,
    }),
  });
  if (!response.ok) throw new Error(await extractChunkApiError(response, 'Upload failed'));
  const session = (await response.json()) as {
    uploadId: string;
    chunkSize: number;
    totalChunks: number;
  };
  return { uploadId: session.uploadId, chunkSize: session.chunkSize, totalChunks: session.totalChunks };
};

interface ChunkedSessionState {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  missingChunks: number[];
}

/**
 * Ask the server which chunks of a remembered session already landed.
 * Returns null when the session is gone server-side (expired / backend
 * restarted) — the caller then initiates a fresh session.
 */
const queryMissingChunks = async (
  serverUploadId: string,
  signal: AbortSignal,
): Promise<ChunkedSessionState | null> => {
  const response = await apiRequest(
    `/api/drive/upload/chunk/${encodeURIComponent(serverUploadId)}/status`,
    { signal },
  );
  if (!response.ok) return null;
  const status = (await response.json()) as {
    uploadId: string;
    chunkSize: number;
    totalChunks: number;
    missingChunks: number[];
  };
  return {
    uploadId: status.uploadId,
    chunkSize: status.chunkSize,
    totalChunks: status.totalChunks,
    missingChunks: [...status.missingChunks].sort((a, b) => a - b),
  };
};

const postChunkWithRetry = async (
  serverUploadId: string,
  chunkIndex: number,
  contentBase64: string,
  signal: AbortSignal,
): Promise<void> => {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= CHUNK_RETRY_ATTEMPTS; attempt++) {
    if (signal.aborted) throw new Error('Upload cancelled');
    let response: Response | null = null;
    try {
      response = await apiRequest(
        `/api/drive/upload/chunk/${encodeURIComponent(serverUploadId)}`,
        { method: 'POST', signal, body: JSON.stringify({ chunkIndex, contentBase64 }) },
      );
    } catch (networkError) {
      // Network failure / timeout — retryable. A user abort is caught by the
      // signal check below and is never retried.
      lastError = networkError instanceof Error ? networkError : new Error('Upload failed');
    }
    if (response) {
      if (response.ok) return;
      const message = await extractChunkApiError(response, 'Upload failed');
      lastError = new Error(message);
      // 4xx (other than 408/429) is a terminal client error — retrying a
      // rejected chunk is pointless. 5xx / 408 / 429 may recover.
      const retryable = response.status >= 500 || response.status === 408 || response.status === 429;
      if (!retryable) throw lastError;
    }
    if (signal.aborted) throw new Error('Upload cancelled');
    if (attempt < CHUNK_RETRY_ATTEMPTS) {
      await sleepAbortable(CHUNK_RETRY_BASE_MS * 2 ** (attempt - 1), signal);
    }
  }
  throw lastError ?? new Error('Upload failed');
};

const completeChunkedSession = async (
  serverUploadId: string,
  signal: AbortSignal,
): Promise<void> => {
  const response = await apiRequest(
    `/api/drive/upload/chunk/${encodeURIComponent(serverUploadId)}/complete`,
    { method: 'POST', signal, body: JSON.stringify({}) },
  );
  if (!response.ok) throw new Error(await extractChunkApiError(response, 'Upload failed'));
};

interface ResumableUploadTask {
  file: File;
  folderId: string | null;
  signal: AbortSignal;
  // Optional: no UI consumes per-file progress anymore, so callers pass no
  // callbacks and the machinery still drives the chunk protocol honestly.
  onProgress?: (percent: number) => void;
  onSession?: (binding: ChunkedSessionBinding) => void;
}

const uploadFileResumable = async (task: ResumableUploadTask): Promise<void> => {
  const { file, folderId, signal, onProgress, onSession } = task;

  // QM-SCREEN-011 R2: empty files have no upload path — the chunked protocol
  // requires a non-empty file and the backend one-shot route rejects them
  // with 400 'Empty file'. Refuse up front with an honest message instead of
  // calling the one-shot route (it can never succeed for 0-byte files).
  if (file.size === 0) {
    throw new Error("Empty files can't be uploaded yet");
  }
  // Client-side guard mirrors the backend 413 so the limit is visible up
  // front; the backend stays the authority — its message surfaces verbatim.
  if (file.size > RESUMABLE_MAX_BYTES) {
    throw new Error(`File exceeds maximum upload size of ${RESUMABLE_MAX_BYTES} bytes`);
  }
  if (signal.aborted) throw new Error('Upload cancelled');

  const fingerprint = resumableFingerprint(file, folderId);
  let session: ChunkedSessionState | null = null;

  const remembered = resumableSessions.get(fingerprint);
  if (remembered) {
    const resumed = await queryMissingChunks(remembered, signal);
    if (resumed) {
      session = resumed;
    } else {
      resumableSessions.delete(fingerprint);
    }
  }
  if (!session) {
    const initiated = await initiateChunkedSession(file, folderId, signal);
    session = {
      ...initiated,
      missingChunks: Array.from({ length: initiated.totalChunks }, (_, i) => i),
    };
    resumableSessions.set(fingerprint, session.uploadId);
  }

  const { uploadId: serverUploadId, chunkSize, totalChunks } = session;
  onSession?.({ serverUploadId, fingerprint });

  const chunkByteSize = (index: number): number =>
    index === totalChunks - 1 ? file.size - index * chunkSize : chunkSize;

  // Bytes already confirmed on the server (resume case) count toward progress.
  let uploadedBytes = 0;
  for (let i = 0; i < totalChunks; i++) {
    if (!session.missingChunks.includes(i)) uploadedBytes += chunkByteSize(i);
  }
  onProgress?.(Math.min(100, Math.round((uploadedBytes / file.size) * 100)));

  for (const chunkIndex of session.missingChunks) {
    if (signal.aborted) throw new Error('Upload cancelled');
    const start = chunkIndex * chunkSize;
    const contentBase64 = await blobToBase64(
      file.slice(start, Math.min(start + chunkSize, file.size)),
    );
    await postChunkWithRetry(serverUploadId, chunkIndex, contentBase64, signal);
    uploadedBytes += chunkByteSize(chunkIndex);
    onProgress?.(Math.min(100, Math.round((uploadedBytes / file.size) * 100)));
  }

  await completeChunkedSession(serverUploadId, signal);
  resumableSessions.delete(fingerprint);
  onProgress?.(100);
};

export function useDrive(): UseDriveReturn {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Quota is unknown until the backend answers: a fabricated 15 GB default
  // used to sit here, presenting invented quota before the first fetch.
  const [quota, setQuota] = useState<StorageQuota | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: 'My Drive' },
  ]);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const fetchSeqRef = useRef<number>(0);

  const fetchFiles = useCallback(
    async (folderId?: string | null, filter?: string | null) => {
      const seq = ++fetchSeqRef.current;
      setLoading(true);
      setError(null);
      const targetFolder = folderId !== undefined ? folderId : currentFolderId;
      try {
        const params = new URLSearchParams();
        if (targetFolder) params.set('folderId', targetFolder);
        if (filter && filter !== 'all') params.set('filter', filter);
        const response = await apiRequest(`/api/drive/files?${params}`);
        if (!response.ok) throw new Error('Failed to fetch files');
        const data = await response.json();
        if (seq === fetchSeqRef.current) {
          setFiles(data.files || []);
          if (data.quota) setQuota(data.quota);
        }
      } catch (err) {
        if (seq === fetchSeqRef.current) {
          setError(
            getDriveErrorMessage(err, 'Drive is temporarily unavailable. Retry in a moment.'),
          );
        }
      } finally {
        if (seq === fetchSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [currentFolderId],
  );

  const uploadFiles = useCallback(
    async (fileList: File[]) => {
      setError(null);
      const failures: string[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const uploadId = `upload-${Date.now()}-${i}`;
        const controller = new AbortController();
        abortControllers.current.set(uploadId, controller);

        try {
          // Upload progress is deliberately untracked: no consumer ever
          // rendered the uploads list, so per-file progress state was dead
          // weight. Success/failure surfaces through fetchFiles + toasts.
          await uploadFileResumable({
            file,
            folderId: currentFolderId,
            signal: controller.signal,
          });

          // Honest signal for the Drive mascot's success acknowledgement —
          // fired only here, after the upload truly completed (never on error).
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('quant:drive:upload-complete'));
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Upload failed';
          failures.push(errorMsg);
        } finally {
          abortControllers.current.delete(uploadId);
        }
      }
      await fetchFiles();
      const batchError = getUploadBatchError(fileList.length, failures);
      if (batchError) {
        setError(batchError);
        throw new Error(batchError);
      }
    },
    [currentFolderId, fetchFiles],
  );

  const createFolder = useCallback(
    async (name: string, parentId?: string | null): Promise<DriveFile> => {
      try {
        const response = await apiRequest('/api/drive/folders', {
          method: 'POST',
          body: JSON.stringify({
            name,
            parentId: parentId !== undefined ? parentId : currentFolderId,
          }),
        });
        if (!response.ok) throw new Error('Create folder failed');
        const folder = await response.json();
        setFiles((prev) => [folder, ...prev]);
        return folder;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Create failed';
        setError(message);
        throw new Error(message);
      }
    },
    [currentFolderId],
  );

  const deleteFiles = useCallback(
    async (fileIds: string[]) => {
      const prevFiles = [...files];
      setFiles((prev) => prev.filter((f) => !fileIds.includes(f.id)));
      try {
        const response = await apiRequest('/api/drive/files/trash', {
          method: 'POST',
          body: JSON.stringify({ fileIds }),
        });
        if (!response.ok) throw new Error('Delete failed');
      } catch (err) {
        setFiles(prevFiles);
        setError(getDriveErrorMessage(err, 'Delete failed'));
        await fetchFiles();
      }
    },
    [files, fetchFiles],
  );

  const renameFile = useCallback(
    async (fileId: string, newName: string) => {
      const prevFiles = [...files];
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, name: newName } : f)));
      try {
        const response = await apiRequest(`/api/drive/files/${fileId}`, {
          method: 'PUT',
          body: JSON.stringify({ name: newName }),
        });
        if (!response.ok) throw new Error('Rename failed');
      } catch (err) {
        setFiles(prevFiles);
        setError(getDriveErrorMessage(err, 'Rename failed'));
        await fetchFiles();
      }
    },
    [files, fetchFiles],
  );

  const moveFiles = useCallback(
    async (fileIds: string[], targetFolderId: string) => {
      const prevFiles = [...files];
      setFiles((prev) => prev.filter((f) => !fileIds.includes(f.id)));
      try {
        const response = await apiRequest('/api/drive/move', {
          method: 'POST',
          body: JSON.stringify({ fileIds, targetFolderId }),
        });
        if (!response.ok) throw new Error('Move failed');
      } catch (err) {
        setFiles(prevFiles);
        setError(getDriveErrorMessage(err, 'Move failed'));
        await fetchFiles();
      }
    },
    [files, fetchFiles],
  );

  const copyFile = useCallback(
    async (fileId: string, targetFolderId: string): Promise<DriveFile | null> => {
      try {
        const response = await apiRequest(`/api/drive/files/${fileId}/copy`, {
          method: 'POST',
          body: JSON.stringify({ targetFolderId }),
        });
        if (!response.ok) throw new Error('Copy failed');
        return await response.json();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Copy failed');
        return null;
      }
    },
    [],
  );

  const shareFile = useCallback(async (params: ShareParams) => {
    try {
      const response = await apiRequest(`/api/drive/files/${params.fileId}/share`, {
        method: 'POST',
        body: JSON.stringify({ email: params.email, permission: params.permission }),
      });
      if (!response.ok) throw new Error('Share failed');
      setFiles((prev) =>
        prev.map((f) =>
          f.id === params.fileId
            ? {
                ...f,
                sharedWith: [
                  ...f.sharedWith,
                  { email: params.email, permission: params.permission },
                ],
              }
            : f,
        ),
      );
    } catch (err) {
      logger.error('Share failed:', err);
      setError(getDriveErrorMessage(err, 'Share failed'));
    }
  }, []);

  const unshareFile = useCallback(async (fileId: string, email: string) => {
    try {
      const response = await apiRequest(`/api/drive/files/${fileId}/share`, {
        method: 'DELETE',
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error('Failed to remove collaborator');
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, sharedWith: f.sharedWith.filter((s) => s.email !== email) } : f,
        ),
      );
    } catch (err) {
      logger.error('Unshare failed:', err);
      setError(getDriveErrorMessage(err, 'Remove collaborator failed'));
    }
  }, []);

  const starFile = useCallback(async (fileId: string) => {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, isStarred: true } : f)));
    try {
      const response = await apiRequest(`/api/drive/files/${fileId}/star`, { method: 'PUT' });
      if (!response.ok) throw new Error('Failed to star file');
    } catch (err) {
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, isStarred: false } : f)));
      setError(getDriveErrorMessage(err, 'Starring failed'));
    }
  }, []);

  const unstarFile = useCallback(async (fileId: string) => {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, isStarred: false } : f)));
    try {
      const response = await apiRequest(`/api/drive/files/${fileId}/star`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to unstar file');
    } catch (err) {
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, isStarred: true } : f)));
      setError(getDriveErrorMessage(err, 'Unstarring failed'));
    }
  }, []);

  const getVersionHistory = useCallback(async (fileId: string) => {
    try {
      const response = await apiRequest(`/api/drive/files/${fileId}/versions`);
      if (response.ok) {
        const data = await response.json();
        setFiles((prev) =>
          prev.map((f) => (f.id === fileId ? { ...f, versions: data.versions } : f)),
        );
      }
    } catch (err) {
      logger.error('Version fetch failed:', err);
    }
  }, []);

  const restoreVersion = useCallback(
    async (fileId: string, versionId: string) => {
      try {
        const response = await apiRequest(
          `/api/drive/files/${fileId}/versions/${versionId}/restore`,
          {
            method: 'POST',
          },
        );
        if (!response.ok) throw new Error('Restore failed');
        await fetchFiles();
      } catch (err) {
        setError(getDriveErrorMessage(err, 'Restore failed'));
      }
    },
    [fetchFiles],
  );

  const navigateToFolder = useCallback(
    (folderId: string | null, folderName?: string) => {
      setCurrentFolderId(folderId);
      if (folderId === null) {
        setBreadcrumbs([{ id: null, name: 'My Drive' }]);
      } else {
        setBreadcrumbs((prev) => [...prev, { id: folderId, name: folderName || 'Folder' }]);
      }
      fetchFiles(folderId);
    },
    [fetchFiles],
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
      const targetId = breadcrumbs[index]?.id || null;
      setCurrentFolderId(targetId);
      fetchFiles(targetId);
    },
    [breadcrumbs, fetchFiles],
  );

  const searchFiles = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest(`/api/drive/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setFiles(data.files || []);
    } catch (err) {
      setError(getDriveErrorMessage(err, 'Search is temporarily unavailable. Retry in a moment.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const getDownloadUrl = useCallback(
    (fileId: string): string => `/api/drive/files/${fileId}/download`,
    [],
  );

  // Authenticated download: navigating the browser straight to the download
  // URL sends no Authorization header and lands on raw 401 JSON. Fetch the
  // bytes with the session attached, then hand the user a real file.
  // QM-M39-009: a quarantined file answers 403 FILE_QUARANTINED. Surface the
  // backend's instruction verbatim — never a generic "download failed".
  const downloadFile = useCallback(async (fileId: string, fileName?: string) => {
    setError(null);
    try {
      const response = await apiRequest(`/api/drive/files/${fileId}/download`);
      if (!response.ok) {
        const instruction = await readErrorInstruction(response);
        throw new Error(instruction || `Download failed with status ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      if (fileName) anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch (err) {
      setError(
        getDriveErrorMessage(err, 'Download is temporarily unavailable. Retry in a moment.'),
      );
    }
  }, []);

  const acceptShare = useCallback(async (shareId: string) => {
    setError(null);
    try {
      const response = await apiRequest(`/api/drive/shares/${shareId}/accept`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to accept share');
      return await response.json();
    } catch (err) {
      const msg = getDriveErrorMessage(err, 'Failed to accept share');
      setError(msg);
      throw err;
    }
  }, []);

  const declineShare = useCallback(async (shareId: string) => {
    setError(null);
    try {
      const response = await apiRequest(`/api/drive/shares/${shareId}/decline`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to decline share');
      return await response.json();
    } catch (err) {
      const msg = getDriveErrorMessage(err, 'Failed to decline share');
      setError(msg);
      throw err;
    }
  }, []);

  const fetchReceivedShares = useCallback(async (): Promise<ReceivedShare[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest('/api/drive/shares/received');
      if (!response.ok) throw new Error('Failed to fetch received shares');
      const data = await response.json();
      return data.shares || [];
    } catch (err) {
      setError(getDriveErrorMessage(err, 'Failed to load received shares'));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // QM-M39-002 — "Recent" view: fetch one server-side recency-ordered page.
  // The backend computes the order; this function returns it untouched.
  const fetchRecentFiles = useCallback(
    async (cursor?: string | null): Promise<RecentFilesPage> => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (cursor) params.set('cursor', cursor);
        const qs = params.toString();
        const response = await apiRequest(`/api/drive/recent${qs ? `?${qs}` : ''}`);
        if (!response.ok) throw new Error('Failed to fetch recent files');
        const data = await response.json();
        return {
          files: data.files || [],
          totalCount: typeof data.totalCount === 'number' ? data.totalCount : 0,
          nextCursor: data.nextCursor ?? null,
          hasMore: Boolean(data.hasMore),
        };
      } catch (err) {
        setError(getDriveErrorMessage(err, 'Failed to load recent files'));
        return { files: [], totalCount: 0, nextCursor: null, hasMore: false };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // QM-M39-002 — record an explicit file open (preview opened by the user).
  // Best-effort: tracking must never surface an error to the user, so failures
  // are swallowed after logging.
  const recordFileOpen = useCallback(async (fileId: string): Promise<void> => {
    if (!fileId) return;
    try {
      await apiRequest(`/api/drive/files/${encodeURIComponent(fileId)}/open`, {
        method: 'POST',
      });
    } catch (err) {
      logger.warn('recordFileOpen failed', { fileId, error: err instanceof Error ? err.message : err });
    }
  }, []);

  // QM-M39-001 — "Shared by me": owned items the user has shared, grouped per
  // item with recipients, permissions and link state from GET /api/drive/shares/sent.
  const fetchSentShares = useCallback(async (): Promise<SentShareItem[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest('/api/drive/shares/sent');
      if (!response.ok) throw new Error('Failed to fetch sent shares');
      const data = await response.json();
      return data.items || [];
    } catch (err) {
      setError(getDriveErrorMessage(err, 'Failed to load shared-by-me items'));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrashFiles = useCallback(async (): Promise<DriveFile[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest('/api/drive/trash');
      if (!response.ok) throw new Error('Failed to fetch trash');
      const data = await response.json();
      return data.files || [];
    } catch (err) {
      setError(getDriveErrorMessage(err, 'Failed to load trash'));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const restoreFile = useCallback(async (fileId: string) => {
    setError(null);
    try {
      const response = await apiRequest(`/api/drive/files/${fileId}/restore`, {
        method: 'POST',
      });
      if (!response.ok) {
        // QM-SCREEN-011 R2: a blocked restore (e.g. FILE_QUARANTINED) must
        // surface the backend's honest instruction verbatim, never a generic
        // failure — the toast in the page handler shows this message.
        const instruction = await readErrorInstruction(response);
        throw new Error(instruction ?? 'Failed to restore file');
      }
    } catch (err) {
      const msg = getDriveErrorMessage(err, 'Failed to restore file');
      setError(msg);
      throw err;
    }
  }, []);

  const purgeFile = useCallback(async (fileId: string) => {
    setError(null);
    try {
      const response = await apiRequest(`/api/drive/files/${fileId}/purge`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete file permanently');
    } catch (err) {
      const msg = getDriveErrorMessage(err, 'Failed to delete file permanently');
      setError(msg);
      throw err;
    }
  }, []);

  return {
    files,
    loading,
    error,
    quota,
    currentFolderId,
    breadcrumbs,
    fetchFiles,
    uploadFiles,
    createFolder,
    deleteFiles,
    renameFile,
    moveFiles,
    copyFile,
    shareFile,
    unshareFile,
    starFile,
    unstarFile,
    getVersionHistory,
    restoreVersion,
    navigateToFolder,
    navigateToBreadcrumb,
    searchFiles,
    getDownloadUrl,
    downloadFile,
    acceptShare,
    declineShare,
    fetchReceivedShares,
    fetchRecentFiles,
    recordFileOpen,
    fetchSentShares,
    fetchTrashFiles,
    restoreFile,
    purgeFile,
  };
}

export default useDrive;
