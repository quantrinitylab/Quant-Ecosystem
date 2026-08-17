'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Card,
  Button,
  SearchInput,
  Skeleton,
  EmptyState,
  Badge,
  Modal,
  ErrorState,
} from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { QuantMailLogo } from '../../components/QuantMailLogo';
import { useDrive } from '../../hooks/useDrive';

type DriveItem = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType: string;
  size: number;
  modifiedAt: string;
  thumbnailUrl?: string;
  isStarred?: boolean;
};

type DriveFilter = 'all' | 'folders' | 'documents' | 'images' | 'starred';

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(mimeType: string, type: string) {
  if (type === 'folder') {
    return '📁';
  }
  const m = (mimeType || '').toLowerCase();
  if (m.startsWith('image/')) return '🖼️';
  if (m.includes('pdf')) return '📕';
  if (m.includes('spreadsheet') || m.includes('excel') || m.includes('csv')) return '📊';
  if (m.includes('presentation') || m.includes('powerpoint')) return '📽️';
  if (m.includes('word') || m.includes('document')) return '📄';
  if (m.includes('zip') || m.includes('tar') || m.includes('archive')) return '📦';
  if (m.includes('video/')) return '🎬';
  if (m.includes('audio/')) return '🎵';
  if (
    m.includes('javascript') ||
    m.includes('typescript') ||
    m.includes('json') ||
    m.includes('html')
  )
    return '💻';
  return '📝';
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
    navigateToFolder,
    navigateToBreadcrumb,
    searchFiles,
    quota,
  } = useDrive();

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeFilter, setActiveFilter] = useState<DriveFilter>('all');
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewItem, setPreviewItem] = useState<DriveItem | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const items = (files ?? []) as unknown as DriveItem[];

  const filteredItems = useMemo(() => {
    let result = items;
    if (activeFilter === 'folders') {
      result = result.filter((i) => i.type === 'folder');
    } else if (activeFilter === 'documents') {
      result = result.filter((i) => {
        const m = (i.mimeType || '').toLowerCase();
        return (
          i.type !== 'folder' &&
          (m.includes('pdf') ||
            m.includes('doc') ||
            m.includes('text') ||
            m.includes('sheet') ||
            m.includes('csv'))
        );
      });
    } else if (activeFilter === 'images') {
      result = result.filter((i) => i.type !== 'folder' && (i.mimeType || '').startsWith('image/'));
    } else if (activeFilter === 'starred') {
      result = result.filter((i) => i.isStarred);
    }
    return result;
  }, [items, activeFilter]);

  const folders = useMemo(() => filteredItems.filter((i) => i.type === 'folder'), [filteredItems]);
  const regularFiles = useMemo(
    () => filteredItems.filter((i) => i.type !== 'folder'),
    [filteredItems],
  );

  const handleUploadTrigger = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      uploadFiles(Array.from(fileList));
    }
  };

  useEffect(() => {
    const handler = () => handleUploadTrigger();
    window.addEventListener('quant:drive:upload', handler);
    return () => window.removeEventListener('quant:drive:upload', handler);
  }, [handleUploadTrigger]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      mobileTitle={<h1 className="text-base font-bold text-white">QuantDrive</h1>}
      mobileActions={
        <button
          type="button"
          onClick={handleUploadTrigger}
          className="px-3 py-1 text-xs font-semibold rounded-lg bg-[#ff9933] text-[#191008]"
        >
          Upload
        </button>
      }
    >
      <PageTransition className="workspace-page drive-workspace flex flex-col h-full bg-[#0a0a0c]">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />

        {/* Top Drive Control Bar */}
        <div className="border-b border-[var(--quant-border)] px-4 py-3.5 sm:px-8 bg-[var(--quant-surface)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-md">
            <div className="relative w-full">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value) searchFiles(e.target.value);
                  else fetchFiles();
                }}
                placeholder="Search files, folders, documents…"
                className="w-full bg-[var(--quant-surface-subtle)] border border-[var(--quant-border)] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
              />
              <span className="absolute left-3 top-2.5 text-zinc-500 text-xs">🔍</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-[#ff9933] text-[#191008] font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-[#ff9933] text-[#191008] font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                List
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowNewFolderModal(true)}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-[var(--quant-border)] text-zinc-300 hover:text-white hover:border-[#ff9933]/60 transition-colors"
            >
              + New Folder
            </button>

            <Button variant="primary" onClick={handleUploadTrigger}>
              ⬆ Upload Files
            </Button>
          </div>
        </div>

        {/* Filter Chips Bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 sm:px-8 border-b border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] overflow-x-auto">
          {(
            [
              { key: 'all', label: 'All Items' },
              { key: 'folders', label: 'Folders' },
              { key: 'documents', label: 'Documents' },
              { key: 'images', label: 'Images' },
              { key: 'starred', label: 'Starred' },
            ] as const
          ).map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setActiveFilter(filter.key)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors whitespace-nowrap ${
                activeFilter === filter.key
                  ? 'bg-[#ff9933]/15 text-[#ff9933] border border-[#ff9933]/40'
                  : 'bg-zinc-800/60 text-zinc-400 border border-zinc-700/40 hover:text-white'
              }`}
            >
              {filter.label}
            </button>
          ))}

          {/* Breadcrumb path */}
          {breadcrumbs && breadcrumbs.length > 1 && (
            <nav className="ml-auto flex items-center gap-1.5 text-xs text-zinc-400">
              {breadcrumbs.map((b, i) => (
                <span key={b.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => navigateToBreadcrumb(i)}
                    className="hover:text-[#ff9933] hover:underline"
                  >
                    {b.name}
                  </button>
                  {i < breadcrumbs.length - 1 && <span>/</span>}
                </span>
              ))}
            </nav>
          )}
        </div>

        {/* Main Drive Files Content */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`flex-1 overflow-y-auto px-4 py-6 sm:px-8 space-y-8 ${
            isDragOver ? 'ring-2 ring-[#ff9933] ring-dashed bg-[#ff9933]/5' : ''
          }`}
        >
          {/* Quant Memory E2E Card */}
          <div className="flex items-center justify-between p-4 rounded-2xl border border-[var(--quant-border)] bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-amber-950/20 shadow-md">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔐</span>
              <div>
                <div className="flex items-center gap-2">
                  <strong className="text-sm font-bold text-white">
                    Quant Memory & Cloud Vault
                  </strong>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    E2EE Encrypted
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Your files, mail attachments, and QuantAI workspace context are stored securely
                  with zero third-party tracking.
                </p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <span className="text-xs font-mono text-zinc-300">
                {formatFileSize(quota?.used ?? 0)} /{' '}
                {formatFileSize(quota?.total ?? 15 * 1024 * 1024 * 1024)}
              </span>
            </div>
          </div>

          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="120px" />
              ))}
            </div>
          )}

          {error && <ErrorState message={error} onRetry={() => void fetchFiles()} />}

          {!loading && !error && filteredItems.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <span className="text-5xl block">📂</span>
              <h3 className="text-lg font-bold text-white">Your drive is ready</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Drag and drop files anywhere on the screen, or click Upload to get started.
              </p>
              <div className="pt-2 flex items-center justify-center gap-2">
                <Button variant="primary" onClick={handleUploadTrigger}>
                  Upload files
                </Button>
                <Button variant="secondary" onClick={() => setShowNewFolderModal(true)}>
                  New folder
                </Button>
              </div>
            </div>
          )}

          {!loading && !error && filteredItems.length > 0 && (
            <>
              {/* Folders Group */}
              {folders.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                    Folders ({folders.length})
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => navigateToFolder(folder.id, folder.name)}
                        className="flex items-center gap-2.5 p-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[#ff9933]/60 hover:bg-[var(--quant-surface-hover)] transition-colors text-left group"
                      >
                        <span className="text-xl group-hover:scale-110 transition-transform">
                          📁
                        </span>
                        <span className="text-xs font-semibold text-white truncate min-w-0 flex-1">
                          {folder.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Files Group */}
              {regularFiles.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                    Files ({regularFiles.length})
                  </h3>

                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {regularFiles.map((file) => (
                        <div
                          key={file.id}
                          className="group relative flex flex-col justify-between p-3.5 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[#ff9933]/60 transition-all shadow-sm"
                        >
                          <div
                            onClick={() => setPreviewItem(file)}
                            className="cursor-pointer flex flex-col items-center justify-center py-6 rounded-xl bg-[var(--quant-surface-subtle)] group-hover:bg-zinc-800/80 transition-colors"
                          >
                            <span className="text-3xl mb-1">
                              {getFileIcon(file.mimeType, file.type)}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {file.mimeType.split('/')[1] || 'FILE'}
                            </span>
                          </div>

                          <div className="mt-3">
                            <h4
                              onClick={() => setPreviewItem(file)}
                              className="text-xs font-bold text-white truncate cursor-pointer hover:text-[#ff9933]"
                              title={file.name}
                            >
                              {file.name}
                            </h4>
                            <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-1">
                              <span>{formatFileSize(file.size)}</span>
                              <button
                                type="button"
                                onClick={() => downloadFile(file.id, file.name)}
                                className="text-[#ff9933] hover:underline font-semibold"
                              >
                                ⬇ Download
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[var(--quant-border)] overflow-hidden bg-[var(--quant-surface)]">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] text-[11px] font-bold text-zinc-400 uppercase">
                          <tr>
                            <th className="py-3 px-4">Name</th>
                            <th className="py-3 px-4 hidden sm:table-cell">Type</th>
                            <th className="py-3 px-4">Size</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {regularFiles.map((file) => (
                            <tr key={file.id} className="hover:bg-zinc-800/50 transition-colors">
                              <td className="py-3 px-4 font-semibold text-white flex items-center gap-2">
                                <span>{getFileIcon(file.mimeType, file.type)}</span>
                                <span
                                  onClick={() => setPreviewItem(file)}
                                  className="cursor-pointer hover:text-[#ff9933] truncate max-w-xs"
                                >
                                  {file.name}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-zinc-400 hidden sm:table-cell">
                                {file.mimeType}
                              </td>
                              <td className="py-3 px-4 text-zinc-400">
                                {formatFileSize(file.size)}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => downloadFile(file.id, file.name)}
                                  className="text-xs text-[#ff9933] hover:underline font-semibold"
                                >
                                  Download
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        {/* File Preview Lightbox Modal */}
        <Modal
          isOpen={!!previewItem}
          onClose={() => setPreviewItem(null)}
          title={previewItem?.name || 'File Preview'}
        >
          <div className="p-4 space-y-4 text-center">
            <div className="flex flex-col items-center justify-center p-8 rounded-xl bg-zinc-900 border border-zinc-800">
              <span className="text-6xl mb-3">
                {previewItem ? getFileIcon(previewItem.mimeType, previewItem.type) : '📄'}
              </span>
              <h4 className="text-sm font-bold text-white">{previewItem?.name}</h4>
              <p className="text-xs text-zinc-400 mt-1">
                {previewItem?.mimeType} · {formatFileSize(previewItem?.size ?? 0)}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreviewItem(null)}>
                Close
              </Button>
              {previewItem && (
                <Button
                  variant="primary"
                  onClick={() => {
                    downloadFile(previewItem.id, previewItem.name);
                    setPreviewItem(null);
                  }}
                >
                  Download File
                </Button>
              )}
            </div>
          </div>
        </Modal>

        {/* New Folder Modal */}
        <Modal
          isOpen={showNewFolderModal}
          onClose={() => setShowNewFolderModal(false)}
          title="Create New Folder"
        >
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Folder Name</label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g. Invoices, Project Assets, Designs…"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowNewFolderModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (newFolderName.trim()) {
                    setShowNewFolderModal(false);
                    setNewFolderName('');
                  }
                }}
              >
                Create
              </Button>
            </div>
          </div>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}
