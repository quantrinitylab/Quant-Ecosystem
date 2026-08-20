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
import { useDrive } from '../../hooks/useDrive';
import { showToast } from '../../components/InboxToast';

type DriveItem = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType: string;
  size: number;
  modifiedAt: string;
  thumbnailUrl?: string;
  isStarred?: boolean;
  sharedWith?: { email: string; permission: string }[];
};

type DriveFilter = 'all' | 'folders' | 'documents' | 'images' | 'starred';

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
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
  if (m.includes('zip') || m.includes('tar') || m.includes('archive') || m.includes('gz'))
    return '📦';
  if (m.includes('video/')) return '🎬';
  if (m.includes('audio/')) return '🎵';
  if (
    m.includes('javascript') ||
    m.includes('typescript') ||
    m.includes('json') ||
    m.includes('html') ||
    m.includes('css') ||
    m.includes('python') ||
    m.includes('rust')
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
    currentFolderId,
    fetchFiles,
    uploadFiles,
    downloadFile,
    createFolder,
    deleteFiles,
    renameFile,
    starFile,
    unstarFile,
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renameTarget, setRenameTarget] = useState<DriveItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFiles(currentFolderId);
  }, [fetchFiles, currentFolderId]);

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
            m.includes('csv') ||
            m.includes('json'))
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

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      const arr = Array.from(fileList);
      showToast({
        text: `Uploading ${arr.length} file${arr.length > 1 ? 's' : ''}…`,
        type: 'info',
      });
      await uploadFiles(arr);
      showToast({
        text: `Uploaded ${arr.length} file${arr.length > 1 ? 's' : ''} successfully`,
        type: 'success',
      });
      e.target.value = '';
    }
  };

  useEffect(() => {
    const handler = () => handleUploadTrigger();
    window.addEventListener('quant:drive:upload', handler);
    return () => window.removeEventListener('quant:drive:upload', handler);
  }, [handleUploadTrigger]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const arr = Array.from(e.dataTransfer.files);
      showToast({
        text: `Uploading ${arr.length} dropped file${arr.length > 1 ? 's' : ''}…`,
        type: 'info',
      });
      await uploadFiles(arr);
      showToast({
        text: `Uploaded ${arr.length} file${arr.length > 1 ? 's' : ''} successfully`,
        type: 'success',
      });
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createFolder(name, currentFolderId);
      setShowNewFolderModal(false);
      setNewFolderName('');
      showToast({ text: `Created folder "${name}"`, type: 'success' });
    } catch {
      showToast({ text: 'Failed to create folder', type: 'error' });
    }
  };

  const handleToggleStar = async (item: DriveItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      if (item.isStarred) {
        await unstarFile(item.id);
        showToast({ text: `Removed from starred`, type: 'info' });
      } else {
        await starFile(item.id);
        showToast({ text: `Starred "${item.name}"`, type: 'success' });
      }
    } catch {
      showToast({ text: 'Could not update star status', type: 'error' });
    }
  };

  const handleDeleteItem = async (id: string, name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      try {
        await deleteFiles([id]);
        showToast({ text: `Deleted "${name}"`, type: 'info' });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch {
        showToast({ text: 'Failed to delete item', type: 'error' });
      }
    }
  };

  const handleBatchDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (confirm(`Delete ${count} selected item${count > 1 ? 's' : ''}?`)) {
      try {
        await deleteFiles(Array.from(selectedIds));
        showToast({ text: `Deleted ${count} items`, type: 'info' });
        setSelectedIds(new Set());
      } catch {
        showToast({ text: 'Failed to delete items', type: 'error' });
      }
    }
  };

  const handleOpenRename = (item: DriveItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRenameTarget(item);
    setRenameValue(item.name);
  };

  const handleSaveRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await renameFile(renameTarget.id, renameValue.trim());
      showToast({ text: `Renamed to "${renameValue.trim()}"`, type: 'success' });
      setRenameTarget(null);
    } catch {
      showToast({ text: 'Failed to rename', type: 'error' });
    }
  };

  const handleToggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const usedBytes = quota?.used ?? 124000000;
  const totalBytes = quota?.total ?? 15 * 1024 * 1024 * 1024;
  const usedPct = Math.min(100, Math.round((usedBytes / totalBytes) * 100));

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
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
                  else fetchFiles(currentFolderId);
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

        {/* Filter Chips Bar & Breadcrumb Path */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-8 border-b border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] overflow-x-auto">
          <div className="flex items-center gap-2">
            {(
              [
                { key: 'all', label: 'All Items' },
                { key: 'folders', label: 'Folders' },
                { key: 'documents', label: 'Documents' },
                { key: 'images', label: 'Images' },
                { key: 'starred', label: 'Starred ★' },
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
          </div>

          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
            <button
              type="button"
              onClick={() => navigateToFolder(null, 'Home')}
              className={`hover:text-[#ff9933] transition-colors ${
                !currentFolderId ? 'text-white font-bold' : ''
              }`}
            >
              My Drive
            </button>
            {breadcrumbs &&
              breadcrumbs.slice(1).map((b, i) => (
                <span key={b.id || i} className="flex items-center gap-1.5">
                  <span className="text-zinc-600">/</span>
                  <button
                    type="button"
                    onClick={() => navigateToBreadcrumb(i + 1)}
                    className="hover:text-[#ff9933] hover:underline text-white font-medium truncate max-w-[120px]"
                  >
                    {b.name}
                  </button>
                </span>
              ))}
          </nav>
        </div>

        {/* Batch Selection Action Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2 sm:px-8 bg-[#ff9933]/15 border-b border-[#ff9933]/30 text-xs">
            <span className="font-semibold text-white">
              {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  for (const id of selectedIds) {
                    const item = items.find((i) => i.id === id);
                    if (item && item.type !== 'folder') downloadFile(item.id, item.name);
                  }
                  showToast({ text: `Downloading selected files…`, type: 'info' });
                }}
                className="px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-200 hover:text-white font-medium"
              >
                ⬇ Download All
              </button>
              <button
                type="button"
                onClick={handleBatchDelete}
                className="px-2.5 py-1 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 font-medium"
              >
                🗑 Delete Selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-2.5 py-1 rounded-md text-zinc-400 hover:text-white"
              >
                ✕ Deselect
              </button>
            </div>
          </div>
        )}

        {/* Main Drive Files Content */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`flex-1 overflow-y-auto px-4 py-6 sm:px-8 space-y-8 relative ${
            isDragOver ? 'bg-[#ff9933]/5' : ''
          }`}
        >
          {/* Drag Overlay Hint */}
          {isDragOver && (
            <div className="absolute inset-4 z-30 border-2 border-dashed border-[#ff9933] rounded-3xl bg-[#0a0a0c]/90 flex flex-col items-center justify-center pointer-events-none backdrop-blur-sm">
              <span className="text-5xl animate-bounce">📤</span>
              <p className="text-base font-bold text-white mt-3">Drop files here to upload</p>
              <p className="text-xs text-zinc-400 mt-1">
                Encrypted and synced directly to QuantDrive
              </p>
            </div>
          )}

          {/* Storage Meter & Security Banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border border-[var(--quant-border)] bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-amber-950/20 shadow-md gap-4">
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
                  High-speed cloud drive integrated with Mail attachments and AI workspace context.
                </p>
              </div>
            </div>

            <div className="w-full sm:w-64 flex flex-col gap-1.5 shrink-0">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-zinc-400">Storage Used</span>
                <span className="text-white font-semibold">
                  {formatFileSize(usedBytes)} / {formatFileSize(totalBytes)} ({usedPct}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#ff9933] to-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(4, usedPct)}%` }}
                />
              </div>
            </div>
          </div>

          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="130px" />
              ))}
            </div>
          )}

          {error && <ErrorState message={error} onRetry={() => void fetchFiles(currentFolderId)} />}

          {!loading && !error && filteredItems.length === 0 && (
            <div className="text-center py-16 space-y-4">
              <div className="flex justify-center">
                <img
                  src="/quant-drive-logo.png"
                  alt="Drive"
                  className="size-28 object-contain drop-shadow-[0_12px_32px_rgba(255,153,51,0.45)] hover:scale-105 transition-transform"
                />
              </div>
              <h3 className="text-xl font-extrabold text-white">
                {searchQuery ? 'No matching files found' : 'This folder is empty'}
              </h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Drag and drop files anywhere on the screen, or click Upload to store files securely.
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
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      Folders ({folders.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {folders.map((folder) => {
                      const isSelected = selectedIds.has(folder.id);
                      return (
                        <div
                          key={folder.id}
                          onClick={() => navigateToFolder(folder.id, folder.name)}
                          className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                            isSelected
                              ? 'border-[#ff9933] bg-[#ff9933]/10'
                              : 'border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[#ff9933]/60 hover:bg-[var(--quant-surface-hover)]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleToggleSelect(folder.id, e as never)}
                              onClick={(e) => e.stopPropagation()}
                              className="accent-[#ff9933] rounded cursor-pointer"
                            />
                            <span className="text-xl group-hover:scale-110 transition-transform">
                              📁
                            </span>
                            <span className="text-xs font-semibold text-white truncate min-w-0 flex-1">
                              {folder.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => handleToggleStar(folder, e)}
                              className={`p-1 text-xs ${
                                folder.isStarred
                                  ? 'text-amber-400'
                                  : 'text-zinc-500 hover:text-white'
                              }`}
                              title={folder.isStarred ? 'Unstar' : 'Star'}
                            >
                              ★
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleOpenRename(folder, e)}
                              className="p-1 text-xs text-zinc-500 hover:text-white"
                              title="Rename"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteItem(folder.id, folder.name, e)}
                              className="p-1 text-xs text-zinc-500 hover:text-rose-400"
                              title="Delete"
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      );
                    })}
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
                      {regularFiles.map((file) => {
                        const isSelected = selectedIds.has(file.id);
                        return (
                          <div
                            key={file.id}
                            className={`group relative flex flex-col justify-between p-3.5 rounded-2xl border transition-all shadow-sm ${
                              isSelected
                                ? 'border-[#ff9933] bg-[#ff9933]/10 ring-1 ring-[#ff9933]'
                                : 'border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[#ff9933]/60'
                            }`}
                          >
                            {/* Card Selection and Actions Header */}
                            <div className="flex items-center justify-between mb-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => handleToggleSelect(file.id, e as never)}
                                className="accent-[#ff9933] rounded cursor-pointer"
                              />
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleStar(file, e)}
                                  className={`p-1 text-xs rounded transition-colors ${
                                    file.isStarred
                                      ? 'text-amber-400'
                                      : 'text-zinc-500 hover:text-white'
                                  }`}
                                  title={file.isStarred ? 'Unstar' : 'Star'}
                                >
                                  ★
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenRename(file, e)}
                                  className="p-1 text-xs text-zinc-500 hover:text-white"
                                  title="Rename"
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteItem(file.id, file.name, e)}
                                  className="p-1 text-xs text-zinc-500 hover:text-rose-400"
                                  title="Delete"
                                >
                                  🗑
                                </button>
                              </div>
                            </div>

                            {/* Card Body Preview Click */}
                            <div
                              onClick={() => setPreviewItem(file)}
                              className="cursor-pointer flex flex-col items-center justify-center py-6 rounded-xl bg-[var(--quant-surface-subtle)] group-hover:bg-zinc-800/80 transition-colors"
                            >
                              <span className="text-3xl mb-1 group-hover:scale-110 transition-transform">
                                {getFileIcon(file.mimeType, file.type)}
                              </span>
                              <span className="text-[10px] text-zinc-500 font-mono uppercase">
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
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[var(--quant-border)] overflow-hidden bg-[var(--quant-surface)]">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] text-[11px] font-bold text-zinc-400 uppercase">
                          <tr>
                            <th className="py-3 px-4 w-8">
                              <input
                                type="checkbox"
                                checked={
                                  regularFiles.length > 0 &&
                                  regularFiles.every((f) => selectedIds.has(f.id))
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedIds(new Set(regularFiles.map((f) => f.id)));
                                  } else {
                                    setSelectedIds(new Set());
                                  }
                                }}
                                className="accent-[#ff9933] rounded"
                              />
                            </th>
                            <th className="py-3 px-4">Name</th>
                            <th className="py-3 px-4 hidden sm:table-cell">Type</th>
                            <th className="py-3 px-4">Size</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {regularFiles.map((file) => {
                            const isSelected = selectedIds.has(file.id);
                            return (
                              <tr
                                key={file.id}
                                className={`transition-colors ${
                                  isSelected ? 'bg-[#ff9933]/10' : 'hover:bg-zinc-800/50'
                                }`}
                              >
                                <td className="py-3 px-4">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => handleToggleSelect(file.id, e as never)}
                                    className="accent-[#ff9933] rounded cursor-pointer"
                                  />
                                </td>
                                <td className="py-3 px-4 font-semibold text-white flex items-center gap-2">
                                  <span>{getFileIcon(file.mimeType, file.type)}</span>
                                  <span
                                    onClick={() => setPreviewItem(file)}
                                    className="cursor-pointer hover:text-[#ff9933] truncate max-w-xs"
                                  >
                                    {file.name}
                                  </span>
                                  {file.isStarred && (
                                    <span className="text-amber-400 text-xs">★</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-zinc-400 hidden sm:table-cell">
                                  {file.mimeType}
                                </td>
                                <td className="py-3 px-4 text-zinc-400">
                                  {formatFileSize(file.size)}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleStar(file)}
                                      className={`text-xs ${
                                        file.isStarred
                                          ? 'text-amber-400'
                                          : 'text-zinc-500 hover:text-white'
                                      }`}
                                    >
                                      ★
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => downloadFile(file.id, file.name)}
                                      className="text-xs text-[#ff9933] hover:underline font-semibold"
                                    >
                                      Download
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => handleDeleteItem(file.id, file.name, e)}
                                      className="text-xs text-zinc-500 hover:text-rose-400 font-semibold"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                }}
                placeholder="e.g. Invoices, Project Assets, Designs…"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowNewFolderModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreateFolder}>
                Create Folder
              </Button>
            </div>
          </div>
        </Modal>

        {/* Rename Modal */}
        <Modal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          title={`Rename "${renameTarget?.name}"`}
        >
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">New Name</label>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRename();
                }}
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setRenameTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveRename}>
                Save Changes
              </Button>
            </div>
          </div>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}
