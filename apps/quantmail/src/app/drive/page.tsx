'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button, Skeleton, Modal, ErrorState } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { AIMemoryPanel } from '../../components/AIMemoryPanel';
import { PageTransition } from '../../components/PageTransition';
import { useConfirm } from '../../hooks/useConfirm';
import { useDrive } from '../../hooks/useDrive';
import { formatBytes } from '../../lib/format-bytes';
import { showToast } from '../../components/InboxToast';
import {
  IconDownload,
  IconFile,
  IconFolderPlus,
  IconGrid,
  IconList,
  IconStar,
  IconStarFilled,
  IconUpload,
} from '../../components/icons';

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

/** Shared dedupe key so an upload's progress line is replaced by its outcome. */
const UPLOAD_TOAST = 'drive-upload';

function getFileIcon(mimeType: string, type: string, className = 'w-5 h-5'): React.ReactNode {
  if (type === 'folder') {
    return (
      <svg
        className={`${className} text-[#FF8C42] shrink-0`}
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M4 4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8L10 4H4z" />
      </svg>
    );
  }
  const m = (mimeType || '').toLowerCase();
  if (m.startsWith('image/')) {
    return (
      <svg
        className={`${className} text-[#60A5FA] shrink-0`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={1.8} />
        <circle cx="8.5" cy="8.5" r="1.5" strokeWidth={1.8} />
        <polyline
          points="21 15 16 10 5 21"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (m.includes('pdf')) {
    return (
      <svg
        className={`${className} text-[#EF4444] shrink-0`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        />
        <polyline points="14 2 14 8 20 8" strokeWidth={1.8} />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M9 13h2a1.5 1.5 0 0 0 0-3H9v6m5-6v6m3-6h-3v6"
        />
      </svg>
    );
  }
  if (m.includes('spreadsheet') || m.includes('excel') || m.includes('csv')) {
    return (
      <svg
        className={`${className} text-[#22C55E] shrink-0`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={1.8} />
        <line x1="3" y1="9" x2="21" y2="9" strokeWidth={1.8} />
        <line x1="3" y1="15" x2="21" y2="15" strokeWidth={1.8} />
        <line x1="9" y1="3" x2="9" y2="21" strokeWidth={1.8} />
        <line x1="15" y1="3" x2="15" y2="21" strokeWidth={1.8} />
      </svg>
    );
  }
  if (m.includes('presentation') || m.includes('powerpoint')) {
    return (
      <svg
        className={`${className} text-[#F59E0B] shrink-0`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth={1.8} />
        <line x1="8" y1="21" x2="16" y2="21" strokeWidth={1.8} strokeLinecap="round" />
        <line x1="12" y1="17" x2="12" y2="21" strokeWidth={1.8} />
      </svg>
    );
  }
  if (m.includes('zip') || m.includes('tar') || m.includes('archive') || m.includes('gz')) {
    return (
      <svg
        className={`${className} text-[#A78BFA] shrink-0`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <polyline
          points="21 8 21 21 3 21 3 8"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="1" y="3" width="22" height="5" rx="1" strokeWidth={1.8} />
        <line x1="10" y1="12" x2="14" y2="12" strokeWidth={1.8} strokeLinecap="round" />
      </svg>
    );
  }
  if (m.includes('video/')) {
    return (
      <svg
        className={`${className} text-[#EC4899] shrink-0`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <polygon
          points="23 7 16 12 23 17 23 7"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="1" y="5" width="15" height="14" rx="2" strokeWidth={1.8} />
      </svg>
    );
  }
  if (m.includes('audio/')) {
    return (
      <svg
        className={`${className} text-[#14B8A6] shrink-0`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" strokeWidth={1.8} />
        <circle cx="18" cy="16" r="3" strokeWidth={1.8} />
      </svg>
    );
  }
  if (
    m.includes('javascript') ||
    m.includes('typescript') ||
    m.includes('json') ||
    m.includes('html') ||
    m.includes('css') ||
    m.includes('python') ||
    m.includes('rust')
  ) {
    return (
      <svg
        className={`${className} text-[#F97316] shrink-0`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <polyline
          points="16 18 22 12 16 6"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="8 6 2 12 8 18"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      className={`${className} text-[#A1A4AC] shrink-0`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
      />
      <polyline points="14 2 14 8 20 8" strokeWidth={1.8} />
      <line x1="16" y1="13" x2="8" y2="13" strokeWidth={1.8} strokeLinecap="round" />
      <line x1="16" y1="17" x2="8" y2="17" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
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
  } = useDrive();

  const { confirm, dialog } = useConfirm();

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

  // Debounced search: avoid firing an API request on every keystroke
  useEffect(() => {
    const q = searchQuery.trim();
    const t = setTimeout(() => {
      if (q) searchFiles(q);
      else fetchFiles(currentFolderId);
    }, 300);
    return () => clearTimeout(t);
    // Intentionally keyed on searchQuery alone: re-running on folder id or on the
    // fetcher identities would restart the debounce mid-keystroke.
  }, [searchQuery]);

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

  /**
   * One upload path for the file picker and for drag-and-drop.
   *
   * These were two copies of the same twenty lines. Both also fired a
   * `Uploading N files…` toast whose text differs from the outcome toast, so the
   * progress line and the result sat on screen together for the rest of its 3.2s
   * life. Every toast here now shares `subject: 'drive-upload'`, so the outcome
   * replaces the progress line instead of queueing behind it.
   */
  const runUpload = useCallback(
    async (arr: File[], verb: string) => {
      const count = `${arr.length} file${arr.length > 1 ? 's' : ''}`;
      showToast({ text: `${verb} ${count}…`, type: 'info', subject: UPLOAD_TOAST });
      try {
        await uploadFiles(arr);
        showToast({ text: `Uploaded ${count}`, type: 'success', subject: UPLOAD_TOAST });
      } catch (err) {
        showToast({
          text:
            err instanceof Error && err.message
              ? `Upload failed: ${err.message}`
              : 'Upload failed — please try again (max 50 MB per file)',
          type: 'error',
          subject: UPLOAD_TOAST,
        });
      }
    },
    [uploadFiles],
  );

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      try {
        await runUpload(Array.from(fileList), 'Uploading');
      } finally {
        e.target.value = '';
      }
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
      await runUpload(Array.from(e.dataTransfer.files), 'Uploading dropped');
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createFolder(name, currentFolderId);
      setShowNewFolderModal(false);
      setNewFolderName('');
      showToast({ text: `Created folder "${name}"`, type: 'success', subject: 'drive-folder' });
    } catch {
      showToast({ text: 'Failed to create folder', type: 'error', subject: 'drive-folder' });
    }
  };

  const handleToggleStar = async (item: DriveItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Keyed on the file, and both messages name it. Previously the unstar toast
    // read a bare `Removed from starred` while the star toast named the file, so
    // starring and unstarring the same item left two contradictory toasts up with
    // no way to tell which one described the current state.
    const subject = `drive-star-${item.id}`;
    try {
      if (item.isStarred) {
        await unstarFile(item.id);
        showToast({ text: `Unstarred "${item.name}"`, type: 'info', subject });
      } else {
        await starFile(item.id);
        showToast({ text: `Starred "${item.name}"`, type: 'success', subject });
      }
    } catch {
      showToast({ text: `Could not update star on "${item.name}"`, type: 'error', subject });
    }
  };

  const handleDeleteItem = async (id: string, name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ok = await confirm({
      title: `Delete "${name}" permanently?`,
      message:
        'The file leaves your Drive for good. There is no undo and no trash to recover it from.',
      confirmLabel: 'Delete permanently',
      variant: 'destructive',
    });
    if (ok) {
      const subject = `drive-delete-${id}`;
      try {
        await deleteFiles([id]);
        showToast({ text: `Deleted "${name}"`, type: 'info', subject });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch {
        showToast({ text: `Failed to delete "${name}"`, type: 'error', subject });
      }
    }
  };

  const handleBatchDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    const label = `${count} item${count > 1 ? 's' : ''}`;
    const ok = await confirm({
      title: `Delete ${label} permanently?`,
      message:
        'They leave your Drive for good. There is no undo and no trash to recover them from.',
      confirmLabel: 'Delete permanently',
      variant: 'destructive',
    });
    if (ok) {
      try {
        await deleteFiles(Array.from(selectedIds));
        // Was `Deleted ${count} items`, which said "Deleted 1 items".
        showToast({ text: `Deleted ${label}`, type: 'info', subject: 'drive-delete-batch' });
        setSelectedIds(new Set());
      } catch {
        showToast({
          text: `Failed to delete ${label}`,
          type: 'error',
          subject: 'drive-delete-batch',
        });
      }
    }
  };

  /**
   * Download every selected file, and say what actually happened.
   *
   * The old inline handler always announced `Downloading selected files…`, even
   * when the selection was folders only and the loop downloaded nothing — a
   * folder has no download endpoint. The count now comes from the same filter the
   * loop uses.
   */
  const handleDownloadSelected = () => {
    const targets = Array.from(selectedIds)
      .map((id) => items.find((i) => i.id === id))
      .filter((item): item is DriveItem => !!item && item.type !== 'folder');

    targets.forEach((item) => downloadFile(item.id, item.name));

    showToast({
      text: targets.length
        ? `Downloading ${targets.length} file${targets.length > 1 ? 's' : ''}…`
        : 'Nothing to download — folders cannot be downloaded.',
      type: targets.length ? 'info' : 'warning',
      subject: 'drive-download',
    });
  };

  const handleOpenRename = (item: DriveItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRenameTarget(item);
    setRenameValue(item.name);
  };

  const handleSaveRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    const subject = `drive-rename-${renameTarget.id}`;
    const from = renameTarget.name;
    const to = renameValue.trim();
    try {
      await renameFile(renameTarget.id, to);
      showToast({ text: `Renamed "${from}" to "${to}"`, type: 'success', subject });
      setRenameTarget(null);
    } catch {
      showToast({ text: `Failed to rename "${from}"`, type: 'error', subject });
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

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search files, folders, documents…"
    >
      <PageTransition className="workspace-page drive-workspace flex flex-col h-full bg-[#090A0C]">
        <input
          id="drive-file-input"
          name="driveFiles"
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />

        {/*
         * One toolbar, not two.
         *
         * This screen used to stack a control bar (view switcher + New Folder +
         * Upload Files) on top of a second bar (filter pills + breadcrumb). At
         * 393px that pushed the actual file listing below the fold, and the
         * ungated "Upload Files" button sat directly above the mobile upload FAB
         * — two controls, same action, both on screen. Everything now shares one
         * row: breadcrumb, a scrolling pill strip, and a right cluster whose
         * duplicate Upload is desktop-only.
         */}
        <div className="flex items-center gap-2 border-b border-[var(--quant-border)] bg-[var(--quant-surface)] px-4 py-2 sm:px-8">
          {/* Breadcrumbs — hidden at root on mobile, where "My Drive" is redundant */}
          <nav
            className={`min-w-0 shrink items-center gap-1.5 text-xs text-[#A1A4AC] ${
              currentFolderId ? 'flex' : 'hidden md:flex'
            }`}
            aria-label="Breadcrumb"
          >
            <button
              type="button"
              onClick={() => navigateToFolder(null, 'Home')}
              className={`shrink-0 rounded transition-colors hover:text-[#FF8C42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                !currentFolderId ? 'font-semibold text-[#F5F5F5]' : ''
              }`}
            >
              My Drive
            </button>
            {breadcrumbs &&
              breadcrumbs.slice(1).map((b, i) => (
                <span key={b.id || i} className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-[#6B6E76]">/</span>
                  <button
                    type="button"
                    onClick={() => navigateToBreadcrumb(i + 1)}
                    className="max-w-[120px] truncate rounded font-medium text-[#F5F5F5] transition-colors hover:text-[#FF8C42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  >
                    {b.name}
                  </button>
                </span>
              ))}
            <span className="mx-1 hidden h-4 w-px shrink-0 bg-[#282C35] md:block" />
          </nav>

          {/* Filter pills — the only element allowed to overflow */}
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar">
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
                aria-pressed={activeFilter === filter.key}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                  activeFilter === filter.key
                    ? 'bg-[#2B1A11] text-[#FF8C42] shadow-[inset_0_0_0_1px_#5C3016]'
                    : 'bg-[#16181D] text-[#A1A4AC] shadow-[inset_0_0_0_1px_#282C35] hover:text-[#F5F5F5]'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Right cluster */}
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex items-center rounded-lg bg-[var(--quant-surface-subtle)] p-0.5 shadow-[inset_0_0_0_1px_var(--quant-border)]">
              {(
                [
                  { key: 'grid', label: 'Grid view', Icon: IconGrid },
                  { key: 'list', label: 'List view', Icon: IconList },
                ] as const
              ).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setViewMode(key)}
                  aria-label={label}
                  aria-pressed={viewMode === key}
                  className={`grid size-8 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                    viewMode === key
                      ? 'bg-[#FF8C42] text-[#111111]'
                      : 'text-[#A1A4AC] hover:text-[#F5F5F5]'
                  }`}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowNewFolderModal(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#A1A4AC] shadow-[inset_0_0_0_1px_var(--quant-border)] transition-colors hover:text-[#F5F5F5] hover:shadow-[inset_0_0_0_1px_#5C3016] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] md:px-3"
              aria-label="New folder"
            >
              <IconFolderPlus size={14} />
              <span className="hidden md:inline">New Folder</span>
            </button>

            {/* Desktop only: on mobile this action belongs to the FAB alone. */}
            <button
              type="button"
              onClick={handleUploadTrigger}
              className="hidden h-8 items-center gap-1.5 rounded-lg bg-[#FF8C42] px-3 text-xs font-semibold text-[#111111] transition-colors hover:bg-[#FF9B5A] active:bg-[#E8752F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-surface)] md:inline-flex"
            >
              <IconUpload size={14} />
              <span>Upload</span>
            </button>
          </div>
        </div>

        {/* Batch Selection Action Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2 sm:px-8 bg-[#FF8C42]/15 border-b border-[#FF8C42]/30 text-xs">
            <span className="font-semibold text-white">
              {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadSelected}
                className="min-h-touch px-2.5 rounded-md bg-[#16181D] border border-[#282C35] text-[#F5F5F5] hover:bg-[#1C1F26] font-medium flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span>Download All</span>
              </button>
              <button
                type="button"
                onClick={handleBatchDelete}
                className="min-h-touch px-2.5 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 font-medium flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                <span>Delete Selected</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="min-h-touch px-2.5 rounded-md text-[#A1A4AC] hover:text-[#F5F5F5] flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              >
                <svg
                  className="size-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Deselect
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
          className={`flex-1 overflow-y-auto px-4 py-6 sm:px-8 space-y-6 relative ${
            isDragOver ? 'bg-[#FF8C42]/5' : ''
          }`}
        >
          {/* Drag Overlay Hint */}
          {isDragOver && (
            <div className="absolute inset-4 z-30 border-2 border-dashed border-[#FF8C42] rounded-2xl bg-[#090A0C]/90 flex flex-col items-center justify-center pointer-events-none backdrop-blur-sm">
              <svg
                className="w-12 h-12 text-[#FF8C42] mb-3 animate-bounce"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-base font-semibold text-white">Drop files here to upload</p>
              <p className="text-xs text-[#A1A4AC] mt-1">Stored securely in QuantDrive</p>
            </div>
          )}

          {/*
            What the assistant has learned, alongside what the user has stored — the
            two halves of "my things live here". Collapsed by default so the files
            stay the point of the page.
          */}
          <AIMemoryPanel query={searchQuery} />

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
                  className="size-28 object-contain transition-transform hover:scale-105"
                />
              </div>
              <h3 className="text-xl font-extrabold text-[#F5F5F5]">
                {searchQuery ? 'No matching files found' : 'This folder is empty'}
              </h3>
              <p className="text-xs text-[#A1A4AC] max-w-sm mx-auto">
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
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#A1A4AC]">
                      Folders ({folders.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                    {folders.map((folder) => {
                      const isSelected = selectedIds.has(folder.id);
                      return (
                        <div
                          key={folder.id}
                          onClick={() => navigateToFolder(folder.id, folder.name)}
                          className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                            isSelected
                              ? 'border-[#FF8C42] bg-[#FF8C42]/10'
                              : 'border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[#FF8C42]/60 hover:bg-[var(--quant-surface-hover)]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleToggleSelect(folder.id, e as never)}
                              onClick={(e) => e.stopPropagation()}
                              className="accent-[#FF8C42] rounded cursor-pointer"
                              aria-label={`Select folder ${folder.name}`}
                            />
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#2B1A11] border border-[#5C3016] shrink-0 group-hover:scale-105 transition-transform">
                              <svg
                                className="w-4 h-4 text-[#FF8C42]"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M4 4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8L10 4H4z" />
                              </svg>
                            </div>
                            <span className="text-xs font-semibold text-[#F5F5F5] truncate min-w-0 flex-1">
                              {folder.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => handleToggleStar(folder, e)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                folder.isStarred
                                  ? 'text-[#FF8C42] bg-[#2B1A11]'
                                  : 'text-[#6B6E76] hover:text-[#F5F5F5] hover:bg-white/5'
                              }`}
                              title={folder.isStarred ? 'Unstar' : 'Star'}
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill={folder.isStarred ? 'currentColor' : 'none'}
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <polygon
                                  points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                                  strokeWidth={1.8}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleOpenRename(folder, e)}
                              className="p-1.5 rounded-lg text-[#6B6E76] hover:text-[#F5F5F5] hover:bg-white/5 transition-colors"
                              title="Rename"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.8}
                                  d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.8}
                                  d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteItem(folder.id, folder.name, e)}
                              className="p-1.5 rounded-lg text-[#6B6E76] hover:text-[#F87171] hover:bg-[#2A1215] transition-colors"
                              title="Delete"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <polyline
                                  points="3 6 5 6 21 6"
                                  strokeWidth={1.8}
                                  strokeLinecap="round"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.8}
                                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                                />
                              </svg>
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
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#A1A4AC] mb-3">
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
                                ? 'border-[#FF8C42] bg-[#FF8C42]/10 ring-1 ring-[#FF8C42]'
                                : 'border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[#FF8C42]/60'
                            }`}
                          >
                            {/* Card Selection and Actions Header */}
                            <div className="flex items-center justify-between mb-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => handleToggleSelect(file.id, e as never)}
                                className="accent-[#FF8C42] rounded cursor-pointer"
                                aria-label={`Select file ${file.name}`}
                              />
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleStar(file, e)}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    file.isStarred
                                      ? 'text-[#FF8C42] bg-[#2B1A11]'
                                      : 'text-[#6B6E76] hover:text-[#F5F5F5] hover:bg-white/5'
                                  }`}
                                  title={file.isStarred ? 'Unstar' : 'Star'}
                                >
                                  <svg
                                    className="w-3.5 h-3.5"
                                    fill={file.isStarred ? 'currentColor' : 'none'}
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <polygon
                                      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                                      strokeWidth={1.8}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenRename(file, e)}
                                  className="p-1.5 rounded-lg text-[#6B6E76] hover:text-[#F5F5F5] hover:bg-white/5 transition-colors"
                                  title="Rename"
                                >
                                  <svg
                                    className="w-3.5 h-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.8}
                                      d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.8}
                                      d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                                    />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteItem(file.id, file.name, e)}
                                  className="p-1.5 rounded-lg text-[#6B6E76] hover:text-[#F87171] hover:bg-[#2A1215] transition-colors"
                                  title="Delete"
                                >
                                  <svg
                                    className="w-3.5 h-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <polyline
                                      points="3 6 5 6 21 6"
                                      strokeWidth={1.8}
                                      strokeLinecap="round"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.8}
                                      d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            {/*
                             * Card body — the thumbnail well.
                             *
                             * This used to be a bordered box holding a *second*
                             * bordered box for the icon, inside the already-bordered
                             * file card: three frames stacked around one 24px glyph.
                             * The well is now a plain darker surface and the icon
                             * sits on it unframed.
                             */}
                            <div
                              onClick={() => setPreviewItem(file)}
                              className="flex cursor-pointer flex-col items-center justify-center rounded-xl bg-[#090A0C] py-6 transition-colors group-hover:bg-[#16181D]"
                            >
                              <div className="mb-2 grid size-12 place-items-center text-[#A1A4AC] transition-transform group-hover:scale-105">
                                {getFileIcon(file.mimeType, file.type, 'w-6 h-6')}
                              </div>
                              <span className="font-mono text-[10px] uppercase tracking-wider text-[#A1A4AC]">
                                {file.mimeType.split('/')[1] || 'FILE'}
                              </span>
                            </div>

                            <div className="mt-3">
                              <h4
                                onClick={() => setPreviewItem(file)}
                                className="cursor-pointer truncate text-xs font-bold text-[#F5F5F5] hover:text-[#FF8C42]"
                                title={file.name}
                              >
                                {file.name}
                              </h4>
                              <div className="flex items-center justify-between text-[11px] text-[#A1A4AC] mt-1">
                                <span>{formatBytes(file.size)}</span>
                                <button
                                  type="button"
                                  onClick={() => downloadFile(file.id, file.name)}
                                  className="inline-flex items-center gap-1 rounded font-semibold text-[#FF8C42] hover:text-[#FF9B5A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                                >
                                  <IconDownload size={12} />
                                  <span>Download</span>
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
                        <thead className="border-b border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] text-[11px] font-bold text-[#A1A4AC] uppercase">
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
                                className="accent-[#FF8C42] rounded"
                                aria-label="Select all files"
                              />
                            </th>
                            <th className="py-3 px-4">Name</th>
                            <th className="py-3 px-4 hidden sm:table-cell">Type</th>
                            <th className="py-3 px-4">Size</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#282C35]">
                          {regularFiles.map((file) => {
                            const isSelected = selectedIds.has(file.id);
                            return (
                              <tr
                                key={file.id}
                                className={`transition-colors ${
                                  isSelected ? 'bg-[#FF8C42]/10' : 'hover:bg-[#282C35]/50'
                                }`}
                              >
                                <td className="py-3 px-4">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => handleToggleSelect(file.id, e as never)}
                                    className="accent-[#FF8C42] rounded cursor-pointer"
                                    aria-label={`Select file ${file.name}`}
                                  />
                                </td>
                                <td className="py-3 px-4 font-semibold text-white flex items-center gap-2">
                                  <span>{getFileIcon(file.mimeType, file.type)}</span>
                                  <span
                                    onClick={() => setPreviewItem(file)}
                                    className="cursor-pointer hover:text-[#FF8C42] truncate max-w-xs"
                                  >
                                    {file.name}
                                  </span>
                                  {file.isStarred && (
                                    <span className="text-[#FF8C42]" title="Starred">
                                      <IconStarFilled size={12} />
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-[#A1A4AC] hidden sm:table-cell">
                                  {file.mimeType}
                                </td>
                                <td className="py-3 px-4 text-[#A1A4AC]">
                                  {formatBytes(file.size)}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleStar(file)}
                                      aria-pressed={Boolean(file.isStarred)}
                                      aria-label={file.isStarred ? 'Unstar file' : 'Star file'}
                                      className={`grid size-8 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                                        file.isStarred
                                          ? 'text-[#FF8C42]'
                                          : 'text-[#6B6E76] hover:text-[#F5F5F5]'
                                      }`}
                                    >
                                      {file.isStarred ? (
                                        <IconStarFilled size={14} />
                                      ) : (
                                        <IconStar size={14} />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => downloadFile(file.id, file.name)}
                                      className="text-xs text-[#FF8C42] hover:underline font-semibold"
                                    >
                                      Download
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => handleDeleteItem(file.id, file.name, e)}
                                      className="text-xs text-[#A1A4AC] hover:text-rose-400 font-semibold"
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
            <div className="flex flex-col items-center justify-center rounded-xl bg-[#111318] p-8 shadow-[inset_0_0_0_1px_#282C35]">
              <span className="mb-3 text-[#A1A4AC]">
                {previewItem ? (
                  getFileIcon(previewItem.mimeType, previewItem.type, 'w-14 h-14')
                ) : (
                  <IconFile size={56} />
                )}
              </span>
              <h4 className="text-sm font-bold text-[#F5F5F5]">{previewItem?.name}</h4>
              <p className="text-xs text-[#A1A4AC] mt-1">
                {previewItem?.mimeType} · {formatBytes(previewItem?.size ?? 0)}
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
              <label
                htmlFor="drive-new-folder-name"
                className="block text-xs font-semibold text-[#A1A4AC] mb-1"
              >
                Folder Name
              </label>
              <input
                id="drive-new-folder-name"
                name="newFolderName"
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                }}
                placeholder="e.g. Invoices, Project Assets, Designs…"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[#FF8C42]"
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
              <label
                htmlFor="drive-rename-value"
                className="block text-xs font-semibold text-[#A1A4AC] mb-1"
              >
                New Name
              </label>
              <input
                id="drive-rename-value"
                name="renameValue"
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRename();
                }}
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[#FF8C42]"
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
        {dialog}
      </PageTransition>
    </AppShell>
  );
}
