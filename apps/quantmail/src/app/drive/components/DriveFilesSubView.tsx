'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes } from '../../../lib/format-bytes';
import { useStorageQuota } from '../../../hooks/useStorageQuota';
import { useIsMobile } from '../../../hooks/useIsMobile';
import {
  useVirtualizedRows,
  useMeasuredColumns,
} from '../../../hooks/useVirtualizedRows';
import {
  DEFAULT_DRIVE_FILES_VIEW_STATE,
  loadDriveFilesViewState,
  saveDriveFilesViewState,
  type DriveSortDir,
  type DriveSortKey,
  type DriveTypeFilter,
} from './driveFilesViewState';
import {
  FolderIcon,
  HardDriveIcon,
  StarFilledIcon,
  StarIcon,
} from './DriveIcons';

export interface DriveItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType: string;
  size: number;
  modifiedAt: string;
  thumbnailUrl?: string;
  isStarred?: boolean;
  sharedWith?: { email: string; permission: string }[];
  deletedAt?: string;
}

export interface DriveFilesSubViewProps {
  /** File items loaded so far (pages appended by the parent in paginated mode). */
  files: DriveItem[];
  folders: DriveItem[];
  /** First page is loading — renders honest skeleton rows, never fake content. */
  loading?: boolean;
  /** A subsequent page is loading (append in progress). */
  loadingMore?: boolean;
  /** Load error for the current query; rendered with a retry affordance. */
  error?: string | null;
  onRetry?: () => void;
  /**
   * Server pagination state (QM-M39-014). When `totalCount` is provided the
   * view runs in paginated mode: type cards filter server-side via
   * `onFilterChange`, counts shown are exact (`!hasMore`) or hidden.
   */
  hasMore?: boolean;
  /** Server-reported file count for the current filter (excludes folders). */
  totalCount?: number | null;
  /** Parent appends the next cursor page. Desktop: explicit button. Mobile: auto. */
  onLoadMore?: () => void;
  viewMode?: 'grid' | 'list';
  /** Scopes sort/filter state restoration (sessionStorage) per folder. */
  folderId?: string | null;
  /** Controlled sort/filter (parent owns state). Uncontrolled: restored + persisted. */
  sortBy?: DriveSortKey;
  sortDir?: DriveSortDir;
  /** When provided, the sort control renders and changes refetch server-side. */
  onSortChange?: (sortBy: DriveSortKey, sortDir: DriveSortDir) => void;
  filter?: DriveTypeFilter;
  /**
   * When provided, type-card filters are server-side: the parent refetches
   * with the `filter` query param. Without it, filtering applies to the
   * loaded items (exact only when everything is loaded).
   */
  onFilterChange?: (filter: DriveTypeFilter) => void;
  /** Max height of the scrollable file region (virtualization viewport). */
  listMaxHeight?: string;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, e?: React.MouseEvent) => void;
  onPreviewItem?: (item: DriveItem) => void;
  onDownloadFile?: (id: string, name: string) => void;
  onToggleStar?: (item: DriveItem, e?: React.MouseEvent) => void;
  onDeleteItem?: (id: string, name: string, e?: React.MouseEvent) => void;
  onOpenRename?: (item: DriveItem, e?: React.MouseEvent) => void;
  onOpenVersionHistory?: (item: DriveItem) => void;
  onOpenAiSummary?: (item: DriveItem) => void;
  onNavigateToFolder?: (folderId: string | null, folderName?: string) => void;
}

// Fixed row geometry — virtualization requires every row to be exactly this
// tall. Keep these in sync with the row components below.
const LIST_ROW_HEIGHT = 64;
const LIST_ROW_COMPACT_HEIGHT = 52;
const LIST_ROW_GAP = 6;
const GRID_TILE_HEIGHT = 184;
const GRID_TILE_COMPACT_HEIGHT = 148;
const GRID_TILE_GAP = 14;
const GRID_MIN_TILE_WIDTH = 220;
const GRID_MIN_TILE_WIDTH_COMPACT = 160;
const SKELETON_ROWS = 6;

const SORT_OPTIONS: { value: DriveSortKey; label: string }[] = [
  { value: 'updatedAt', label: 'Date modified' },
  { value: 'name', label: 'Name' },
  { value: 'size', label: 'Size' },
];

function formatModified(modifiedAt: string): string {
  return modifiedAt ? new Date(modifiedAt).toLocaleDateString() : 'Recent';
}

export function DriveFilesSubView({
  files,
  folders,
  loading = false,
  loadingMore = false,
  error = null,
  onRetry,
  hasMore = false,
  totalCount = null,
  onLoadMore,
  viewMode = 'grid',
  folderId = null,
  sortBy: controlledSortBy,
  sortDir: controlledSortDir,
  onSortChange,
  filter: controlledFilter,
  onFilterChange,
  listMaxHeight = 'min(68vh, 860px)',
  selectedIds = new Set(),
  onToggleSelect,
  onPreviewItem,
  onDownloadFile,
  onToggleStar,
  onDeleteItem,
  onOpenRename,
  onOpenVersionHistory,
  onOpenAiSummary,
  onNavigateToFolder,
}: DriveFilesSubViewProps) {
  const isMobile = useIsMobile();
  const compact = isMobile;
  const serverFiltering = typeof onFilterChange === 'function';
  const isFilterControlled = controlledFilter !== undefined;
  const isSortControlled = controlledSortBy !== undefined && controlledSortDir !== undefined;
  const paginated = typeof totalCount === 'number';

  // --- Sort/filter state: controlled by parent, or restored + persisted ----
  const [internalFilter, setInternalFilter] = useState<DriveTypeFilter>(
    () =>
      controlledFilter ??
      loadDriveFilesViewState(folderId).typeFilter ??
      DEFAULT_DRIVE_FILES_VIEW_STATE.typeFilter,
  );
  const [internalSortBy, setInternalSortBy] = useState<DriveSortKey>(
    () =>
      controlledSortBy ??
      loadDriveFilesViewState(folderId).sortBy ??
      DEFAULT_DRIVE_FILES_VIEW_STATE.sortBy,
  );
  const [internalSortDir, setInternalSortDir] = useState<DriveSortDir>(
    () =>
      controlledSortDir ??
      loadDriveFilesViewState(folderId).sortDir ??
      DEFAULT_DRIVE_FILES_VIEW_STATE.sortDir,
  );

  const effFilter = isFilterControlled ? (controlledFilter as DriveTypeFilter) : internalFilter;
  const effSortBy = isSortControlled ? (controlledSortBy as DriveSortKey) : internalSortBy;
  const effSortDir = isSortControlled ? (controlledSortDir as DriveSortDir) : internalSortDir;

  // Re-restore when navigating between folders (uncontrolled mode only).
  // A folder with no stored state resets to the defaults so one folder's
  // filter never leaks into another.
  useEffect(() => {
    if (isFilterControlled && isSortControlled) return;
    const restored = loadDriveFilesViewState(folderId);
    if (!isFilterControlled) {
      setInternalFilter(restored.typeFilter ?? DEFAULT_DRIVE_FILES_VIEW_STATE.typeFilter);
    }
    if (!isSortControlled) {
      setInternalSortBy(restored.sortBy ?? DEFAULT_DRIVE_FILES_VIEW_STATE.sortBy);
      setInternalSortDir(restored.sortDir ?? DEFAULT_DRIVE_FILES_VIEW_STATE.sortDir);
    }
  }, [folderId, isFilterControlled, isSortControlled]);

  // Persist on every change (uncontrolled state only).
  useEffect(() => {
    if (isFilterControlled && isSortControlled) return;
    saveDriveFilesViewState(folderId, {
      sortBy: effSortBy,
      sortDir: effSortDir,
      typeFilter: effFilter,
    });
  }, [folderId, effSortBy, effSortDir, effFilter, isFilterControlled, isSortControlled]);

  const onFilterChangeRef = useRef(onFilterChange);
  onFilterChangeRef.current = onFilterChange;
  const onSortChangeRef = useRef(onSortChange);
  onSortChangeRef.current = onSortChange;
  const initialStateRef = useRef({
    filter: internalFilter,
    sortBy: internalSortBy,
    sortDir: internalSortDir,
  });

  // On mount, report restored (non-default) state so the parent refetches
  // server-side with it. Without this, a restored filter would silently show
  // the wrong (default) query results.
  useEffect(() => {
    const initial = initialStateRef.current;
    if (!isFilterControlled && initial.filter !== DEFAULT_DRIVE_FILES_VIEW_STATE.typeFilter) {
      onFilterChangeRef.current?.(initial.filter);
    }
    if (
      !isSortControlled &&
      (initial.sortBy !== DEFAULT_DRIVE_FILES_VIEW_STATE.sortBy ||
        initial.sortDir !== DEFAULT_DRIVE_FILES_VIEW_STATE.sortDir)
    ) {
      onSortChangeRef.current?.(initial.sortBy, initial.sortDir);
    }
    // Mount-only: reports restored state to the parent once. Callbacks are
    // read through refs so this never re-fires.
  }, []);

  const handleFilterChange = (next: DriveTypeFilter) => {
    if (!isFilterControlled) setInternalFilter(next);
    onFilterChange?.(next);
  };

  const handleSortChange = (nextBy: DriveSortKey, nextDir: DriveSortDir) => {
    if (!isSortControlled) {
      setInternalSortBy(nextBy);
      setInternalSortDir(nextDir);
    }
    onSortChange?.(nextBy, nextDir);
  };

  // Real quota from `GET /api/drive/quota` via the shared hook — the same
  // source the sidebar chip reads, so the two can never show conflicting
  // numbers again. While the quota is unknown the meter says "Calculating…"
  // rather than inventing a number.
  const { quota, known: quotaKnown, usedPct } = useStorageQuota();

  // Type categorization over the LOADED files. In paginated mode these counts
  // are only exact once every page is loaded (!hasMore); otherwise the cards
  // render without counts rather than showing partial numbers as totals.
  const typeStats = useMemo(() => {
    let pdfCount = 0;
    let pdfSize = 0;
    let docCount = 0;
    let docSize = 0;
    let codeCount = 0;
    let codeSize = 0;
    let zipCount = 0;
    let zipSize = 0;

    files.forEach((f) => {
      const m = (f.mimeType || '').toLowerCase();
      const n = (f.name || '').toLowerCase();

      if (m.includes('pdf') || n.endsWith('.pdf')) {
        pdfCount++;
        pdfSize += f.size || 0;
      } else if (
        m.includes('doc') ||
        m.includes('word') ||
        m.includes('sheet') ||
        m.includes('excel') ||
        m.includes('presentation') ||
        m.startsWith('text/') ||
        /\.(docx?|xlsx?|pptx?|txt|md|csv)$/i.test(n)
      ) {
        docCount++;
        docSize += f.size || 0;
      } else if (
        m.includes('javascript') ||
        m.includes('typescript') ||
        m.includes('json') ||
        m.includes('html') ||
        m.includes('css') ||
        m.includes('python') ||
        m.includes('rust') ||
        /\.(ts|tsx|js|jsx|py|rs|go|json|yaml|yml|sql|sh)$/i.test(n)
      ) {
        codeCount++;
        codeSize += f.size || 0;
      } else if (
        m.includes('zip') ||
        m.includes('tar') ||
        m.includes('archive') ||
        m.includes('gz') ||
        /\.(zip|tar|gz|rar|7z)$/i.test(n)
      ) {
        zipCount++;
        zipSize += f.size || 0;
      }
    });

    return {
      pdf: { count: pdfCount, size: pdfSize },
      doc: { count: docCount, size: docSize },
      code: { count: codeCount, size: codeSize },
      zip: { count: zipCount, size: zipSize },
    };
  }, [files]);

  const statsExact = !paginated || !hasMore;

  // Server mode: the parent already filtered via the `filter` query param.
  // Legacy mode (no onFilterChange): filter the loaded items client-side —
  // exact only when the full collection is loaded.
  const displayedFiles = useMemo(() => {
    if (serverFiltering || effFilter === 'all') return files;
    return files.filter((f) => {
      const m = (f.mimeType || '').toLowerCase();
      const n = (f.name || '').toLowerCase();
      if (effFilter === 'pdf') return m.includes('pdf') || n.endsWith('.pdf');
      if (effFilter === 'doc') {
        return (
          m.includes('doc') ||
          m.includes('word') ||
          m.includes('sheet') ||
          m.includes('excel') ||
          m.startsWith('text/') ||
          /\.(docx?|xlsx?|pptx?|txt|md|csv)$/i.test(n)
        );
      }
      if (effFilter === 'code') {
        return (
          m.includes('javascript') ||
          m.includes('typescript') ||
          m.includes('json') ||
          /\.(ts|tsx|js|jsx|py|rs|go|json|yaml|yml|sql|sh)$/i.test(n)
        );
      }
      if (effFilter === 'zip') {
        return (
          m.includes('zip') ||
          m.includes('tar') ||
          m.includes('archive') ||
          /\.(zip|tar|gz|rar|7z)$/i.test(n)
        );
      }
      return true;
    });
  }, [files, effFilter, serverFiltering]);

  // --- Virtualization -------------------------------------------------------
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const listRowHeight = compact ? LIST_ROW_COMPACT_HEIGHT : LIST_ROW_HEIGHT;
  const tileHeight = compact ? GRID_TILE_COMPACT_HEIGHT : GRID_TILE_HEIGHT;

  const listVirt = useVirtualizedRows({
    rowCount: displayedFiles.length,
    rowHeight: listRowHeight,
    rowGap: LIST_ROW_GAP,
    virtualizeAfterRows: 60,
    scrollRef,
  });

  const { columns: gridColumns } = useMeasuredColumns({
    scrollRef,
    minColumnWidth: compact ? GRID_MIN_TILE_WIDTH_COMPACT : GRID_MIN_TILE_WIDTH,
    columnGap: GRID_TILE_GAP,
    fallbackColumns: 4,
  });
  const gridRowCount = Math.ceil(displayedFiles.length / gridColumns);
  const gridVirt = useVirtualizedRows({
    rowCount: gridRowCount,
    rowHeight: tileHeight,
    rowGap: GRID_TILE_GAP,
    virtualizeAfterRows: 10,
    scrollRef,
  });

  // --- Mobile progressive loading: auto-fetch next page near the bottom ----
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [ioAvailable, setIoAvailable] = useState(false);
  useEffect(() => {
    setIoAvailable(typeof IntersectionObserver !== 'undefined');
  }, []);
  const showLoadMore = !loading && !error && hasMore && typeof onLoadMore === 'function';
  const autoLoadMore = showLoadMore && isMobile && ioAvailable && !loadingMore;

  useEffect(() => {
    if (!autoLoadMore) return;
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore?.();
      },
      { root, rootMargin: '400px' },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [autoLoadMore, onLoadMore, displayedFiles.length]);

  const renderFileRow = (file: DriveItem, rowStyle?: React.CSSProperties) => {
    const isSelected = selectedIds.has(file.id);
    if (compact) {
      return (
        <div
          key={file.id}
          style={rowStyle}
          onClick={() => onPreviewItem?.(file)}
          className={`group flex items-center gap-2.5 px-3 rounded-xl border transition-all cursor-pointer ${
            isSelected
              ? 'bg-[#38BDF8]/15 border-[#38BDF8]/50'
              : 'bg-[#12151E] border-[#232938] active:bg-[#161A26]'
          }`}
        >
          <div className="size-7 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/25 flex items-center justify-center text-[#38BDF8] shrink-0">
            <HardDriveIcon className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#F8FAFC] truncate">{file.name}</p>
            <p className="text-[10px] text-[#64748B] truncate">
              {formatBytes(file.size)} · {formatModified(file.modifiedAt)}
            </p>
          </div>
          <button
            type="button"
            aria-label={file.isStarred ? 'Unstar file' : 'Star file'}
            onClick={(e) => onToggleStar?.(file, e)}
            className="size-7 rounded grid place-items-center text-[#64748B] shrink-0"
          >
            {file.isStarred ? (
              <StarFilledIcon className="size-3.5 text-[#F59E0B]" />
            ) : (
              <StarIcon className="size-3.5" />
            )}
          </button>
        </div>
      );
    }
    return (
      <div
        key={file.id}
        style={rowStyle}
        onClick={() => onPreviewItem?.(file)}
        className={`group flex items-center justify-between px-3 rounded-xl border transition-all cursor-pointer ${
          isSelected
            ? 'bg-[#38BDF8]/15 border-[#38BDF8]/50 shadow-[0_0_12px_rgba(56,189,248,0.15)]'
            : 'bg-[#12151E] border-[#232938] hover:border-[#38BDF8]/40 hover:bg-[#161A26]'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="size-8 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/25 flex items-center justify-center text-[#38BDF8] shrink-0">
            <HardDriveIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-[#F8FAFC] truncate group-hover:text-[#38BDF8] transition-colors">
                {file.name}
              </p>
              <span className="inline-flex items-center px-1.5 py-px rounded text-[var(--q-type-xs)] font-mono font-semibold bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30">
                FastCDC Deduped
              </span>
            </div>
            <p className="text-[11px] text-[#94A3B8]">
              {formatBytes(file.size)} · Modified {formatModified(file.modifiedAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-label={file.isStarred ? 'Unstar file' : 'Star file'}
            onClick={(e) => onToggleStar?.(file, e)}
            className="size-7 rounded grid place-items-center text-[#64748B] hover:text-[#F59E0B] transition-colors"
          >
            {file.isStarred ? (
              <StarFilledIcon className="size-3.5 text-[#F59E0B]" />
            ) : (
              <StarIcon className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDownloadFile?.(file.id, file.name);
            }}
            className="px-2.5 py-1 rounded-lg bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#334155] transition-colors text-xs font-medium"
          >
            Download
          </button>
        </div>
      </div>
    );
  };

  const renderFileTile = (file: DriveItem) => {
    const isSelected = selectedIds.has(file.id);
    if (compact) {
      return (
        <div
          key={file.id}
          onClick={() => onPreviewItem?.(file)}
          style={{ height: tileHeight }}
          className={`group relative flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer ${
            isSelected
              ? 'bg-[#38BDF8]/15 border-[#38BDF8]/50'
              : 'bg-[#12151E] border-[#232938] active:bg-[#161A26]'
          }`}
        >
          <div className="flex items-start justify-between gap-1.5 mb-1.5">
            <div className="size-8 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/25 flex items-center justify-center text-[#38BDF8] shrink-0">
              <HardDriveIcon className="size-4" />
            </div>
            <button
              type="button"
              aria-label={file.isStarred ? 'Unstar file' : 'Star file'}
              onClick={(e) => onToggleStar?.(file, e)}
              className="size-6 rounded grid place-items-center text-[#64748B] shrink-0"
            >
              {file.isStarred ? (
                <StarFilledIcon className="size-3 text-[#F59E0B]" />
              ) : (
                <StarIcon className="size-3" />
              )}
            </button>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#F8FAFC] truncate">{file.name}</p>
            <p className="text-[10px] text-[#64748B] mt-0.5 truncate">
              {formatBytes(file.size)} · {formatModified(file.modifiedAt)}
            </p>
          </div>
        </div>
      );
    }
    return (
      <div
        key={file.id}
        onClick={() => onPreviewItem?.(file)}
        style={{ height: tileHeight }}
        className={`group relative flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-150 cursor-pointer ${
          isSelected
            ? 'bg-[#38BDF8]/15 border-[#38BDF8]/50 shadow-[0_0_14px_rgba(56,189,248,0.18)]'
            : 'bg-[#12151E] border-[#232938] hover:border-[#38BDF8]/40 hover:bg-[#161A26] shadow-[0_2px_12px_rgba(0,0,0,0.25)]'
        }`}
      >
        <div>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="size-9 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/25 flex items-center justify-center text-[#38BDF8] shrink-0">
              <HardDriveIcon className="size-4" />
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[var(--q-type-xs)] font-mono font-semibold bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30">
                FastCDC Deduped
              </span>
              <button
                type="button"
                aria-label={file.isStarred ? 'Unstar file' : 'Star file'}
                onClick={(e) => onToggleStar?.(file, e)}
                className="size-7 rounded grid place-items-center text-[#64748B] hover:text-[#F59E0B] transition-colors focus-visible:outline-none"
              >
                {file.isStarred ? (
                  <StarFilledIcon className="size-3.5 text-[#F59E0B]" />
                ) : (
                  <StarIcon className="size-3.5" />
                )}
              </button>
            </div>
          </div>

          <p className="text-xs font-semibold text-[#F8FAFC] truncate group-hover:text-[#38BDF8] transition-colors">
            {file.name}
          </p>
          <p className="text-[11px] text-[#94A3B8] mt-0.5">
            {formatBytes(file.size)} · {formatModified(file.modifiedAt)}
          </p>
        </div>

        <div className="mt-3 pt-2 border-t border-[#232938] flex items-center justify-between text-[11px]">
          <span className="text-[#64748B] font-mono text-[10px]">CAS: 64KB</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDownloadFile?.(file.id, file.name);
              }}
              className="px-2 py-0.5 rounded bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#334155] transition-colors text-[10px]"
            >
              Download
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteItem?.(file.id, file.name, e);
              }}
              className="px-1.5 py-0.5 rounded text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition-colors text-[10px]"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderTypeCard = (
    filterKey: DriveTypeFilter,
    title: string,
    shortLabel: string,
    colorLabel: string,
    classes: {
      ring: string;
      activeBg: string;
      activeBorder: string;
      hoverBorder: string;
      hoverBg: string;
      iconBg: string;
      iconBorder: string;
      iconText: string;
      pillBg: string;
      pillText: string;
      pillBorder: string;
    },
    stat: { count: number; size: number },
  ) => {
    const active = effFilter === filterKey;
    return (
      <button
        key={filterKey}
        type="button"
        onClick={() => handleFilterChange(active ? 'all' : filterKey)}
        aria-pressed={active}
        className={`text-left rounded-xl p-3.5 sm:p-4 border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 ${classes.ring} ${
          active
            ? `${classes.activeBg} ${classes.activeBorder} shadow-[0_0_16px_rgba(0,0,0,0.2)]`
            : `bg-[#12151E] border-[#232938] ${classes.hoverBorder} ${classes.hoverBg}`
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span
            className={`size-8 rounded-lg ${classes.iconBg} ${classes.iconBorder} border flex items-center justify-center ${classes.iconText} font-bold text-xs`}
          >
            {shortLabel}
          </span>
          <span
            className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${classes.pillBg} ${classes.pillText} border ${classes.pillBorder}`}
          >
            {colorLabel}
          </span>
        </div>
        <div className="text-xs font-semibold text-[#F8FAFC]">{title}</div>
        {statsExact && (
          <div className="text-[11px] text-[#94A3B8] mt-0.5">
            {stat.count} files · {formatBytes(stat.size)}
          </div>
        )}
      </button>
    );
  };

  const TYPE_CARD_CLASSES = {
    pdf: {
      ring: 'focus-visible:ring-[#EF4444]',
      activeBg: 'bg-[#EF4444]/15',
      activeBorder: 'border-[#EF4444]/60',
      hoverBorder: 'hover:border-[#EF4444]/40',
      hoverBg: 'hover:bg-[#EF4444]/5',
      iconBg: 'bg-[#EF4444]/15',
      iconBorder: 'border-[#EF4444]/30',
      iconText: 'text-[#EF4444]',
      pillBg: 'bg-[#EF4444]/10',
      pillText: 'text-[#EF4444]',
      pillBorder: 'border-[#EF4444]/25',
    },
    doc: {
      ring: 'focus-visible:ring-[#3B82F6]',
      activeBg: 'bg-[#3B82F6]/15',
      activeBorder: 'border-[#3B82F6]/60',
      hoverBorder: 'hover:border-[#3B82F6]/40',
      hoverBg: 'hover:bg-[#3B82F6]/5',
      iconBg: 'bg-[#3B82F6]/15',
      iconBorder: 'border-[#3B82F6]/30',
      iconText: 'text-[#3B82F6]',
      pillBg: 'bg-[#3B82F6]/10',
      pillText: 'text-[#3B82F6]',
      pillBorder: 'border-[#3B82F6]/25',
    },
    code: {
      ring: 'focus-visible:ring-[#10B981]',
      activeBg: 'bg-[#10B981]/15',
      activeBorder: 'border-[#10B981]/60',
      hoverBorder: 'hover:border-[#10B981]/40',
      hoverBg: 'hover:bg-[#10B981]/5',
      iconBg: 'bg-[#10B981]/15',
      iconBorder: 'border-[#10B981]/30',
      iconText: 'text-[#10B981]',
      pillBg: 'bg-[#10B981]/10',
      pillText: 'text-[#10B981]',
      pillBorder: 'border-[#10B981]/25',
    },
    zip: {
      ring: 'focus-visible:ring-[#F59E0B]',
      activeBg: 'bg-[#F59E0B]/15',
      activeBorder: 'border-[#F59E0B]/60',
      hoverBorder: 'hover:border-[#F59E0B]/40',
      hoverBg: 'hover:bg-[#F59E0B]/5',
      iconBg: 'bg-[#F59E0B]/15',
      iconBorder: 'border-[#F59E0B]/30',
      iconText: 'text-[#F59E0B]',
      pillBg: 'bg-[#F59E0B]/10',
      pillText: 'text-[#F59E0B]',
      pillBorder: 'border-[#F59E0B]/25',
    },
  } as const;

  const filesCountLabel = paginated
    ? `Showing ${displayedFiles.length} of ${totalCount} files`
    : `Files (${displayedFiles.length})`;

  return (
    <div
      id="drive-panel-files"
      role="tabpanel"
      aria-labelledby="drive-tab-files"
      className="space-y-6"
    >
      {/* 1. Storage Quota Meter — real numbers from GET /api/drive/quota */}
      <div className="rounded-2xl border border-[#232938] bg-[#12151E] p-4 sm:p-5 shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0">
              <HardDriveIcon className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#F8FAFC]">Storage Quota Meter</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30">
                  Enterprise Sovereign Cloud
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                FastCDC Content-Defined Chunking · Zero-Egress Storage
              </p>
            </div>
          </div>
          <div className="text-right sm:text-right">
            <div className="text-sm font-extrabold text-[#F8FAFC] tracking-tight">
              {quotaKnown && quota ? (
                <>
                  {formatBytes(quota.used)}{' '}
                  <span className="text-[#64748B] font-normal">/ {formatBytes(quota.total)}</span>
                </>
              ) : (
                'Calculating…'
              )}
            </div>
            <p className="text-[11px] text-[#38BDF8] font-medium">
              {quotaKnown && quota
                ? `${usedPct}% used · ${formatBytes(quota.total - quota.used)} available`
                : 'Reading storage usage…'}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div
          role="progressbar"
          aria-valuenow={quotaKnown ? usedPct : undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Storage quota usage"
          aria-valuetext={
            quotaKnown && quota
              ? `${formatBytes(quota.used)} of ${formatBytes(quota.total)} used`
              : 'Calculating'
          }
          className="w-full h-2 rounded-full bg-[#1E293B] overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#38BDF8] to-[#0284C7] shadow-[0_0_12px_rgba(56,189,248,0.5)] transition-all duration-500"
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      {/* 2. Type filter cards — server-side filters when onFilterChange is set */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {renderTypeCard('pdf', 'PDF Documents', 'PDF', 'RED', TYPE_CARD_CLASSES.pdf, typeStats.pdf)}
        {renderTypeCard('doc', 'Documents & Text', 'DOC', 'BLUE', TYPE_CARD_CLASSES.doc, typeStats.doc)}
        {renderTypeCard('code', 'Code & Scripts', 'CODE', 'GREEN', TYPE_CARD_CLASSES.code, typeStats.code)}
        {renderTypeCard('zip', 'Archives & Data', 'ZIP', 'GOLD', TYPE_CARD_CLASSES.zip, typeStats.zip)}
      </div>

      {effFilter !== 'all' && (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#12151E] border border-[#232938] text-xs">
          <span className="text-[#94A3B8]">
            Filtering by <strong className="text-[#38BDF8] uppercase">{effFilter}</strong>
            {paginated ? (
              <>
                {' '}
                — showing {displayedFiles.length} of {totalCount} files
              </>
            ) : (
              <> ({displayedFiles.length} match{displayedFiles.length === 1 ? '' : 'es'})</>
            )}
          </span>
          <button
            type="button"
            onClick={() => handleFilterChange('all')}
            className="text-xs text-[#38BDF8] hover:underline font-medium"
          >
            Clear Filter
          </button>
        </div>
      )}

      {/* 3. Folders Section */}
      {folders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
              Folders ({folders.length})
            </h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {folders.map((folder) => {
              const isSelected = selectedIds.has(folder.id);
              return (
                <div
                  key={folder.id}
                  onClick={() => onNavigateToFolder?.(folder.id, folder.name)}
                  className={`group relative flex items-center gap-2.5 p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#38BDF8]/15 border-[#38BDF8]/50 shadow-[0_0_12px_rgba(56,189,248,0.15)]'
                      : 'bg-[#12151E] border-[#232938] hover:border-[#38BDF8]/40 hover:bg-[#161A26]'
                  }`}
                >
                  <div className="size-8 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B] shrink-0">
                    <FolderIcon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#F8FAFC] truncate group-hover:text-[#38BDF8] transition-colors">
                      {folder.name}
                    </p>
                    <p className="text-[10px] text-[#64748B]">Folder</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Files Section — virtualized list/grid + cursor pagination */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
            {filesCountLabel}
          </h4>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[#64748B] hidden sm:inline">
              All objects backed by FastCDC 64KB CAS
            </span>
            {typeof onSortChange === 'function' && (
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="drive-files-sort"
                  className="text-[11px] text-[#64748B] font-medium"
                >
                  Sort by
                </label>
                <select
                  id="drive-files-sort"
                  value={effSortBy}
                  onChange={(e) => handleSortChange(e.target.value as DriveSortKey, effSortDir)}
                  className="text-[11px] font-medium rounded-lg bg-[#1E293B] border border-[#232938] text-[#F8FAFC] px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    handleSortChange(effSortBy, effSortDir === 'asc' ? 'desc' : 'asc')
                  }
                  aria-label={effSortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}
                  title={effSortDir === 'asc' ? 'Ascending — switch to descending' : 'Descending — switch to ascending'}
                  className="size-7 rounded-lg bg-[#1E293B] border border-[#232938] text-[#94A3B8] hover:text-[#F8FAFC] grid place-items-center text-sm leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                >
                  <span aria-hidden="true">{effSortDir === 'asc' ? '↑' : '↓'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="overflow-y-auto rounded-2xl"
          style={{ maxHeight: listMaxHeight }}
          aria-busy={loading || undefined}
        >
          {loading ? (
            <div role="status" aria-label="Loading files" className="space-y-1.5 py-1">
              <span className="sr-only">Loading files…</span>
              {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="animate-pulse rounded-xl bg-[#12151E] border border-[#232938]"
                  style={{ height: viewMode === 'grid' ? tileHeight : listRowHeight }}
                />
              ))}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center space-y-3"
            >
              <p className="text-sm font-semibold text-[#F8FAFC]">Couldn’t load files</p>
              <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">{error}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-4 py-1.5 rounded-lg bg-[#1E293B] text-[#F8FAFC] hover:bg-[#334155] transition-colors text-xs font-medium"
                >
                  Retry
                </button>
              )}
            </div>
          ) : displayedFiles.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border border-dashed border-[#232938] bg-[#12151E]/40 p-8 space-y-3">
              <div className="flex justify-center text-[#64748B]">
                <HardDriveIcon className="size-12" />
              </div>
              <h5 className="text-base font-bold text-[#F8FAFC]">No files in this view</h5>
              <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
                Upload documents, images, or archives to store them in your sovereign QuantDrive.
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            gridVirt.virtualized ? (
              <div style={{ height: gridVirt.totalHeight, position: 'relative' }}>
                <div
                  className="absolute top-0 left-0 right-0"
                  style={{
                    transform: `translateY(${gridVirt.startRow * (tileHeight + GRID_TILE_GAP)}px)`,
                  }}
                >
                  {Array.from(
                    { length: gridVirt.endRow - gridVirt.startRow },
                    (_, ri) => {
                      const rowIndex = gridVirt.startRow + ri;
                      const rowFiles = displayedFiles.slice(
                        rowIndex * gridColumns,
                        rowIndex * gridColumns + gridColumns,
                      );
                      const isLast = rowIndex === gridRowCount - 1;
                      return (
                        <div
                          key={rowIndex}
                          className="grid"
                          style={{
                            gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                            gap: GRID_TILE_GAP,
                            height: tileHeight,
                            marginBottom: isLast ? 0 : GRID_TILE_GAP,
                          }}
                        >
                          {rowFiles.map((file) => renderFileTile(file))}
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            ) : (
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                  gap: GRID_TILE_GAP,
                }}
              >
                {displayedFiles.map((file) => renderFileTile(file))}
              </div>
            )
          ) : listVirt.virtualized ? (
            <div style={{ height: listVirt.totalHeight, position: 'relative' }}>
              <div
                className="absolute top-0 left-0 right-0"
                style={{
                  transform: `translateY(${listVirt.startRow * (listRowHeight + LIST_ROW_GAP)}px)`,
                }}
              >
                {displayedFiles
                  .slice(listVirt.startRow, listVirt.endRow)
                  .map((file, i, arr) => (
                    <div
                      key={file.id}
                      style={{
                        height: listRowHeight,
                        marginBottom: i === arr.length - 1 ? 0 : LIST_ROW_GAP,
                      }}
                    >
                      {renderFileRow(file, { height: '100%' })}
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {displayedFiles.map((file) =>
                renderFileRow(file, { height: listRowHeight }),
              )}
            </div>
          )}

          {/* Pagination footer — honest states only */}
          {loadingMore && (
            <div
              role="status"
              className="flex items-center justify-center gap-2 py-4 text-xs text-[#94A3B8]"
            >
              <span
                aria-hidden="true"
                className="size-4 rounded-full border-2 border-[#38BDF8]/30 border-t-[#38BDF8] animate-spin"
              />
              Loading more files…
            </div>
          )}
          {showLoadMore && !loadingMore && autoLoadMore && (
            <div ref={sentinelRef} aria-hidden="true" className="h-px" />
          )}
          {showLoadMore && !loadingMore && !autoLoadMore && (
            <div className="flex flex-col items-center gap-1.5 py-4">
              <button
                type="button"
                onClick={() => onLoadMore?.()}
                className="px-5 py-2 rounded-xl bg-[#1E293B] border border-[#232938] text-[#F8FAFC] hover:bg-[#334155] hover:border-[#38BDF8]/40 transition-colors text-xs font-semibold"
              >
                Load more files
              </button>
              {paginated && (
                <span className="text-[11px] text-[#64748B]">
                  {displayedFiles.length} of {totalCount} files loaded
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
