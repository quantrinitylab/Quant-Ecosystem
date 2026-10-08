// ============================================================================
// QuantMail - useDrive Hook
// Drive operations: upload with progress, folder CRUD, share, versions, move
// ============================================================================

import { useState, useCallback, useRef } from 'react';
import { logger } from '@quant/common';
import { browserApiRequest as apiRequest } from '../services/browser-api-request';
import { browserAuthSession } from '../services/browser-auth-session';
import { getUploadBatchError } from '../lib/drive-upload-results';

export interface DriveFile {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType: string;
  size: number;
  path: string;
  parentId: string | null;
  modifiedAt: string;
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

// ============================================================================
// QM-M39-003 — Drive upload center (M39 screen 15).
// Queue states: queued → uploading → scanning → available → failed, plus
// 'cancelled' for user-cancelled attempts. "scanning" is shown ONLY while the
// backend's real scanStatus is pending/scanning — never as theater.
// Progress is ONLY ever set from real XHR upload bytes (loaded/total).
// ============================================================================

/** Upload-center queue states. Matches the M39 state inventory vocabulary. */
export type UploadCenterStatus =
  | 'queued'
  | 'uploading'
  | 'scanning'
  | 'available'
  | 'failed'
  | 'cancelled';

export interface UploadProgress {
  /** Local id for this queue entry — stable across retries. */
  fileId: string;
  fileName: string;
  fileSize: number;
  /**
   * 0–100, set ONLY from real XHR upload bytes (loaded/total). Never animated,
   * never interpolated — if the browser gives no byte counts it stays 0.
   */
  progress: number;
  /** Real bytes acknowledged by the server so far (from onprogress events). */
  bytesUploaded: number;
  status: UploadCenterStatus;
  error?: string;
  /** Backend file id, once the upload response arrives. */
  backendFileId?: string;
  /** Real backend scanStatus read from the upload response / status polls. */
  scanStatus?: string | null;
  /** Real scanReason when the backend quarantines the file. */
  scanReason?: string | null;
  /** Attempt count, starting at 1. Increments on every retry. */
  attempts: number;
  /** True when the failure must not be retried (e.g. quarantined by a scan). */
  blocked?: boolean;
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
  uploads: UploadProgress[];
  quota: StorageQuota;
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
  cancelUpload: (uploadId: string) => void;
  /** Re-run a failed (non-blocked) upload entry with its original File. */
  retryUpload: (uploadId: string) => Promise<void>;
  /** Remove an entry from the visible queue. */
  dismissUpload: (uploadId: string) => void;
  /** Remove every terminal entry (available / failed / cancelled). */
  clearFinishedUploads: () => void;
  acceptShare: (shareId: string) => Promise<{ success: boolean; share: any }>;
  declineShare: (shareId: string) => Promise<{ success: boolean; share: any }>;
  fetchReceivedShares: () => Promise<ReceivedShare[]>;
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
const readErrorInstruction = async (response: Response): Promise<string | null> => {
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

// QM-M39-003: backend scan states that mean "a scan is in flight" (PR #663).
// Mirrors backend FILE_SCAN_STATUSES. Only these two ever put an upload
// entry into the 'scanning' queue state.
const SCAN_IN_FLIGHT = new Set(['pending', 'scanning']);
const SCAN_POLL_INTERVAL_MS = 2000;
const SCAN_POLL_MAX_ATTEMPTS = 15;

interface UploadAttemptResult {
  backendFileId: string;
  scanStatus: string | null;
  scanReason: string | null;
}

/** Read the real backend file DTO out of an upload response. Never invents one. */
const readUploadResponse = (responseText: string): UploadAttemptResult => {
  try {
    const parsed = JSON.parse(responseText) as {
      file?: { id?: string; scanStatus?: string | null; scanReason?: string | null };
    };
    return {
      backendFileId: typeof parsed.file?.id === 'string' ? parsed.file.id : '',
      scanStatus: parsed.file?.scanStatus ?? null,
      scanReason: parsed.file?.scanReason ?? null,
    };
  } catch {
    return { backendFileId: '', scanStatus: null, scanReason: null };
  }
};

/**
 * Bounded poll of the real backend scan state. Resolves with the terminal
 * verdict, or null when polling is stopped / gives up (network down, still
 * scanning after the budget). Never invents a verdict.
 */
const pollScanVerdict = async (
  backendFileId: string,
  uploadId: string,
  stopRef: { current: Map<string, boolean> },
): Promise<{ scanStatus: string; scanReason: string | null } | null> => {
  for (let attempt = 0; attempt < SCAN_POLL_MAX_ATTEMPTS; attempt++) {
    if (stopRef.current.get(uploadId)) return null;
    await new Promise((resolve) => setTimeout(resolve, SCAN_POLL_INTERVAL_MS));
    if (stopRef.current.get(uploadId)) return null;
    try {
      const response = await apiRequest(`/api/drive/files/${backendFileId}`);
      if (!response.ok) continue;
      const data = await response.json();
      const scanStatus = data?.file?.scanStatus;
      if (typeof scanStatus === 'string' && !SCAN_IN_FLIGHT.has(scanStatus)) {
        return { scanStatus, scanReason: data?.file?.scanReason ?? null };
      }
    } catch {
      // Transient failure: keep the remaining budget, keep polling.
    }
  }
  return null;
};

export function useDrive(): UseDriveReturn {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [quota, setQuota] = useState<StorageQuota>({ used: 0, total: 15 * 1024 * 1024 * 1024 });
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: 'My Drive' },
  ]);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const cancelledUploadIds = useRef<Set<string>>(new Set());
  const fetchSeqRef = useRef<number>(0);
  // QM-M39-003: original File objects, keyed by queue entry id, so a failed
  // entry can be retried without re-selecting. Cleaned on dismiss/clear.
  const uploadFileEntries = useRef<Map<string, File>>(new Map());
  // QM-M39-003: set true to stop an in-flight scan poll for an entry.
  const scanPollStop = useRef<Map<string, boolean>>(new Map());

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

  // QM-M39-003: one XHR attempt for a queue entry. Returns the real backend
  // file DTO fields from the upload response. Progress updates come ONLY from
  // xhr.upload.onprogress byte counts — never animated or interpolated.
  const runUploadAttempt = useCallback(
    (uploadId: string): Promise<UploadAttemptResult> => {
      const file = uploadFileEntries.current.get(uploadId);
      if (!file) return Promise.reject(new Error('Upload file is no longer available'));

      const controller = new AbortController();
      abortControllers.current.set(uploadId, controller);
      setUploads((prev) =>
        prev.map((u) =>
          u.fileId === uploadId
            ? {
                ...u,
                status: 'uploading' as const,
                progress: 0,
                bytesUploaded: 0,
                error: undefined,
              }
            : u,
        ),
      );

      const uploadOnce = async (allowRefreshRetry: boolean): Promise<UploadAttemptResult> => {
        if (controller.signal.aborted) throw new Error('Upload cancelled');
        const xhr = new XMLHttpRequest();
        return new Promise<UploadAttemptResult>((resolve, reject) => {
          const abortRequest = () => xhr.abort();
          const detachAbort = () => controller.signal.removeEventListener('abort', abortRequest);
          const rejectUpload = (uploadError: Error) => {
            detachAbort();
            reject(uploadError);
          };

          if (controller.signal.aborted) {
            rejectUpload(new Error('Upload cancelled'));
            return;
          }
          controller.signal.addEventListener('abort', abortRequest, { once: true });

          xhr.upload.onprogress = (event) => {
            // Real bytes only. If the browser cannot compute a total, leave
            // progress untouched instead of guessing.
            if (event.lengthComputable && event.total > 0) {
              const progress = Math.min(100, Math.round((event.loaded / event.total) * 100));
              setUploads((prev) =>
                prev.map((u) =>
                  u.fileId === uploadId ? { ...u, progress, bytesUploaded: event.loaded } : u,
                ),
              );
            }
          };
          xhr.onload = () => {
            detachAbort();
            if (xhr.status === 401 && allowRefreshRetry) {
              void (async () => {
                try {
                  const refreshed = await browserAuthSession.refresh();
                  if (!refreshed.success || !browserAuthSession.getAccessToken()) {
                    reject(new Error('Upload authorization failed'));
                    return;
                  }
                  resolve(await uploadOnce(false));
                } catch (retryError) {
                  reject(retryError);
                }
              })();
              return;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(readUploadResponse(xhr.responseText));
            } else {
              // Surface the backend reason (quota exceeded, too large, storage
              // down) instead of a bare status line.
              let message = xhr.statusText || `Upload failed with status ${xhr.status}`;
              try {
                const parsed = JSON.parse(xhr.responseText) as {
                  error?: { message?: string };
                  message?: string;
                };
                message = parsed.error?.message || parsed.message || message;
              } catch {
                /* non-JSON body: keep the status text */
              }
              reject(new Error(message));
            }
          };
          xhr.onerror = () => rejectUpload(new Error('Upload failed'));
          xhr.onabort = () => rejectUpload(new Error('Upload cancelled'));
          xhr.open('POST', '/api/drive/upload');
          xhr.withCredentials = true;
          const accessToken = browserAuthSession.getAccessToken();
          if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
          const formData = new FormData();
          formData.append('file', file);
          if (currentFolderId) formData.append('folderId', currentFolderId);
          xhr.send(formData);
        }).finally(() => {
          abortControllers.current.delete(uploadId);
        });
      };

      return uploadOnce(true);
    },
    [currentFolderId],
  );

  // QM-M39-003: wire the queue entry to the backend's REAL scan state.
  // The upload response already carries scanStatus; when the backend says a
  // scan is in flight (pending/scanning), the entry shows 'scanning' until the
  // poll returns a terminal verdict. 'unknown' (no scanner ran) goes straight
  // to 'available' — never through a fake 'scanning' state.
  // Returns 'quarantined' when the backend scan flags the file, so the batch
  // summary stays honest ("Uploaded 0 of 1") instead of contradicting the
  // blocked queue entry.
  const resolveUploadScan = useCallback(
    async (uploadId: string, result: UploadAttemptResult): Promise<'ok' | 'quarantined'> => {
      const { backendFileId, scanStatus, scanReason } = result;
      setUploads((prev) =>
        prev.map((u) =>
          u.fileId === uploadId
            ? {
                ...u,
                progress: 100,
                backendFileId: backendFileId || undefined,
                scanStatus,
                scanReason,
              }
            : u,
        ),
      );

      const markQuarantined = (reason: string | null) =>
        setUploads((prev) =>
          prev.map((u) =>
            u.fileId === uploadId
              ? {
                  ...u,
                  status: 'failed' as const,
                  blocked: true,
                  scanStatus: 'quarantined',
                  scanReason: reason,
                  error: reason
                    ? `Quarantined: ${reason}`
                    : 'Quarantined by the security scan. Preview and download are disabled.',
                }
              : u,
          ),
        );

      if (scanStatus === 'quarantined') {
        markQuarantined(scanReason);
        return 'quarantined';
      }

      if (backendFileId && scanStatus && SCAN_IN_FLIGHT.has(scanStatus)) {
        setUploads((prev) =>
          prev.map((u) => (u.fileId === uploadId ? { ...u, status: 'scanning' as const } : u)),
        );
        const verdict = await pollScanVerdict(backendFileId, uploadId, scanPollStop);
        if (scanPollStop.current.get(uploadId)) {
          // Cancelled / dismissed / retried while polling: leave the entry to
          // whichever action stopped the poll.
          return 'ok';
        }
        if (!verdict) {
          // Poll gave up (network down, still scanning after the budget). The
          // upload itself succeeded, so the file is available; keep the last
          // real scan state — do not invent a verdict.
          setUploads((prev) =>
            prev.map((u) => (u.fileId === uploadId ? { ...u, status: 'available' as const } : u)),
          );
          return 'ok';
        }
        setUploads((prev) =>
          prev.map((u) =>
            u.fileId === uploadId
              ? { ...u, scanStatus: verdict.scanStatus, scanReason: verdict.scanReason }
              : u,
          ),
        );
        if (verdict.scanStatus === 'quarantined') {
          markQuarantined(verdict.scanReason);
          return 'quarantined';
        }
      }

      setUploads((prev) =>
        prev.map((u) => (u.fileId === uploadId ? { ...u, status: 'available' as const } : u)),
      );
      return 'ok';
    },
    [],
  );

  const failUploadEntry = useCallback((uploadId: string, errorMsg: string) => {
    if (errorMsg === 'Upload cancelled') {
      setUploads((prev) =>
        prev.map((u) => (u.fileId === uploadId ? { ...u, status: 'cancelled' as const } : u)),
      );
      return;
    }
    setUploads((prev) =>
      prev.map((u) =>
        u.fileId === uploadId ? { ...u, status: 'failed' as const, error: errorMsg } : u,
      ),
    );
  }, []);

  const uploadFiles = useCallback(
    async (fileList: File[]) => {
      setError(null);
      const failures: string[] = [];
      const startedAt = Date.now();
      const newUploads: UploadProgress[] = fileList.map((file, i) => {
        const uploadId = `upload-${startedAt}-${i}`;
        uploadFileEntries.current.set(uploadId, file);
        scanPollStop.current.delete(uploadId);
        return {
          fileId: uploadId,
          fileName: file.name,
          fileSize: file.size,
          progress: 0,
          bytesUploaded: 0,
          status: 'queued' as const,
          attempts: 0,
        };
      });
      setUploads((prev) => [...prev, ...newUploads]);

      // Sequential: one file uploads at a time; the rest stay visibly queued.
      for (const entry of newUploads) {
        const uploadId = entry.fileId;
        if (cancelledUploadIds.current.has(uploadId)) {
          cancelledUploadIds.current.delete(uploadId);
          setUploads((prev) =>
            prev.map((u) => (u.fileId === uploadId ? { ...u, status: 'cancelled' as const } : u)),
          );
          continue;
        }
        setUploads((prev) =>
          prev.map((u) => (u.fileId === uploadId ? { ...u, attempts: u.attempts + 1 } : u)),
        );
        try {
          const result = await runUploadAttempt(uploadId);
          const outcome = await resolveUploadScan(uploadId, result);
          if (outcome === 'quarantined') failures.push('Quarantined by the security scan');
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Upload failed';
          if (errorMsg !== 'Upload cancelled') failures.push(errorMsg);
          failUploadEntry(uploadId, errorMsg);
        }
      }
      await fetchFiles();
      const batchError = getUploadBatchError(fileList.length, failures);
      if (batchError) {
        setError(batchError);
        throw new Error(batchError);
      }
    },
    [currentFolderId, fetchFiles, runUploadAttempt, resolveUploadScan, failUploadEntry],
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

  // QM-M39-003: cancel marks the entry 'cancelled' so the center shows it —
  // the entry is removed only via dismiss/clear.
  const cancelUpload = useCallback((uploadId: string) => {
    scanPollStop.current.set(uploadId, true);
    cancelledUploadIds.current.add(uploadId);
    const controller = abortControllers.current.get(uploadId);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(uploadId);
    }
    // Queued / scanning entries have no live XHR to abort; mark them now.
    // An in-flight XHR marks itself 'cancelled' via its onabort handler.
    setUploads((prev) =>
      prev.map((u) =>
        u.fileId === uploadId && (u.status === 'queued' || u.status === 'scanning')
          ? { ...u, status: 'cancelled' as const }
          : u,
      ),
    );
  }, []);

  // QM-M39-003: retry a failed (non-blocked) entry with its original File.
  // A quarantined entry is blocked: re-uploading the same bytes would just be
  // quarantined again, so retry is not offered for it.
  const retryUpload = useCallback(
    async (uploadId: string): Promise<void> => {
      let entry: UploadProgress | undefined;
      setUploads((prev) => {
        entry = prev.find((u) => u.fileId === uploadId);
        return prev;
      });
      if (!entry || entry.status !== 'failed' || entry.blocked) return;
      if (cancelledUploadIds.current.has(uploadId)) return;
      if (!uploadFileEntries.current.has(uploadId)) {
        setUploads((prev) =>
          prev.map((u) =>
            u.fileId === uploadId
              ? { ...u, error: 'The original file is no longer available. Select it again to upload.' }
              : u,
          ),
        );
        return;
      }
      scanPollStop.current.delete(uploadId);
      setUploads((prev) =>
        prev.map((u) =>
          u.fileId === uploadId
            ? {
                ...u,
                status: 'queued' as const,
                error: undefined,
                progress: 0,
                bytesUploaded: 0,
                attempts: u.attempts + 1,
                scanStatus: null,
                scanReason: null,
                backendFileId: undefined,
              }
            : u,
        ),
      );
      try {
        const result = await runUploadAttempt(uploadId);
        await resolveUploadScan(uploadId, result);
        await fetchFiles();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Upload failed';
        failUploadEntry(uploadId, errorMsg);
      }
    },
    [runUploadAttempt, resolveUploadScan, failUploadEntry, fetchFiles],
  );

  const dismissUpload = useCallback((uploadId: string) => {
    scanPollStop.current.set(uploadId, true);
    cancelledUploadIds.current.delete(uploadId);
    const controller = abortControllers.current.get(uploadId);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(uploadId);
    }
    uploadFileEntries.current.delete(uploadId);
    scanPollStop.current.delete(uploadId);
    setUploads((prev) => prev.filter((u) => u.fileId !== uploadId));
  }, []);

  const clearFinishedUploads = useCallback(() => {
    const TERMINAL: UploadCenterStatus[] = ['available', 'failed', 'cancelled'];
    setUploads((prev) => {
      const removed = prev.filter((u) => TERMINAL.includes(u.status));
      removed.forEach((u) => {
        scanPollStop.current.set(u.fileId, true);
        uploadFileEntries.current.delete(u.fileId);
        scanPollStop.current.delete(u.fileId);
      });
      return prev.filter((u) => !TERMINAL.includes(u.status));
    });
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
      if (!response.ok) throw new Error('Failed to restore file');
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
    uploads,
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
    cancelUpload,
    retryUpload,
    dismissUpload,
    clearFinishedUploads,
    acceptShare,
    declineShare,
    fetchReceivedShares,
    fetchTrashFiles,
    restoreFile,
    purgeFile,
  };
}

export default useDrive;
