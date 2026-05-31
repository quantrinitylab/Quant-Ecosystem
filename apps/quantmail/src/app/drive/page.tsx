'use client';

import { useState, useCallback, useEffect } from 'react';
import { AppShell, Card, Button, SearchInput, Skeleton } from '@quant/shared-ui';
import { ErrorState, EmptyState } from '@quant/shared-ui';
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

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string, mimeType: string): string => {
    if (type === 'folder') return '\uD83D\uDCC1';
    if (mimeType?.startsWith('image/')) return '\uD83D\uDDBC\uFE0F';
    if (mimeType?.includes('pdf')) return '\uD83D\uDCC4';
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return '\uD83D\uDCCA';
    return '\uD83D\uDCC4';
  };

  return (
    <AppShell sidebar={<AppSidebar />}>
      <PageTransition className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--quant-border)]">
          <h1 className="text-lg font-semibold">Drive</h1>
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
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="48px" />
              ))}
            </div>
          )}
          {error && <ErrorState message={error} onRetry={() => void fetchFiles()} />}
          {!loading && !error && files.length === 0 && (
            <EmptyState
              title="No files"
              description="Upload files or create a folder to get started"
            />
          )}
          {!loading &&
            !error &&
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
