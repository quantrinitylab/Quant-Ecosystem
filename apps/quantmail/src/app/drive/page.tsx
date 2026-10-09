'use client';

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DriveContextTabsHeader,
  DriveMobileTabStrip,
  DriveFilesSubView,
  DriveSharedSubView,
  DriveRecentSubView,
  DriveSharedByMeSubView,
  DriveVaultSubView,
  DriveStarredSubView,
  DriveCleanerSubView,
  DriveHomeSubView,
  DriveFeedSubView,
  DriveAiMemorySubView,
  FileShareModal,
  FilePermissionsViewer,
  FileScanDetail,
  FileDetailsPanel,
  type DriveSubTab,
  type RecentItem,
  type AiMemoryItem,
} from './components';
import { Button, Skeleton, Modal, ErrorState } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { QuantDriveLogo } from '../../components/QuantDriveLogo';
import { useConfirm } from '../../hooks/useConfirm';
import { useDrive, type ReceivedShare, type SentShareItem } from '../../hooks/useDrive';
import { formatBytes } from '../../lib/format-bytes';
import { showToast } from '../../components/InboxToast';
import { useScrollElement, useVirtualizer } from '../../lib/virtual/useVirtualizer';
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
import { FileVersionHistoryModal } from '../../components/drive/FileVersionHistoryModal';
import { FileActivityModal } from '../../components/drive/FileActivityModal';
import { FileAISummaryDrawer } from '../../components/drive/FileAISummaryDrawer';
import { AIDuplicateCleanerModal } from '../../components/drive/AIDuplicateCleanerModal';
import { QuantyFileWorkspace } from '../../components/drive/QuantyFileWorkspace';
import { StorageQuotaBar } from '../../components/drive/StorageQuotaBar';
import { apiFetchRaw } from '@quant/api-client';

type DriveItem = {
  id: string;
  name: string;
  // QM-UIUX-079: 'document' items are the /drive/files projection of doc-editor
  // documents (backend id `doc:<documentId>`). They open in the doc editor,
  // not the file preview — file-only actions (download/star) must not run.
  type: 'file' | 'folder' | 'document';
  mimeType: string;
  size: number;
  modifiedAt: string;
  thumbnailUrl?: string;
  isStarred?: boolean;
  sharedWith?: { email: string; permission: string }[];
  deletedAt?: string;
  // Real Document row id for 'document' items (editor route target).
  documentId?: string;
  // QM-M39-009: security scan state from the backend (never rendered as safe).
  scanStatus?: string | null;
  scanReason?: string | null;
};

type DriveFilter = 'all' | 'folders' | 'documents' | 'images' | 'starred' | 'trash' | 'shared';

/** Shared dedupe key so an upload's progress line is replaced by its outcome. */
const UPLOAD_TOAST = 'drive-upload';

function getFileIcon(mimeType: string, type: string, className = 'w-5 h-5'): React.ReactNode {
  if (type === 'folder') {
    return (
      <svg
        className={`${className} text-[var(--app-accent)] shrink-0`}
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
        className={`${className} text-[var(--quant-destructive)] shrink-0`}
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
        className={`${className} text-[var(--quant-success)] shrink-0`}
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
        className={`${className} text-[var(--quant-warning)] shrink-0`}
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
      className={`${className} text-[var(--quant-muted-foreground)] shrink-0`}
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

function isImageOrDocument(mimeType: string, name: string): boolean {
  const m = (mimeType || '').toLowerCase();
  const n = (name || '').toLowerCase();
  return (
    m.startsWith('image/') ||
    m.includes('pdf') ||
    m.includes('document') ||
    m.includes('word') ||
    m.includes('sheet') ||
    m.includes('excel') ||
    m.includes('csv') ||
    m.includes('presentation') ||
    m.includes('powerpoint') ||
    m.startsWith('text/') ||
    /\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|png|jpe?g|webp|gif|svg)$/i.test(n)
  );
}

function isTextOrCodeFile(mimeType: string, name: string): boolean {
  const m = (mimeType || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (
    m.startsWith('text/') ||
    m.includes('javascript') ||
    m.includes('typescript') ||
    m.includes('json') ||
    m.includes('xml') ||
    m.includes('yaml') ||
    m.includes('markdown') ||
    m.includes('sql') ||
    m.includes('x-sh') ||
    m.includes('x-python')
  ) {
    return true;
  }
  return /\.(txt|md|markdown|json|js|jsx|ts|tsx|py|rs|go|java|c|cpp|h|hpp|cs|rb|php|sh|bash|zsh|yml|yaml|toml|ini|env|sql|graphql|prisma|html|css|scss|less|svg|xml|log|csv|tsv)$/i.test(
    n,
  );
}

function DrivePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams?.get('tab');

  const normalizeTab = useCallback((t: string | null | undefined): DriveSubTab => {
    if (!t) return 'home';
    const lower = t.toLowerCase();
    if (lower === 'home' || lower === 'my_files' || lower === 'files') return 'home';
    if (lower === 'recent') return 'recent';
    if (lower === 'feed') return 'feed';
    if (lower === 'aimemory' || lower === 'memory' || lower === 'ai_memory') return 'aimemory';
    if (lower === 'vault') return 'vault';
    if (lower === 'shared') return 'shared';
    if (lower === 'starred') return 'starred';
    if (lower === 'cleaner') return 'cleaner';
    return 'home';
  }, []);

  const [activeTab, setActiveTab] = useState<DriveSubTab>(() => normalizeTab(tabFromQuery));

  // Sync state if URL query param changes
  useEffect(() => {
    if (tabFromQuery !== undefined) {
      setActiveTab(normalizeTab(tabFromQuery));
    }
  }, [tabFromQuery, normalizeTab]);

  const handleTabChange = useCallback(
    (newTab: DriveSubTab) => {
      setActiveTab(newTab);
      router.push(`/drive?tab=${newTab}`);
    },
    [router],
  );
  const {
    files,
    loading,
    error,
    breadcrumbs,
    currentFolderId,
    fetchFiles,
    uploadFiles,
    downloadFile,
    getDownloadUrl,
    createFolder,
    deleteFiles,
    renameFile,
    starFile,
    unstarFile,
    navigateToFolder,
    navigateToBreadcrumb,
    searchFiles,
    acceptShare,
    declineShare,
    fetchReceivedShares,
    fetchRecentFiles,
    recordFileOpen,
    fetchSentShares,
    fetchTrashFiles,
    restoreFile,
    purgeFile,
    moveFiles,
  } = useDrive();

  // Re-tap active app tab → refresh drive files (P1: app-switcher refresh)
  useEffect(() => {
    const handleRefresh = () => {
      void fetchFiles();
    };
    window.addEventListener('quant:refresh', handleRefresh);
    return () => window.removeEventListener('quant:refresh', handleRefresh);
  }, [fetchFiles]);

  const { confirm, dialog } = useConfirm();

  const [memoryItems, setMemoryItems] = useState<AiMemoryItem[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  const loadMemory = useCallback(async () => {
    setMemoryLoading(true);
    setMemoryError(null);
    try {
      const response = await fetch('/api/drive/memory', { cache: 'no-store' });
      if (!response.ok) throw new Error('Memory data is unavailable right now.');
      const payload = (await response.json()) as {
        memories?: Array<{
          id: string;
          content: string;
          summary?: string;
          sourceApp?: string;
          sourceLabel?: string;
          confidenceScore?: number | null;
          sensitivity?: string | null;
          explicitness?: string | null;
          policyVersion?: string | null;
          provenance?: string | null;
          sourceObjectId?: string | null;
          extractedFacts?: string[];
          entityGraphLinks?: string[];
          updatedAt?: string;
        }>;
      };

      const appMap: Record<string, AiMemoryItem['app']> = {
        QuantMail: 'QuantMail',
        QuantCalendar: 'QuantCalendar',
        QuantDrive: 'QuantDrive',
        QuantContacts: 'QuantContacts',
        QuantGit: 'QuantGit',
        shared: 'Shared',
      };

      setMemoryItems(
        (payload.memories ?? []).map((memory) => ({
          id: memory.id,
          app: appMap[memory.sourceApp ?? ''] ?? 'Shared',
          title: memory.summary?.trim() || memory.content.slice(0, 120),
          timestamp: memory.updatedAt ? new Date(memory.updatedAt).toLocaleString() : 'Unknown time',
          rawContext: memory.content,
          extractedFacts: memory.extractedFacts ?? [],
          entityGraphLinks: memory.entityGraphLinks ?? [],
          confidenceScore: memory.confidenceScore ?? undefined,
          sensitivity: memory.sensitivity ?? undefined,
          explicitness: memory.explicitness ?? undefined,
          policyVersion: memory.policyVersion ?? undefined,
          provenance: memory.provenance ?? memory.sourceLabel ?? undefined,
          sourceObjectId: memory.sourceObjectId ?? undefined,
        })),
      );
    } catch (error) {
      setMemoryItems([]);
      setMemoryError(error instanceof Error ? error.message : 'Memory data is unavailable right now.');
    } finally {
      setMemoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'aimemory') void loadMemory();
  }, [activeTab, loadMemory]);

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewModeState] = useState<'grid' | 'list'>('grid');
  const [activeFilter, setActiveFilter] = useState<DriveFilter>('all');
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const handleMoveFile = useCallback(
    async (fileId: string, targetFolderId: string) => {
      if (fileId === targetFolderId) return;
      const fileToMove = files.find((f) => f.id === fileId);
      const targetFolder = files.find((f) => f.id === targetFolderId);
      try {
        await moveFiles([fileId], targetFolderId);
        showToast({
          text: `Moved "${fileToMove?.name || 'file'}" to "${targetFolder?.name || 'folder'}"`,
          type: 'success',
        });
        await fetchFiles(currentFolderId, activeFilter);
      } catch (err: unknown) {
        showToast({
          text: err instanceof Error ? err.message : 'Failed to move file',
          type: 'error',
        });
      }
    },
    [files, moveFiles, fetchFiles, currentFolderId, activeFilter],
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem('quant_drive_view_mode');
      if (saved === 'grid' || saved === 'list') {
        setViewModeState(saved);
      }
    } catch {
      // Ignore SSR / quota error
    }
  }, []);

  const setViewMode = useCallback((mode: 'grid' | 'list') => {
    setViewModeState(mode);
    try {
      localStorage.setItem('quant_drive_view_mode', mode);
    } catch {
      // Ignore
    }
  }, []);

  const [isDragOver, setIsDragOver] = useState(false);
  const [previewItem, setPreviewItem] = useState<DriveItem | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renameTarget, setRenameTarget] = useState<DriveItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [trashItems, setTrashItems] = useState<DriveItem[]>([]);
  const [receivedShares, setReceivedShares] = useState<ReceivedShare[]>([]);
  // QM-M39-001 — "Shared by me": owned items the user has shared.
  const [sentShares, setSentShares] = useState<SentShareItem[]>([]);
  // Sub-filter inside the Shared tab: shares received vs shares given.
  const [sharedMode, setSharedMode] = useState<'with-me' | 'by-me'>('with-me');
  const [loadingSpecial, setLoadingSpecial] = useState<boolean>(false);
  // QM-M39-002 — "Recent" view state. Items arrive in backend recency order
  // and are rendered untouched — no client re-sorting.
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [recentLoading, setRecentLoading] = useState<boolean>(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [recentHasMore, setRecentHasMore] = useState<boolean>(false);
  const [recentTotal, setRecentTotal] = useState<number>(0);
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [versionHistoryFile, setVersionHistoryFile] = useState<DriveItem | null>(null);
  // QM-M39-008: per-file activity/history view (M39 screen 25).
  const [activityFile, setActivityFile] = useState<DriveItem | null>(null);
  const [aiSummaryFile, setAiSummaryFile] = useState<DriveItem | null>(null);
  const [isDuplicateCleanerOpen, setIsDuplicateCleanerOpen] = useState(false);
  // QM-M39-011: Quanty file workspace (M39 screen 31).
  const [isQuantyWorkspaceOpen, setIsQuantyWorkspaceOpen] = useState(false);
  const [quantyWorkspaceFile, setQuantyWorkspaceFile] = useState<DriveItem | null>(null);
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);
  // QM-M39-005: read-only access viewer target (separate from the share-change modal)
  const [accessTarget, setAccessTarget] = useState<{ id: string; name: string } | null>(null);

  // QM-M39-007 — file details panel (M39 screen 24). Opened from the preview
  // lightbox so every tab funnels through the same single entry point.
  const [detailsTarget, setDetailsTarget] = useState<DriveItem | null>(null);

  const [textPreviewContent, setTextPreviewContent] = useState<string | null>(null);
  const [isLoadingTextPreview, setIsLoadingTextPreview] = useState(false);
  const [textPreviewError, setTextPreviewError] = useState<string | null>(null);
  const [copiedTextPreview, setCopiedTextPreview] = useState(false);

  useEffect(() => {
    // QM-M39-009: never fetch bytes for a quarantined file — preview is
    // blocked with an instruction, not attempted.
    if (
      !previewItem ||
      previewItem.scanStatus === 'quarantined' ||
      !isTextOrCodeFile(previewItem.mimeType, previewItem.name)
    ) {
      setTextPreviewContent(null);
      setIsLoadingTextPreview(false);
      setTextPreviewError(null);
      setCopiedTextPreview(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingTextPreview(true);
    setTextPreviewError(null);
    setTextPreviewContent(null);
    setCopiedTextPreview(false);

    const url = getDownloadUrl(previewItem.id);
    apiFetchRaw(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load file preview (${res.status})`);
        }
        const text = await res.text();
        const MAX_PREVIEW_BYTES = 1024 * 1024; // 1 MB preview ceiling
        if (text.length > MAX_PREVIEW_BYTES) {
          setTextPreviewContent(
            text.slice(0, MAX_PREVIEW_BYTES) +
              '\n\n/* ... [Preview truncated: file exceeds 1 MB limit] ... */',
          );
        } else {
          setTextPreviewContent(text);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setTextPreviewError(err instanceof Error ? err.message : 'Failed to load file preview');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingTextPreview(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [previewItem, getDownloadUrl]);

  const handleCopyTextPreview = useCallback(async () => {
    if (!textPreviewContent) return;
    try {
      await navigator.clipboard.writeText(textPreviewContent);
      setCopiedTextPreview(true);
      setTimeout(() => setCopiedTextPreview(false), 2000);
    } catch {
      showToast({ text: 'Failed to copy to clipboard', type: 'error' });
    }
  }, [textPreviewContent]);

  const handleThumbnailError = useCallback((fileId: string) => {
    setFailedThumbnails((prev) => {
      if (prev.has(fileId)) return prev;
      const next = new Set(prev);
      next.add(fileId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (activeFilter !== 'trash' && activeFilter !== 'shared') {
      fetchFiles(currentFolderId, activeFilter !== 'all' ? activeFilter : undefined);
    }
  }, [fetchFiles, currentFolderId, activeFilter]);

  // Debounced search: avoid firing an API request on every keystroke
  useEffect(() => {
    const q = searchQuery.trim();
    const t = setTimeout(() => {
      if (q) searchFiles(q);
      else if (activeFilter !== 'trash' && activeFilter !== 'shared') {
        fetchFiles(currentFolderId, activeFilter !== 'all' ? activeFilter : undefined);
      }
    }, 300);
    return () => clearTimeout(t);
    // Intentionally keyed on searchQuery alone: re-running on folder id or on the
    // fetcher identities would restart the debounce mid-keystroke.
  }, [searchQuery, currentFolderId, activeFilter]);

  const loadTrash = useCallback(async () => {
    setLoadingSpecial(true);
    try {
      const list = await fetchTrashFiles();
      setTrashItems((list ?? []) as unknown as DriveItem[]);
    } catch {
      showToast({ text: 'Failed to load trash', type: 'error', subject: 'drive-trash' });
    } finally {
      setLoadingSpecial(false);
    }
  }, [fetchTrashFiles]);

  const loadShares = useCallback(async () => {
    setLoadingSpecial(true);
    try {
      const list = await fetchReceivedShares();
      setReceivedShares(list ?? []);
    } catch {
      showToast({ text: 'Failed to load shared items', type: 'error', subject: 'drive-shares' });
    } finally {
      setLoadingSpecial(false);
    }
  }, [fetchReceivedShares]);

  // QM-M39-002 — load the "Recent" view (M39 screen 6). When `append` is true
  // the next cursor page is appended; otherwise the list is rebuilt from the
  // first page. Order is the backend's recency order, rendered as-is.
  // Pagination cursors live in refs so the loader identity stays stable and
  // the tab-activation effect below cannot loop on its own state updates.
  const recentCursorRef = useRef<string | null>(null);
  const recentHasMoreRef = useRef<boolean>(false);
  const loadRecent = useCallback(
    async (append = false) => {
      if (append && !recentHasMoreRef.current) return;
      setRecentLoading(true);
      setRecentError(null);
      try {
        const page = await fetchRecentFiles(append ? recentCursorRef.current : null);
        // QM-UIUX-079: keep the backend's document projection typed so recent
        // documents open in the editor instead of the file preview.
        const mapped: RecentItem[] = (page.files ?? []).map((f) => ({
          id: f.id,
          name: f.name,
          type: (f.type === 'document' ? 'document' : 'file') as RecentItem['type'],
          mimeType: f.mimeType,
          size: f.size,
          modifiedAt: f.modifiedAt,
          lastOpenedAt: f.lastOpenedAt ?? null,
          isStarred: f.isStarred,
          documentId: (f as { documentId?: string }).documentId,
        }));
        setRecentItems((prev) => (append ? [...prev, ...mapped] : mapped));
        recentCursorRef.current = page.nextCursor;
        recentHasMoreRef.current = page.hasMore;
        setRecentHasMore(page.hasMore);
        setRecentTotal(page.totalCount);
      } catch {
        setRecentItems([]);
        setRecentError('Recent files could not be loaded. Try again in a moment.');
      } finally {
        setRecentLoading(false);
      }
    },
    [fetchRecentFiles],
  );

  // QM-M39-002 — one funnel for opening a file preview: shows the preview and
  // records the explicit open so the Recent view stays honest. Best-effort.
  // QM-UIUX-079: document items (backend id `doc:<documentId>`) open in the
  // doc editor — they have no file bytes to preview or download. The real
  // Document row id rides on `documentId`; fall back to stripping the prefix.
  const openDocumentItem = useCallback(
    (driveId: string, documentId?: string): boolean => {
      if (!driveId.startsWith('doc:')) return false;
      router.push(`/drive/doc/${documentId || driveId.slice('doc:'.length)}`);
      return true;
    },
    [router],
  );

  const handleDownloadFile = useCallback(
    (id: string, name: string) => {
      // Documents open in the editor (which owns export) instead of hitting
      // the file-download endpoint that has no such object.
      if (openDocumentItem(id)) return;
      void downloadFile(id, name);
    },
    [downloadFile, openDocumentItem],
  );

  const handlePreviewItem = useCallback(
    (item: DriveItem | RecentItem | null) => {
      const driveItem = item as DriveItem | null;
      if (driveItem && driveItem.type === 'document' && driveItem.id) {
        openDocumentItem(driveItem.id, driveItem.documentId);
        return;
      }
      setPreviewItem(item as DriveItem | null);
      if (item && (item as DriveItem).type === 'file' && item.id) {
        void recordFileOpen(item.id);
      }
    },
    [recordFileOpen, openDocumentItem],
  );

  // QM-M39-002 — closing a preview may have changed recency (the open was just
  // recorded); refresh the Recent list when it is the active view.
  const handleClosePreview = useCallback(() => {
    setPreviewItem(null);
    if (activeTab === 'recent') {
      void loadRecent(false);
    }
  }, [activeTab, loadRecent]);

  useEffect(() => {
    if (activeTab === 'recent') {
      void loadRecent(false);
    }
  }, [activeTab, loadRecent]);
  // QM-M39-001 — load owned items the user has shared ("Shared by me").
  const loadSentShares = useCallback(async () => {
    setLoadingSpecial(true);
    try {
      const list = await fetchSentShares();
      setSentShares(list ?? []);
    } catch {
      showToast({ text: 'Failed to load shared-by-me items', type: 'error', subject: 'drive-shares-sent' });
    } finally {
      setLoadingSpecial(false);
    }
  }, [fetchSentShares]);

  useEffect(() => {
    if (activeFilter === 'trash') {
      loadTrash();
    }
  }, [activeFilter, loadTrash]);

  // The Shared tab renders from activeTab (not the activeFilter pills, which
  // never include 'shared') — so both share lists load when the tab opens.
  // This also fixes the latent bug where "Shared with me" never loaded.
  useEffect(() => {
    if (activeTab === 'shared') {
      loadShares();
      loadSentShares();
    }
  }, [activeTab, loadShares, loadSentShares]);

  const items = (files ?? []) as unknown as DriveItem[];

  const filteredItems = useMemo(() => {
    let result = items;
    // When searching, the search API already filtered server-side — applying
    // the header filter pills on top would hide valid results (e.g. a .pem
    // file while the "Documents" pill is active). Skip client filtering.
    const isSearching = searchQuery.trim().length > 0;
    if (!isSearching) {
      if (activeFilter === 'folders') {
        result = result.filter((i) => i.type === 'folder');
      } else if (activeFilter === 'documents') {
        result = result.filter((i) => {
          // QM-UIUX-079: projected document items always belong in Documents.
          if (i.type === 'document') return true;
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
    }
    return result;
  }, [items, activeFilter, searchQuery]);

  const folders = useMemo(() => filteredItems.filter((i) => i.type === 'folder'), [filteredItems]);
  const regularFiles = useMemo(
    () => filteredItems.filter((i) => i.type !== 'folder'),
    [filteredItems],
  );

  const { element: scrollContainer, ref: scrollContainerRef } = useScrollElement<HTMLDivElement>();

  const virtualizer = useVirtualizer({
    count: regularFiles.length,
    scrollElement: scrollContainer,
    estimateSize: 48,
    overscan: 8,
    getItemKey: (idx) => regularFiles[idx]?.id ?? idx,
    enabled: viewMode === 'list' && regularFiles.length > 40,
  });

  const handleUploadTrigger = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) {
      // The picker element is missing (should never happen) — say so instead
      // of silently doing nothing, which is what a dead Upload button looks like.
      showToast({
        text: 'Upload is temporarily unavailable. Please reload and try again.',
        type: 'error',
        subject: UPLOAD_TOAST,
      });
      return;
    }
    input.click();
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
              : `Upload failed — please try again (max ${formatBytes(Number(process.env.NEXT_PUBLIC_DRIVE_MAX_FILE_BYTES) || 25 * 1024 * 1024)} per file)`,
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
      title: `Move "${name}" to Trash?`,
      message: 'This item will be moved to Trash. You can restore it anytime from the Trash tab.',
      confirmLabel: 'Move to Trash',
      variant: 'destructive',
    });
    if (ok) {
      const subject = `drive-delete-${id}`;
      try {
        await deleteFiles([id]);
        showToast({ text: `Moved "${name}" to Trash`, type: 'info', subject });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch {
        showToast({ text: `Failed to move "${name}" to Trash`, type: 'error', subject });
      }
    }
  };

  const handleBatchDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    const label = `${count} item${count > 1 ? 's' : ''}`;
    const ok = await confirm({
      title: `Move ${label} to Trash?`,
      message:
        'These items will be moved to Trash. You can restore them anytime from the Trash tab.',
      confirmLabel: 'Move to Trash',
      variant: 'destructive',
    });
    if (ok) {
      try {
        await deleteFiles(Array.from(selectedIds));
        showToast({ text: `Moved ${label} to Trash`, type: 'info', subject: 'drive-delete-batch' });
        setSelectedIds(new Set());
      } catch {
        showToast({
          text: `Failed to move ${label} to Trash`,
          type: 'error',
          subject: 'drive-delete-batch',
        });
      }
    }
  };

  const handleRestoreItem = async (id: string, name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await restoreFile(id);
      showToast({ text: `Restored "${name}"`, type: 'success', subject: `drive-restore-${id}` });
      await loadTrash();
    } catch {
      showToast({
        text: `Failed to restore "${name}"`,
        type: 'error',
        subject: `drive-restore-${id}`,
      });
    }
  };

  const handlePurgeItem = async (id: string, name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ok = await confirm({
      title: `Delete "${name}" permanently?`,
      message: 'This cannot be undone. The item will be permanently removed from your Drive.',
      confirmLabel: 'Delete permanently',
      variant: 'destructive',
    });
    if (ok) {
      try {
        await purgeFile(id);
        showToast({
          text: `Permanently deleted "${name}"`,
          type: 'info',
          subject: `drive-purge-${id}`,
        });
        await loadTrash();
      } catch {
        showToast({
          text: `Failed to delete "${name}" permanently`,
          type: 'error',
          subject: `drive-purge-${id}`,
        });
      }
    }
  };

  const handleAcceptShare = async (shareId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await acceptShare(shareId);
      showToast({ text: 'Share accepted', type: 'success', subject: `drive-share-${shareId}` });
      await loadShares();
    } catch {
      showToast({
        text: 'Failed to accept share',
        type: 'error',
        subject: `drive-share-${shareId}`,
      });
    }
  };

  const handleDeclineShare = async (shareId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await declineShare(shareId);
      showToast({ text: 'Share declined', type: 'info', subject: `drive-share-${shareId}` });
      await loadShares();
    } catch {
      showToast({
        text: 'Failed to decline share',
        type: 'error',
        subject: `drive-share-${shareId}`,
      });
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

    // QM-UIUX-079: documents open in the editor instead of downloading.
    targets.forEach((item) => handleDownloadFile(item.id, item.name));

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
      <div className="workspace-page drive-workspace flex flex-col h-full bg-[var(--quant-background)]">
        {/*
         * Visually hidden but RENDERED. A `display: none` (Tailwind `hidden`)
         * file input ignores programmatic .click() in Chrome, which made the
         * Upload button completely dead — no picker, no toast, nothing.
         * This keeps the input in layout (1px, clipped, transparent) so the
         * picker reliably opens from a real user gesture.
         */}
        <input
          id="drive-file-input"
          name="driveFiles"
          ref={fileInputRef}
          type="file"
          multiple
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
            opacity: 0,
            pointerEvents: 'none',
          }}
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
            className={`min-w-0 shrink items-center gap-1.5 text-xs text-[var(--quant-muted-foreground)] ${
              currentFolderId || searchQuery.trim() ? 'flex' : 'hidden md:flex'
            }`}
            aria-label="Breadcrumb"
          >
            <button
              type="button"
              onClick={() => {
                if (searchQuery.trim()) setSearchQuery('');
                navigateToFolder(null, 'Home');
              }}
              className={`shrink-0 rounded transition-colors hover:text-[var(--app-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] ${
                !currentFolderId && !searchQuery.trim() ? 'font-semibold text-[var(--quant-foreground)]' : ''
              }`}
            >
              My Drive
            </button>
            {searchQuery.trim() ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-[var(--quant-text-muted)]">/</span>
                <span className="max-w-[200px] truncate font-medium text-[var(--app-accent)]">
                  Search: &ldquo;{searchQuery.trim()}&rdquo;
                </span>
              </span>
            ) : (
              breadcrumbs &&
              breadcrumbs.slice(1).map((b, i) => (
                <span key={b.id || i} className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-[var(--quant-text-muted)]">/</span>
                  <button
                    type="button"
                    onClick={() => navigateToBreadcrumb(i + 1)}
                    className="max-w-[120px] truncate rounded font-medium text-[var(--quant-foreground)] transition-colors hover:text-[var(--app-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                  >
                    {b.name}
                  </button>
                </span>
              ))
            )}
            <span className="mx-1 hidden h-4 w-px shrink-0 bg-[var(--quant-surface-elevated)] md:block" />
          </nav>

          {/* Filter pills — the only element allowed to overflow */}
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar">
            {(
              [
                { key: 'all', label: 'All Items' },
                { key: 'folders', label: 'Folders' },
                { key: 'documents', label: 'Documents' },
                { key: 'images', label: 'Images' },
                { key: 'trash', label: 'Trash' },
              ] as const
            ).map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => {
                  setActiveFilter(filter.key);
                  if (activeTab !== 'home' && activeTab !== 'files') handleTabChange('home');
                }}
                aria-pressed={activeFilter === filter.key && (activeTab === 'home' || activeTab === 'files')}
                className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] sm:min-h-0 ${
                  activeFilter === filter.key && (activeTab === 'home' || activeTab === 'files')
                    ? 'bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)] text-[var(--app-accent)] border border-[color-mix(in_srgb,var(--app-accent)_35%,transparent)] shadow-[0_0_14px_color-mix(in_srgb,var(--app-accent)_15%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.06)] font-semibold'
                    : 'border border-white/[0.08] bg-white/[0.03] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:bg-white/[0.06] hover:border-white/[0.14]'
                }`}
              >
                {filter.label}
              </button>
            ))}
            {/* Trailing spacer: padding-right collapses inside overflow-x-auto,
                so without this a mid-list pill ("Folders") renders cut off at
                the row's edge on narrow screens. */}
            <div aria-hidden="true" className="shrink-0 w-1" />
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
                  className={`grid size-8 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] [@media(pointer:coarse)]:size-11 ${
                    viewMode === key
                      ? 'bg-[var(--app-accent)] text-[#111111]'
                      : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
                  }`}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                const docId = 'doc_' + Math.random().toString(36).substring(2, 9);
                router.push(`/drive/doc/${docId}`);
              }}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[var(--quant-muted-foreground)] border border-white/[0.08] transition-all hover:text-[var(--app-accent)] hover:border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] hover:bg-white/[0.04] hover:shadow-[0_0_12px_color-mix(in_srgb,var(--app-accent)_10%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] md:px-3 [@media(pointer:coarse)]:size-11 [@media(pointer:coarse)]:md:h-8 [@media(pointer:coarse)]:md:w-auto"
              aria-label="New document"
            >
              <IconFile size={14} />
              <span className="hidden md:inline">New Doc</span>
            </button>

            <button
              type="button"
              onClick={() => setShowNewFolderModal(true)}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[var(--quant-muted-foreground)] border border-white/[0.08] transition-all hover:text-[var(--quant-foreground)] hover:border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] hover:bg-white/[0.04] hover:shadow-[0_0_12px_color-mix(in_srgb,var(--app-accent)_10%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] md:px-3 [@media(pointer:coarse)]:size-11 [@media(pointer:coarse)]:md:h-8 [@media(pointer:coarse)]:md:w-auto"
              aria-label="New folder"
            >
              <IconFolderPlus size={14} />
              <span className="hidden md:inline">New Folder</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setQuantyWorkspaceFile(null);
                setIsQuantyWorkspaceOpen(true);
              }}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[var(--quant-muted-foreground)] border border-white/[0.08] transition-all hover:text-[var(--quant-foreground)] hover:border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] hover:bg-white/[0.04] hover:shadow-[0_0_12px_color-mix(in_srgb,var(--app-accent)_10%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] md:px-3"
              aria-label="Open the Quanty file workspace"
            >
              <svg
                className="size-3.5 text-[var(--app-accent)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
                />
              </svg>
              <span className="hidden md:inline">Quanty</span>
            </button>

            <button
              type="button"
              onClick={() => setIsDuplicateCleanerOpen(true)}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[var(--quant-muted-foreground)] border border-white/[0.08] transition-all hover:text-[var(--quant-foreground)] hover:border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] hover:bg-white/[0.04] hover:shadow-[0_0_12px_color-mix(in_srgb,var(--app-accent)_10%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] md:px-3"
              aria-label="Find and clean duplicate files"
            >
              <svg
                className="size-3.5 text-[var(--app-accent)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
              <span className="hidden md:inline">Duplicates</span>
            </button>

            {/* Desktop only: on mobile this action belongs to the FAB alone. */}
            <button
              type="button"
              onClick={handleUploadTrigger}
              className="hidden h-8 items-center gap-1.5 rounded-lg bg-[var(--app-accent)] px-3 text-xs font-semibold text-[#111111] transition-colors hover:bg-[var(--app-accent-hover)] active:bg-[var(--quant-primary-pressed)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-surface)] md:inline-flex"
            >
              <IconUpload size={14} />
              <span>Upload</span>
            </button>
          </div>
        </div>

        {/* Mobile tab strip (QM-UIUX-019): the desktop header below is
            hidden on mobile, so without this strip 7 of 8 Drive surfaces
            were unreachable on phones. */}
        <DriveMobileTabStrip
          activeTab={activeTab}
          onTabChange={handleTabChange}
          sharedCount={receivedShares.length}
          starredCount={items.filter((i) => i.isStarred).length}
        />

        {/* Sovereign Context Sub-Navigation Tabs */}
        <DriveContextTabsHeader
          activeTab={activeTab}
          onTabChange={handleTabChange}
          sharedCount={receivedShares.length}
          starredCount={items.filter((i) => i.isStarred).length}
        />

        {/* Batch Selection Action Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2 sm:px-8 bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)] border-b border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)] text-xs">
            <span className="font-semibold text-white">
              {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadSelected}
                className="min-h-touch px-2.5 rounded-md bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)] font-medium flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
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
                className="min-h-touch px-2.5 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 font-medium flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
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
                className="min-h-touch px-2.5 rounded-md text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
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

        {/* Search Mode Indicator (Task D21) */}
        {searchQuery.trim() && (
          <div className="flex items-center justify-between px-4 py-2 sm:px-8 bg-[var(--quant-surface-elevated)] border-b border-[var(--quant-surface-elevated)] text-xs">
            <div className="flex items-center gap-2 text-[var(--quant-muted-foreground)]">
              <svg
                className="size-3.5 text-[var(--app-accent)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>
                Search results for{' '}
                <span className="font-semibold text-[var(--quant-foreground)]">
                  &ldquo;{searchQuery.trim()}&rdquo;
                </span>
              </span>
              <span className="text-[var(--quant-text-muted)]">
                ({filteredItems.length} item{filteredItems.length === 1 ? '' : 's'})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="inline-flex items-center gap-1 text-xs text-[var(--app-accent)] hover:text-[var(--app-accent-hover)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
            >
              <span>Clear search</span>
              <svg
                className="size-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Main Drive Files Content */}
        <div
          ref={scrollContainerRef}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`flex-1 overflow-y-auto px-4 py-6 sm:px-8 space-y-6 relative ${
            isDragOver ? 'bg-[color-mix(in_srgb,var(--app-accent)_5%,transparent)]' : ''
          }`}
        >
          {/* Drag Overlay Hint */}
          {isDragOver && (
            <div className="absolute inset-4 z-30 border-2 border-dashed border-[var(--app-accent)] rounded-2xl bg-[var(--quant-background)]/90 flex flex-col items-center justify-center pointer-events-none backdrop-blur-sm">
              <svg
                className="w-12 h-12 text-[var(--app-accent)] mb-3 animate-bounce"
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
              <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">Stored securely in QuantDrive</p>
            </div>
          )}

          {/*
            AI Memory lives in its own dedicated bottom-tab (AI Memory), not as
            a promo card on Home — removed per user feedback (2026-10-07) to
            stop stuffing it into every surface. Its home is the aimemory tab.
          */}

          {/* Contextual Sub-Views */}
          {activeTab === 'shared' && (
<div className="space-y-4">
              {/* QM-M39-001 — sub-filter inside the Shared tab: received vs given.
                  Badges carry real backend counts; no badge when the count is 0. */}
              <div
                role="tablist"
                aria-label="Shared direction"
                className="inline-flex items-center gap-1 rounded-xl border border-[#232938] bg-[var(--quant-surface)] p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={sharedMode === 'with-me'}
                  onClick={() => setSharedMode('with-me')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                    sharedMode === 'with-me'
                      ? 'bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/35'
                      : 'text-[#94A3B8] border border-transparent hover:text-[#F8FAFC]'
                  }`}
                >
                  Shared with me
                  {receivedShares.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#38BDF8]/20 text-[#38BDF8]">
                      {receivedShares.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={sharedMode === 'by-me'}
                  onClick={() => setSharedMode('by-me')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                    sharedMode === 'by-me'
                      ? 'bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/35'
                      : 'text-[#94A3B8] border border-transparent hover:text-[#F8FAFC]'
                  }`}
                >
                  Shared by me
                  {sentShares.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#38BDF8]/20 text-[#38BDF8]">
                      {sentShares.length}
                    </span>
                  )}
                </button>
              </div>

              {sharedMode === 'with-me' ? (
                <DriveSharedSubView
                  shares={receivedShares.map((s) => ({
                    id: s.id,
                    name: s.file?.name ?? s.folder?.name ?? 'Shared item',
                    type: s.folder ? 'folder' : 'file',
                    mimeType: s.file?.mimeType ?? '',
                    size: s.file?.size ?? 0,
                    sharedDate: s.createdAt,
                    permission:
                      s.permission === 'edit'
                        ? 'Editor'
                        : s.permission === 'admin'
                        ? 'Admin'
                        : 'Viewer',
                    owner: {
                      name: s.owner?.name || s.owner?.email || 'Collaborator',
                      email: s.owner?.email || '',
                    },
                    status: s.status as any,
                    // QM-M39-009: scan state for shared files.
                    scanStatus: s.file?.scanStatus ?? null,
                    scanReason: s.file?.scanReason ?? null,
                  }))}
                  loading={loadingSpecial}
                  onRefresh={loadShares}
                  onAcceptShare={handleAcceptShare}
                  onDeclineShare={handleDeclineShare}
                  onPreviewItem={(item) => handlePreviewItem(item as any)}
                  onDownloadFile={handleDownloadFile}
                />
              ) : (
                <DriveSharedByMeSubView
                  items={sentShares}
                  loading={loadingSpecial}
                  onRefresh={loadSentShares}
                  onManageAccess={(item) => setShareTarget({ id: item.id, name: item.name })}
                  onPreviewItem={(item) => setPreviewItem(item as any)}
                />
              )}
            </div>
          )}

          {activeTab === 'vault' && <DriveVaultSubView />}

          {activeTab === 'starred' && (
            <DriveStarredSubView
              items={items.filter((i) => i.isStarred)}
              loading={loading}
              onToggleStar={handleToggleStar}
              onPreviewItem={(item) => handlePreviewItem(item as any)}
              onDownloadFile={handleDownloadFile}
              onDeleteItem={(id, name, e) => handleDeleteItem(id, name, e)}
            />
          )}

          {activeTab === 'cleaner' && <DriveCleanerSubView />}

          {(activeTab === 'home' || activeTab === 'files') && activeFilter === 'trash' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--quant-border)]">
                <div>
                  <h3 className="text-sm font-bold text-[var(--quant-foreground)]">Trash</h3>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">
                    Items in trash can be restored or deleted permanently.
                  </p>
                </div>
                <Button variant="secondary" onClick={loadTrash} className="text-xs">
                  Refresh Trash
                </Button>
              </div>

              {loadingSpecial && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} variant="rect" width="100%" height="80px" />
                  ))}
                </div>
              )}

              {!loadingSpecial && trashItems.length === 0 && (
                <div className="text-center py-16 space-y-4">
                  <div className="flex justify-center text-[var(--quant-muted-foreground)]">
                    <svg
                      className="w-16 h-16 text-[var(--quant-muted-foreground)]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-extrabold text-[var(--quant-foreground)]">Trash is empty</h3>
                  <p className="text-xs text-[var(--quant-muted-foreground)] max-w-sm mx-auto">
                    Items moved to trash will appear here. You can restore them anytime or delete
                    them permanently.
                  </p>
                </div>
              )}

              {!loadingSpecial && trashItems.length > 0 && (
                <div className="space-y-2">
                  {trashItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:bg-[var(--quant-surface-hover)] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] shrink-0">
                          {getFileIcon(item.mimeType, item.type, 'w-4 h-4')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[var(--quant-foreground)] truncate">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-[var(--quant-muted-foreground)]">
                            {item.type === 'folder' ? 'Folder' : formatBytes(item.size)}
                            {item.deletedAt &&
                              ` · Deleted ${new Date(item.deletedAt).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleRestoreItem(item.id, item.name, e)}
                          className="px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_35%,transparent)] text-xs font-semibold text-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_20%,transparent)] shadow-[0_0_10px_color-mix(in_srgb,var(--app-accent)_10%,transparent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handlePurgeItem(item.id, item.name, e)}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                        >
                          Delete Permanently
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(activeTab === 'home' || activeTab === 'files') && activeFilter !== 'trash' && (
            <DriveHomeSubView
              files={regularFiles}
              folders={folders}
              loading={loading}
              viewMode={viewMode}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onPreviewItem={(item) => handlePreviewItem(item as any)}
              onDownloadFile={handleDownloadFile}
              onToggleStar={handleToggleStar}
              onDeleteItem={(id, name, e) => handleDeleteItem(id, name, e)}
              onOpenRename={handleOpenRename}
              onOpenVersionHistory={(item) => setVersionHistoryFile(item as any)}
              onOpenAiSummary={(item) => setAiSummaryFile(item as any)}
              onNavigateToFolder={(folderId, folderName) =>
                navigateToFolder(folderId, folderName)
              }
              trashItems={trashItems}
              onRestoreTrashItem={handleRestoreItem}
              onPurgeTrashItem={handlePurgeItem}
              onUpgradeClick={() =>
                showToast({
                  text: 'Sovereign Enterprise Plan: Upgrade options requested.',
                  type: 'info',
                })
              }
            />
          )}

          {/* QM-M39-002 — "Recent" view (M39 screen 6): server-side recency-ordered
              file list. Items render in backend order, newest first; the empty
              state is the honest "No recent files" — never fabricated. */}
          {activeTab === 'recent' && (
            <DriveRecentSubView
              items={recentItems}
              loading={recentLoading}
              error={recentError}
              totalCount={recentTotal}
              hasMore={recentHasMore}
              onLoadMore={() => void loadRecent(true)}
              onToggleStar={async (item, e) => {
                await handleToggleStar(item as any, e);
                void loadRecent(false);
              }}
              onPreviewItem={(item) => handlePreviewItem(item as any)}
              onDownloadFile={handleDownloadFile}
              onDeleteItem={async (id, name, e) => {
                await handleDeleteItem(id, name, e);
                // The trashed file must disappear from Recent immediately —
                // /drive/recent already excludes isDeleted rows server-side.
                void loadRecent(false);
              }}
            />
          )}

          {activeTab === 'feed' && (
            <DriveFeedSubView
              files={regularFiles.map((f) => ({
                id: f.id,
                name: f.name,
                mimeType: f.mimeType,
                size: f.size,
                modifiedAt: f.modifiedAt,
                isStarred: f.isStarred,
              }))}
              onPreviewItem={(item) =>
                handlePreviewItem({
                  id: item.id,
                  name: item.name,
                  type: 'file',
                  mimeType: item.mimeType,
                  size: item.size,
                  modifiedAt: new Date().toISOString(),
                  isStarred: item.isStarred,
                } as any)
              }
              onDownloadFile={handleDownloadFile}
              onShareItem={(item) => setShareTarget({ id: item.id, name: item.name })}
              onViewAccessItem={(item) => setAccessTarget({ id: item.id, name: item.name })}
            />
          )}

          {activeTab === 'aimemory' && (
            <DriveAiMemorySubView
              memories={memoryItems}
              onRecallInChat={(mem) =>
                showToast({
                  text: `Recalled context from ${mem.app}: "${mem.title}"`,
                  type: 'success',
                })
              }
              onForgetMemory={async (mem) => {
                const ok = await confirm({
                  title: `Forget "${mem.title}"?`,
                  message:
                    'This archives the memory projection so it no longer participates in normal recall. Source data remains owned by its original product.',
                  confirmLabel: 'Forget memory',
                  variant: 'destructive',
                });
                if (!ok) return;
                try {
                  const response = await fetch(`/api/drive/memory/${encodeURIComponent(mem.id)}`, {
                    method: 'DELETE',
                  });
                  if (!response.ok) throw new Error('Could not forget this memory.');
                  showToast({ text: 'Memory archived', type: 'success', subject: `memory-forget-${mem.id}` });
                  await loadMemory();
                } catch (error) {
                  showToast({
                    text: error instanceof Error ? error.message : 'Could not forget this memory.',
                    type: 'error',
                    subject: `memory-forget-${mem.id}`,
                  });
                }
              }}
            />
          )}
          {activeTab === 'aimemory' && memoryLoading && (
            <p className="mt-4 text-xs text-[#94A3B8]">Loading governed memory…</p>
          )}
          {activeTab === 'aimemory' && memoryError && (
            <p className="mt-4 text-xs text-[#FCA5A5]">{memoryError}</p>
          )}
        </div>

        {/* File Share Modal — real share API, no fake toasts */}
        {shareTarget && (
          <FileShareModal
            isOpen={!!shareTarget}
            onClose={() => setShareTarget(null)}
            fileId={shareTarget.id}
            fileName={shareTarget.name}
          />
        )}

        {/* QM-M39-005: read-only access viewer — current collaborators, roles,
            link scope/audience/expiry. Changes happen via Manage sharing. */}
        {accessTarget && (
          <FilePermissionsViewer
            isOpen={!!accessTarget}
            onClose={() => setAccessTarget(null)}
            fileId={accessTarget.id}
            fileName={accessTarget.name}
            onManageSharing={() => {
              const target = accessTarget;
              setAccessTarget(null);
              setShareTarget(target);
            }}
          />
        )}

        {/* File Preview Lightbox Modal */}
        <Modal
          isOpen={!!previewItem}
          onClose={handleClosePreview}
          title={previewItem?.name || 'File Preview'}
        >
          <div className="p-4 space-y-4 text-center">
            {/* QM-M39-007: details panel entry — one button for the full file
                identity (owner, location, sharing, scan state, versions). */}
            {previewItem && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setDetailsTarget(previewItem)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--quant-surface-elevated)] border border-[#232938] text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#38BDF8]/50 transition-colors"
                  title="Show file details: owner, location, sharing, security scan state, versions"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                  </svg>
                  Details
                </button>
              </div>
            )}
            {/* QM-M39-009: security scan state — details context. 'unknown'
                renders as "Not scanned", never as safe. */}
            {previewItem && (
              <div className="text-left rounded-xl bg-[var(--quant-surface)] px-4 py-3 shadow-[inset_0_0_0_1px_var(--quant-surface-elevated)]">
                <FileScanDetail status={previewItem.scanStatus} reason={previewItem.scanReason} />
              </div>
            )}
            {previewItem && previewItem.scanStatus === 'quarantined' ? (
              /* QM-M39-009: quarantine blocks preview honestly — an
                 instruction, not a generic error and not a broken viewer. */
              <div
                className="flex flex-col items-center justify-center rounded-xl bg-[#1A0E10] p-8 border border-[var(--quant-destructive)]/40"
                role="alert"
              >
                <span className="mb-3 text-[var(--quant-destructive)]">
                  <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                    />
                  </svg>
                </span>
                <h4 className="text-sm font-bold text-[var(--quant-foreground)]">This file is quarantined</h4>
                <p className="text-xs text-[var(--quant-muted-foreground)] mt-2 max-w-md">
                  Preview and download are disabled for this file. It was flagged by a security
                  scan as potentially harmful.
                  {previewItem.scanReason ? (
                    <span className="block mt-1 text-[#D1D5DB]">Reason: {previewItem.scanReason}</span>
                  ) : null}
                </p>
                <p className="text-xs text-[var(--quant-muted-foreground)] mt-2 max-w-md">
                  Contact your workspace administrator to request a security review — do not share
                  this file.
                </p>
              </div>
            ) : previewItem && previewItem.mimeType.startsWith('image/') ? (
              <div className="rounded-xl bg-[var(--quant-surface)] p-4 shadow-[inset_0_0_0_1px_var(--quant-surface-elevated)]">
                <img
                  src={getDownloadUrl(previewItem.id)}
                  alt={previewItem.name}
                  className="max-h-96 mx-auto rounded-lg object-contain"
                  loading="lazy"
                  decoding="async"
                />
                <h4 className="text-sm font-bold text-[var(--quant-foreground)] mt-3">{previewItem.name}</h4>
                <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                  {previewItem.mimeType} · {formatBytes(previewItem.size ?? 0)}
                </p>
              </div>
            ) : previewItem && previewItem.mimeType === 'application/pdf' ? (
              <div className="rounded-xl bg-[var(--quant-surface)] p-4 shadow-[inset_0_0_0_1px_var(--quant-surface-elevated)]">
                <iframe
                  src={getDownloadUrl(previewItem.id)}
                  className="w-full h-96 rounded-lg border border-[var(--quant-border)]"
                  title={previewItem.name}
                />
                <h4 className="text-sm font-bold text-[var(--quant-foreground)] mt-3">{previewItem.name}</h4>
                <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                  {previewItem.mimeType} · {formatBytes(previewItem.size ?? 0)}
                </p>
              </div>
            ) : previewItem && previewItem.mimeType.startsWith('audio/') ? (
              <div className="flex flex-col items-center justify-center rounded-xl bg-[var(--quant-surface)] p-8 shadow-[inset_0_0_0_1px_var(--quant-surface-elevated)]">
                <span className="mb-3 text-[var(--quant-muted-foreground)]">
                  {getFileIcon(previewItem.mimeType, previewItem.type, 'w-14 h-14')}
                </span>
                <h4 className="text-sm font-bold text-[var(--quant-foreground)]">{previewItem.name}</h4>
                <p className="text-xs text-[var(--quant-muted-foreground)] mt-1 mb-4">
                  {previewItem.mimeType} · {formatBytes(previewItem.size ?? 0)}
                </p>
                <audio controls src={getDownloadUrl(previewItem.id)} className="w-full max-w-md" />
              </div>
            ) : previewItem && previewItem.mimeType.startsWith('video/') ? (
              <div className="rounded-xl bg-[var(--quant-surface)] p-4 shadow-[inset_0_0_0_1px_var(--quant-surface-elevated)]">
                <video
                  controls
                  src={getDownloadUrl(previewItem.id)}
                  className="max-h-96 w-full rounded-lg mx-auto"
                />
                <h4 className="text-sm font-bold text-[var(--quant-foreground)] mt-3">{previewItem.name}</h4>
                <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                  {previewItem.mimeType} · {formatBytes(previewItem.size ?? 0)}
                </p>
              </div>
            ) : previewItem && isTextOrCodeFile(previewItem.mimeType, previewItem.name) ? (
              <div className="rounded-xl bg-[var(--quant-surface)] p-4 text-left shadow-[inset_0_0_0_1px_var(--quant-surface-elevated)]">
                <div className="flex items-center justify-between border-b border-[var(--quant-surface-elevated)] pb-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[var(--app-accent)] shrink-0">
                      <svg
                        className="w-5 h-5"
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
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-[var(--quant-foreground)] truncate">
                        {previewItem.name}
                      </h4>
                      <p className="text-[11px] text-[var(--quant-muted-foreground)]">
                        {previewItem.mimeType} · {formatBytes(previewItem.size ?? 0)}
                        {textPreviewContent !== null && (
                          <span className="text-[var(--app-accent)] ml-1.5 font-mono">
                            ({textPreviewContent.split('\n').length} lines)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyTextPreview}
                    disabled={!textPreviewContent || isLoadingTextPreview}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D2027] border border-[#323642] text-xs font-semibold text-[#E0E2EC] hover:bg-[#252A33] hover:text-white transition-colors disabled:opacity-50"
                  >
                    {copiedTextPreview ? (
                      <>
                        <svg
                          className="w-3.5 h-3.5 text-emerald-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <polyline
                            points="20 6 9 17 4 12"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-3.5 h-3.5 text-[var(--quant-muted-foreground)]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {isLoadingTextPreview ? (
                  <div className="py-12 text-center text-xs text-[var(--quant-muted-foreground)] space-y-3">
                    <div className="w-6 h-6 border-2 border-[var(--app-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
                    <p>Loading code preview…</p>
                  </div>
                ) : textPreviewError ? (
                  <div className="py-8 text-center text-xs text-rose-400 bg-rose-500/10 rounded-lg p-4 border border-rose-500/20">
                    <p className="font-semibold mb-1">Unable to preview file</p>
                    <p className="text-zinc-400">{textPreviewError}</p>
                  </div>
                ) : textPreviewContent !== null ? (
                  <div className="flex bg-[#0B0C0E] border border-[var(--quant-surface-elevated)] rounded-lg max-h-[30rem] overflow-auto font-mono text-xs shadow-inner">
                    <div className="select-none py-3 px-3 text-right text-[#4E525E] border-r border-[#22262E] bg-[#0E1014] font-mono text-xs leading-relaxed shrink-0">
                      {textPreviewContent.split('\n').map((_, idx) => (
                        <div key={idx}>{idx + 1}</div>
                      ))}
                    </div>
                    <pre className="p-3 text-[#E0E2EC] whitespace-pre overflow-x-auto min-w-0 flex-1 font-mono text-xs leading-relaxed">
                      <code>{textPreviewContent}</code>
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl bg-[var(--quant-surface)] p-8 shadow-[inset_0_0_0_1px_var(--quant-surface-elevated)]">
                <span className="mb-3 text-[var(--quant-muted-foreground)]">
                  {previewItem ? (
                    getFileIcon(previewItem.mimeType, previewItem.type, 'w-14 h-14')
                  ) : (
                    <IconFile size={56} />
                  )}
                </span>
                <h4 className="text-sm font-bold text-[var(--quant-foreground)]">{previewItem?.name}</h4>
                <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                  {previewItem?.mimeType} · {formatBytes(previewItem?.size ?? 0)}
                </p>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 flex-wrap">
              {previewItem && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setVersionHistoryFile(previewItem);
                    }}
                  >
                    Version History
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setActivityFile(previewItem);
                    }}
                  >
                    Activity
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setAiSummaryFile(previewItem);
                    }}
                  >
                    AI Insights
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQuantyWorkspaceFile(previewItem);
                      setIsQuantyWorkspaceOpen(true);
                    }}
                  >
                    Quanty workspace
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={handleClosePreview}>
                Close
              </Button>
              {/* QM-M39-009: no download offered for quarantined files — the
                  quarantine panel above carries the instruction instead. */}
              {previewItem && previewItem.scanStatus !== 'quarantined' && (
                <Button
                  variant="primary"
                  onClick={() => {
                    downloadFile(previewItem.id, previewItem.name);
                    handleClosePreview();
                  }}
                >
                  Download File
                </Button>
              )}
            </div>
          </div>
        </Modal>

        {/* QM-M39-007 — file details side panel (M39 screen 24). Rendered
            above the preview lightbox (z-110 > modal z-100). */}
        {detailsTarget && (
          <FileDetailsPanel
            item={{ id: detailsTarget.id, name: detailsTarget.name }}
            onClose={() => setDetailsTarget(null)}
            onOpenVersionHistory={(id, name) => {
              setDetailsTarget(null);
              setVersionHistoryFile({ id, name } as any);
            }}
            onNavigateToFolder={(folderId, folderName) => {
              setDetailsTarget(null);
              handleClosePreview();
              navigateToFolder(folderId, folderName);
            }}
          />
        )}

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
                className="block text-xs font-semibold text-[var(--quant-muted-foreground)] mb-1"
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
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-[var(--app-accent)] [@media(pointer:coarse)]:min-h-11"
                autoFocus
                /* `Modal` traps focus and picks the first focusable child unless a
                   descendant is marked. React's `autoFocus` renders no attribute
                   for it to find, so without this the caret lands on "Close
                   modal" — one Tab away from the only field in the dialog. */
                data-autofocus
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
                className="block text-xs font-semibold text-[var(--quant-muted-foreground)] mb-1"
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
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-[var(--app-accent)] [@media(pointer:coarse)]:min-h-11"
                autoFocus
                data-autofocus
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

        {/* Drive File Version History Modal */}
        <FileVersionHistoryModal
          isOpen={!!versionHistoryFile}
          fileId={versionHistoryFile?.id ?? ''}
          fileName={versionHistoryFile?.name ?? ''}
          onClose={() => setVersionHistoryFile(null)}
          onRestoreSuccess={() => fetchFiles(currentFolderId)}
        />

        {/* QM-M39-008: Drive File Activity/History Modal (M39 screen 25) */}
        <FileActivityModal
          isOpen={!!activityFile}
          fileId={activityFile?.id ?? ''}
          fileName={activityFile?.name ?? ''}
          onClose={() => setActivityFile(null)}
        />

        {/* QuantDrive File AI Insights Drawer */}
        <FileAISummaryDrawer
          isOpen={!!aiSummaryFile}
          file={aiSummaryFile}
          onClose={() => setAiSummaryFile(null)}
        />

        {/* QuantDrive AI Duplicate Cleaner Modal */}
        <AIDuplicateCleanerModal
          isOpen={isDuplicateCleanerOpen}
          onClose={() => setIsDuplicateCleanerOpen(false)}
          onCleanupComplete={() => fetchFiles(currentFolderId)}
        />

        {/* QM-M39-011: Quanty file workspace (M39 screen 31) */}
        <QuantyFileWorkspace
          isOpen={isQuantyWorkspaceOpen}
          onClose={() => setIsQuantyWorkspaceOpen(false)}
          file={
            quantyWorkspaceFile
              ? {
                  id: quantyWorkspaceFile.id,
                  name: quantyWorkspaceFile.name,
                  mimeType: quantyWorkspaceFile.mimeType,
                }
              : null
          }
          onOpenDuplicateCleaner={() => {
            setIsQuantyWorkspaceOpen(false);
            setIsDuplicateCleanerOpen(true);
          }}
          onFilesChanged={() => fetchFiles(currentFolderId)}
        />

        {dialog}
      </div>
    </AppShell>
  );
}


export default function DrivePage() {
  return (
    <Suspense fallback={<div className="workspace-page drive-workspace flex flex-col h-full bg-[var(--quant-background)]" />}>
      <DrivePageContent />
    </Suspense>
  );
}
