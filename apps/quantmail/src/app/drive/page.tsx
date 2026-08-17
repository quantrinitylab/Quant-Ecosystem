'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, Button, SearchInput, Skeleton, EmptyState, Badge } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { QuantMailLogo } from '../../components/QuantMailLogo';
import { useDrive } from '../../hooks/useDrive';
import { browserApiRequest as apiRequest } from '../../services/browser-api-request';

// Minimal structural type for items rendered on this page.
type DriveItem = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType: string;
  size: number;
  modifiedAt: string;
  thumbnailUrl?: string;
};

type DriveSection = { id: string; title: string; items: DriveItem[] };

function isImage(item: DriveItem): boolean {
  return item.type !== 'folder' && (item.mimeType ?? '').startsWith('image/');
}

function isDocument(item: DriveItem): boolean {
  const mime = (item.mimeType ?? '').toLowerCase();
  return (
    item.type !== 'folder' &&
    ['pdf', 'spreadsheet', 'excel', 'word', 'document', 'text', 'csv', 'presentation', 'json'].some(
      (hint) => mime.includes(hint),
    )
  );
}

/** Group items into clean sections — Folders / Images / Documents / Other (msg#30 P11). */
function groupItems(items: DriveItem[]): DriveSection[] {
  const folders: DriveItem[] = [];
  const images: DriveItem[] = [];
  const documents: DriveItem[] = [];
  const other: DriveItem[] = [];
  for (const item of items) {
    if (item.type === 'folder') folders.push(item);
    else if (isImage(item)) images.push(item);
    else if (isDocument(item)) documents.push(item);
    else other.push(item);
  }
  return [
    { id: 'folders', title: 'Folders', items: folders },
    { id: 'images', title: 'Images', items: images },
    { id: 'documents', title: 'Documents', items: documents },
    { id: 'other', title: 'Other files', items: other },
  ].filter((section) => section.items.length > 0);
}

export default function DrivePage() {
  const {
    files,
    loading,
    error,
    breadcrumbs,
    fetchFiles,
    uploadFiles,
    downloadFile,
    getDownloadUrl,
    navigateToFolder,
    navigateToBreadcrumb,
    searchFiles,
    quota,
  } = useDrive();

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isDragOver, setIsDragOver] = useState(false);
  const [preview, setPreview] = useState<{ item: DriveItem; url: string | null } | null>(null);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const items = files as unknown as DriveItem[];
  const sections = useMemo(() => groupItems(items), [items]);

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (value) {
        searchFiles(value);
      } else {
        fetchFiles();
      }
    },
    [searchFiles, fetchFiles],
  );

  const handleUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => {
      const fileList = (e.target as HTMLInputElement).files;
      if (fileList) uploadFiles(Array.from(fileList));
    };
    input.click();
  }, [uploadFiles]);

  const handleResetToRoot = useCallback(() => {
    setSearchQuery('');
    navigateToFolder(null, 'My Drive');
  }, [navigateToFolder]);

  /**
   * Images open in a PREVIEW lightbox instead of force-downloading (msg#30
   * P11). The bytes are fetched with the session attached (same as
   * downloadFile) so we never land on a raw 401.
   */
  const openPreview = useCallback(
    async (item: DriveItem) => {
      setPreview({ item, url: null });
      try {
        const response = await apiRequest(getDownloadUrl(item.id));
        if (!response.ok) throw new Error(`Preview failed with status ${response.status}`);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setPreview((current) =>
          current && current.item.id === item.id ? { item, url: objectUrl } : current,
        );
      } catch {
        setPreview((current) =>
          current && current.item.id === item.id ? { item, url: 'error' } : current,
        );
      }
    },
    [getDownloadUrl],
  );

  const closePreview = useCallback(() => {
    setPreview((current) => {
      if (current?.url && current.url !== 'error') URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, closePreview]);

  const openItem = useCallback(
    (item: DriveItem) => {
      if (item.type === 'folder') {
        navigateToFolder(item.id, item.name);
      } else if (isImage(item)) {
        void openPreview(item);
      } else {
        void downloadFile(item.id, item.name);
      }
    },
    [navigateToFolder, openPreview, downloadFile],
  );

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string, mimeType: string): string => {
    if (type === 'folder') return '📁';
    if (mimeType?.startsWith('image/')) return '🖼️';
    if (mimeType?.includes('pdf')) return '📄';
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return '📊';
    return '📄';
  };

  // Storage bar reflects the real quota reported by the backend.
  const quotaPercent = quota.total > 0 ? Math.min(100, (quota.used / quota.total) * 100) : 0;

  const showRecoveryBanner = Boolean(error && files.length > 0);
  const showRecoveryPanel = Boolean(!loading && error && files.length === 0);

  const renderRow = (item: DriveItem) => (
    <div
      key={item.id}
      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[var(--quant-muted)] cursor-pointer transition-colors"
      onClick={() => openItem(item)}
    >
      <span className="text-lg">{getFileIcon(item.type, item.mimeType)}</span>
      <span className="flex-1 text-sm font-medium truncate">{item.name}</span>
      {isImage(item) && (
        <span className="text-[10px] uppercase tracking-wide text-[var(--quant-muted-foreground)] border border-[var(--quant-border)] rounded-full px-2 py-0.5">
          Preview
        </span>
      )}
      <span className="text-xs text-[var(--quant-muted-foreground)]">
        {item.type !== 'folder' ? formatSize(item.size) : ''}
      </span>
      <span className="text-xs text-[var(--quant-muted-foreground)]">
        {item.modifiedAt ? new Date(item.modifiedAt).toLocaleDateString() : ''}
      </span>
    </div>
  );

  const renderCard = (item: DriveItem) => (
    <Card
      key={item.id}
      className="p-3 cursor-pointer hover:bg-[var(--quant-muted)] transition-colors text-center"
      onClick={() => openItem(item)}
    >
      {isImage(item) && item.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnailUrl}
          alt={item.name}
          className="mb-2 h-20 w-full rounded-md object-cover"
          loading="lazy"
        />
      ) : (
        <div className="text-3xl mb-2">{getFileIcon(item.type, item.mimeType)}</div>
      )}
      <p className="text-xs font-medium truncate">{item.name}</p>
      <p className="text-xs text-[var(--quant-muted-foreground)]">
        {item.type !== 'folder' ? formatSize(item.size) : ''}
      </p>
    </Card>
  );

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page drive-workspace flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--quant-border)]">
          <div className="flex items-center gap-3">
            <QuantMailLogo size={28} blink={false} title="Quant Drive" />
            <h1 className="text-lg font-semibold">Drive</h1>
            {/* Storage indicator */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-24 h-1.5 rounded-full bg-[var(--quant-muted)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--brand-primary)] transition-all"
                  style={{ width: `${quotaPercent}%` }}
                />
              </div>
              <span className="text-xs text-[var(--quant-muted-foreground)]">
                {formatSize(quota.used)} of {formatSize(quota.total)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'list' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('list')}
            >
              List
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('grid')}
            >
              Grid
            </Button>
            <Button variant="primary" onClick={handleUpload}>
              Upload
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[var(--quant-border)]">
          <SearchInput placeholder="Search files..." value={searchQuery} onChange={handleSearch} />
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 px-4 py-2 text-sm overflow-x-auto">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
              {i > 0 && <span className="text-[var(--quant-muted-foreground)]">/</span>}
              <button
                className="text-[var(--quant-primary)] hover:underline"
                onClick={() => navigateToBreadcrumb(i)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* File list */}
        <div
          className={`flex-1 overflow-y-auto p-4 relative ${isDragOver ? 'ring-2 ring-inset ring-[var(--brand-primary)] bg-[var(--brand-primary)]/5' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const droppedFiles = Array.from(e.dataTransfer.files);
            if (droppedFiles.length > 0) uploadFiles(droppedFiles);
          }}
        >
          {isDragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--brand-primary)]/10 border-2 border-dashed border-[var(--brand-primary)] rounded-lg pointer-events-none">
              <div className="text-center">
                <p className="text-lg font-semibold text-[var(--brand-primary)]">Drop files here</p>
                <p className="text-sm text-[var(--quant-muted-foreground)]">
                  Files will be uploaded to current folder
                </p>
              </div>
            </div>
          )}

          {/* Quant Memory — the user's private AI memory lives in Drive,
              end-to-end encrypted (msg#30 P11). Sync goes live with the next
              backend batch; the section is the permanent home. */}
          {!searchQuery && breadcrumbs.length === 1 && (
            <Card className="mb-4 border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden="true">
                  🔐
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">Quant Memory</p>
                    <Badge variant="success">E2E encrypted</Badge>
                  </div>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">
                    Everything Quanty learns for you — chat context, mail preferences, habits — is
                    stored here, encrypted end to end. Only you can read it; it tunes your
                    experience and no one can copy it.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {showRecoveryBanner && (
            <Card className="mb-4 border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Drive couldn’t refresh right now</p>
                  <p className="text-sm text-[var(--quant-muted-foreground)]">{error}</p>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">
                    Showing your last loaded files so you can keep context while Drive reconnects.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={handleResetToRoot}>
                    Back to My Drive
                  </Button>
                  <Button variant="primary" onClick={() => void fetchFiles()}>
                    Retry
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="48px" />
              ))}
            </div>
          )}

          {showRecoveryPanel && (
            <Card className="mx-auto mt-12 max-w-2xl border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--quant-muted-foreground)]">
                  Drive recovery
                </p>
                <h2 className="text-xl font-semibold">Drive couldn’t load right now</h2>
                <p className="text-sm text-[var(--quant-muted-foreground)]">{error}</p>
                <p className="text-sm text-[var(--quant-muted-foreground)]">
                  Your files are safe. Retry the connection or return to the root folder and try
                  again.
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => void fetchFiles()}>
                  Retry
                </Button>
                <Button variant="secondary" onClick={handleResetToRoot}>
                  Back to My Drive
                </Button>
              </div>
            </Card>
          )}

          {!loading && !error && files.length === 0 && (
            <EmptyState
              title="No files"
              description="Upload files or create a folder to get started"
            />
          )}

          {!loading &&
            files.length > 0 &&
            sections.map((section) => (
              <section key={section.id} className="mb-6" aria-label={section.title}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
                  {section.title} · {section.items.length}
                </h2>
                {viewMode === 'list' ? (
                  <div className="space-y-1">{section.items.map(renderRow)}</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {section.items.map(renderCard)}
                  </div>
                )}
              </section>
            ))}
        </div>

        {/* Image preview lightbox — click an image to VIEW it; download stays a button */}
        {preview && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Preview of ${preview.item.name}`}
            onClick={closePreview}
          >
            <div
              className="max-w-4xl w-full rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-4 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center gap-3">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{preview.item.name}</p>
                <span className="text-xs text-[var(--quant-muted-foreground)]">
                  {formatSize(preview.item.size)}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => void downloadFile(preview.item.id, preview.item.name)}
                >
                  Download
                </Button>
                <Button variant="primary" onClick={closePreview}>
                  Close
                </Button>
              </div>
              <div className="flex min-h-[40vh] items-center justify-center">
                {preview.url === null && (
                  <p className="text-sm text-[var(--quant-muted-foreground)]">Loading preview…</p>
                )}
                {preview.url === 'error' && (
                  <p className="text-sm text-[var(--quant-muted-foreground)]">
                    Preview unavailable — use Download instead.
                  </p>
                )}
                {preview.url && preview.url !== 'error' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.url}
                    alt={preview.item.name}
                    className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </PageTransition>
    </AppShell>
  );
}
