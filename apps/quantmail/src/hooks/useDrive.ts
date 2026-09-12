// ============================================================================
// QuantMail - useDrive Hook
// Drive operations: upload with progress, folder CRUD, share, versions, move
// ============================================================================

import { useState, useCallback, useRef } from 'react';
import { logger } from '@quant/common';
import { browserApiRequest as apiRequest } from '../services/browser-api-request';
import { browserAuthSession } from '../services/browser-auth-session';
import { getUploadBatchError } from '../lib/drive-upload-results';

interface DriveFile {
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
}

interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
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

interface UseDriveReturn {
  files: DriveFile[];
  loading: boolean;
  error: string | null;
  uploads: UploadProgress[];
  quota: StorageQuota;
  currentFolderId: string | null;
  breadcrumbs: { id: string | null; name: string }[];
  fetchFiles: (folderId?: string | null) => Promise<void>;
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

  const fetchFiles = useCallback(
    async (folderId?: string | null) => {
      const seq = ++fetchSeqRef.current;
      setLoading(true);
      setError(null);
      const targetFolder = folderId !== undefined ? folderId : currentFolderId;
      try {
        const params = new URLSearchParams();
        if (targetFolder) params.set('folderId', targetFolder);
        const response = await apiRequest(`/api/drive/files?${params}`);
        if (!response.ok) throw new Error('Failed to fetch files');
        const data = await response.json();
        if (seq === fetchSeqRef.current) {
          setFiles(data.files || []);
          if (data.quota) setQuota(data.quota);
        }
      } catch (err) {
        if (seq === fetchSeqRef.current) {
          setError(getDriveErrorMessage(err, 'Drive is temporarily unavailable. Retry in a moment.'));
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
      const newUploads: UploadProgress[] = fileList.map((file, i) => ({
        fileId: `upload-${Date.now()}-${i}`,
        fileName: file.name,
        progress: 0,
        status: 'pending' as const,
      }));
      setUploads((prev) => [...prev, ...newUploads]);

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const uploadId = newUploads[i].fileId;
        if (cancelledUploadIds.current.has(uploadId)) {
          cancelledUploadIds.current.delete(uploadId);
          continue;
        }
        const controller = new AbortController();
        abortControllers.current.set(uploadId, controller);

        setUploads((prev) =>
          prev.map((u) => (u.fileId === uploadId ? { ...u, status: 'uploading' as const } : u)),
        );

        try {
          const formData = new FormData();
          formData.append('file', file);
          if (currentFolderId) formData.append('folderId', currentFolderId);

          const uploadOnce = async (allowRefreshRetry: boolean): Promise<void> => {
            if (controller.signal.aborted) throw new Error('Upload cancelled');

            const xhr = new XMLHttpRequest();
            await new Promise<void>((resolve, reject) => {
              const abortRequest = () => xhr.abort();
              const detachAbort = () =>
                controller.signal.removeEventListener('abort', abortRequest);
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
                if (event.lengthComputable) {
                  const progress = Math.round((event.loaded / event.total) * 100);
                  setUploads((prev) =>
                    prev.map((u) => (u.fileId === uploadId ? { ...u, progress } : u)),
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
                      await uploadOnce(false);
                      resolve();
                    } catch (retryError) {
                      reject(retryError);
                    }
                  })();
                  return;
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve();
                } else {
                  // Surface the backend reason (quota exceeded, too large, storage down)
                  // instead of a bare status line.
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
              xhr.send(formData);
            });
          };

          await uploadOnce(true);

          setUploads((prev) =>
            prev.map((u) =>
              u.fileId === uploadId ? { ...u, progress: 100, status: 'complete' as const } : u,
            ),
          );
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Upload failed';
          failures.push(errorMsg);
          setUploads((prev) =>
            prev.map((u) =>
              u.fileId === uploadId ? { ...u, status: 'error' as const, error: errorMsg } : u,
            ),
          );
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
        const response = await apiRequest('/api/drive/files/move', {
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
        const response = await apiRequest(`/api/drive/files/${fileId}/versions/${versionId}/restore`, {
          method: 'POST',
        });
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
  const downloadFile = useCallback(async (fileId: string, fileName?: string) => {
    setError(null);
    try {
      const response = await apiRequest(`/api/drive/files/${fileId}/download`);
      if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
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

  const cancelUpload = useCallback((uploadId: string) => {
    cancelledUploadIds.current.add(uploadId);
    const controller = abortControllers.current.get(uploadId);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(uploadId);
    }
    setUploads((prev) => prev.filter((u) => u.fileId !== uploadId));
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
  };
}

export default useDrive;
