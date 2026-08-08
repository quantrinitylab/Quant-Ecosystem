'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, Button, SearchInput, Skeleton, EmptyState } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useDrive } from '../../hooks/useDrive';

export default function DrivePage() {
  const {
    files,
    loading,
    error,
    breadcrumbs,
    fetchFiles,
    uploadFiles,
    navigateToFolder,
    navigateToBreadcrumb,
    searchFiles,
  } = useDrive();

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

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

  const showRecoveryBanner = Boolean(error && files.length > 0);
  const showRecoveryPanel = Boolean(!loading && error && files.length === 0);

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page drive-workspace flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--quant-border)]">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Drive</h1>
            {/* Storage indicator */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-24 h-1.5 rounded-full bg-[var(--quant-muted)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--brand-primary)] transition-all" style={{ width: '23%' }} />
              </div>
              <span className="text-xs text-[var(--quant-muted-foreground)]">2.3 GB of 10 GB</span>
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
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
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
                <p className="text-sm text-[var(--quant-muted-foreground)]">Files will be uploaded to current folder</p>
              </div>
            </div>
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
                  Your files are safe. Retry the connection or return to the root folder and try again.
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
            (viewMode === 'list' ? (
              <div className="space-y-1">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[var(--quant-muted)] cursor-pointer transition-colors"
                    onClick={() => {
                      if (file.type === 'folder') navigateToFolder(file.id, file.name);
                    }}
                  >
                    <span className="text-lg">{getFileIcon(file.type, file.mimeType)}</span>
                    <span className="flex-1 text-sm font-medium truncate">{file.name}</span>
                    <span className="text-xs text-[var(--quant-muted-foreground)]">
                      {file.type !== 'folder' ? formatSize(file.size) : ''}
                    </span>
                    <span className="text-xs text-[var(--quant-muted-foreground)]">
                      {file.modifiedAt ? new Date(file.modifiedAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {files.map((file) => (
                  <Card
                    key={file.id}
                    className="p-3 cursor-pointer hover:bg-[var(--quant-muted)] transition-colors text-center"
                    onClick={() => {
                      if (file.type === 'folder') navigateToFolder(file.id, file.name);
                    }}
                  >
                    <div className="text-3xl mb-2">{getFileIcon(file.type, file.mimeType)}</div>
                    <p className="text-xs font-medium truncate">{file.name}</p>
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      {file.type !== 'folder' ? formatSize(file.size) : ''}
                    </p>
                  </Card>
                ))}
              </div>
            ))}
        </div>
      </PageTransition>
    </AppShell>
  );
}
