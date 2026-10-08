'use client';

import React from 'react';
import { formatBytes } from '../../../lib/format-bytes';
import { ClockIcon, StarFilledIcon, StarIcon, HardDriveIcon } from './DriveIcons';

export interface RecentItem {
  id: string;
  name: string;
  type: 'file';
  mimeType: string;
  size: number;
  modifiedAt: string;
  // ISO timestamp of the last explicit open (preview/download/open action).
  // Null when never opened — recency then reflects the last modification.
  lastOpenedAt?: string | null;
  isStarred?: boolean;
}

export interface DriveRecentSubViewProps {
  items: RecentItem[];
  loading?: boolean;
  error?: string | null;
  totalCount?: number;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onToggleStar?: (item: RecentItem, e?: React.MouseEvent) => void;
  onPreviewItem?: (item: RecentItem) => void;
  onDownloadFile?: (id: string, name: string) => void;
  onDeleteItem?: (id: string, name: string, e?: React.MouseEvent) => void;
}

// Relative-time label for the recency column. Returns null for unparseable
// input so the UI falls back to an absolute date instead of inventing one.
function formatRelativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'Just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  const years = Math.floor(months / 12);
  return `${years} yr${years === 1 ? '' : 's'} ago`;
}

function formatAbsoluteDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : '';
}

export function DriveRecentSubView({
  items,
  loading = false,
  error = null,
  totalCount,
  hasMore = false,
  onLoadMore,
  onToggleStar,
  onPreviewItem,
  onDownloadFile,
  onDeleteItem,
}: DriveRecentSubViewProps) {
  const shownTotal = typeof totalCount === 'number' ? totalCount : items.length;

  return (
    <div
      id="drive-panel-recent"
      role="tabpanel"
      aria-labelledby="drive-tab-recent"
      className="space-y-6"
    >
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-[#232938] bg-[var(--quant-surface)] shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3.5">
          <div className="size-11 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0">
            <ClockIcon className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#F8FAFC]">Recent</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30">
                {shownTotal} {shownTotal === 1 ? 'file' : 'files'}
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Files you opened or modified, newest first
            </p>
          </div>
        </div>
      </div>

      {/* Loading skeletons — shown while the backend query is in flight so the
          empty state never flashes before real data arrives. */}
      {loading && items.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-xl border border-[#232938] bg-[var(--quant-surface)] space-y-3 animate-pulse"
            >
              <div className="h-9 w-9 rounded-lg bg-[var(--quant-surface-elevated)]" />
              <div className="h-3 w-3/4 rounded bg-[var(--quant-surface-elevated)]" />
              <div className="h-2.5 w-1/2 rounded bg-[var(--quant-surface-elevated)]" />
            </div>
          ))}
        </div>
      )}

      {/* Error state — honest failure, never a fabricated list. */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#232938] bg-[var(--quant-surface)] px-6 py-12 text-center">
          <p className="text-sm font-semibold text-[#F8FAFC]">Couldn&apos;t load recent files</p>
          <p className="text-xs text-[#94A3B8]">{error}</p>
        </div>
      )}

      {/* Honest empty state — shown only after the backend confirmed there is
          nothing to show. Never fabricates entries. */}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#232938] bg-[var(--quant-surface)] px-6 py-12 text-center">
          <div className="size-10 rounded-xl bg-[var(--quant-background)] border border-[#232938] flex items-center justify-center text-[#64748B]">
            <ClockIcon className="size-5" />
          </div>
          <p className="text-sm font-semibold text-[#F8FAFC]">No recent files</p>
          <p className="text-xs text-[#94A3B8]">
            Files you open, download, or modify will appear here, newest first.
          </p>
        </div>
      )}

      {/* Recency-ordered file grid — order comes from the backend query, the
          client renders it untouched. */}
      {items.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {items.map((item) => {
              const openedLabel = formatRelativeTime(item.lastOpenedAt);
              const modifiedLabel = formatRelativeTime(item.modifiedAt);
              const recencyText = openedLabel
                ? `Opened ${openedLabel}`
                : modifiedLabel
                  ? `Modified ${modifiedLabel}`
                  : formatAbsoluteDate(item.modifiedAt)
                    ? `Modified ${formatAbsoluteDate(item.modifiedAt)}`
                    : '';
              return (
                <div
                  key={item.id}
                  onClick={() => onPreviewItem?.(item)}
                  className="group relative flex flex-col justify-between p-4 rounded-xl border border-[#232938] bg-[var(--quant-surface)] hover:border-[#38BDF8]/40 hover:bg-[var(--quant-surface-elevated)] transition-all cursor-pointer shadow-[0_2px_14px_rgba(0,0,0,0.3)] space-y-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="size-9 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/25 flex items-center justify-center text-[#38BDF8] shrink-0">
                        <HardDriveIcon className="size-4" />
                      </div>

                      <button
                        type="button"
                        aria-label={item.isStarred ? `Unstar ${item.name}` : `Star ${item.name}`}
                        onClick={(e) => onToggleStar?.(item, e)}
                        className={`size-7 rounded grid place-items-center transition-transform hover:scale-110 focus-visible:outline-none ${
                          item.isStarred ? 'text-[var(--quant-warning)]' : 'text-[#64748B] hover:text-[var(--quant-warning)]'
                        }`}
                      >
                        {item.isStarred ? (
                          <StarFilledIcon className="size-4" />
                        ) : (
                          <StarIcon className="size-4" />
                        )}
                      </button>
                    </div>

                    <p className="text-xs font-bold text-[#F8FAFC] truncate group-hover:text-[#38BDF8] transition-colors">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">
                      {formatBytes(item.size)}
                      {recencyText ? ` · ${recencyText}` : ''}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#232938] flex items-center justify-between text-[11px]">
                    <span className="text-[#64748B] font-mono text-[10px]">Recent</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownloadFile?.(item.id, item.name);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[var(--quant-surface-elevated)] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#334155] transition-colors text-xs font-medium"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteItem?.(item.id, item.name, e);
                        }}
                        className="px-2 py-1 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors text-xs font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={onLoadMore}
                className="px-4 py-2 rounded-xl border border-[#232938] bg-[var(--quant-surface)] text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#38BDF8]/40 transition-colors"
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
