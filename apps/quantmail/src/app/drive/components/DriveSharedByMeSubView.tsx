'use client';

// ============================================================================
// QuantDrive — "Shared by me" sub-view (QM-M39-001, M39 screen 5)
//
// The mirror of DriveSharedSubView: instead of shares the user RECEIVED, this
// lists files/folders the user OWNS and has shared. One record per owned item
// (GET /api/drive/shares/sent), each with the real recipient list, real
// permission per recipient, and the real public-link state. Every count and
// row comes from the backend — never fabricated.
// ============================================================================

import React, { useState } from 'react';
import { formatBytes } from '../../../lib/format-bytes';
import { SharedUsersIcon, FolderIcon, CopyIcon } from './DriveIcons';
import type { SentShareItem } from '../../../hooks/useDrive';

export interface DriveSharedByMeSubViewProps {
  items?: SentShareItem[];
  loading?: boolean;
  onRefresh?: () => void;
  onManageAccess?: (item: SentShareItem) => void;
  onPreviewItem?: (item: any) => void;
}

function getInitials(name: string, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function displayPermission(permission: string): 'Viewer' | 'Editor' | 'Admin' {
  return permission === 'edit' ? 'Editor' : permission === 'admin' ? 'Admin' : 'Viewer';
}

function permissionChipClass(permission: string): string {
  const display = displayPermission(permission);
  return display === 'Editor'
    ? 'bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/35'
    : display === 'Admin'
      ? 'bg-purple-500/15 text-purple-400 border-purple-500/35'
      : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35';
}

function statusChipClass(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'accepted') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35';
  if (s === 'declined') return 'bg-red-500/15 text-red-400 border-red-500/35';
  return 'bg-amber-500/15 text-amber-400 border-amber-500/35';
}

function statusLabel(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'accepted') return 'Accepted';
  if (s === 'declined') return 'Declined';
  return 'Pending';
}

export function DriveSharedByMeSubView({
  items = [],
  loading = false,
  onRefresh,
  onManageAccess,
  onPreviewItem,
}: DriveSharedByMeSubViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpanded = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const showSkeleton = loading && items.length === 0;

  return (
    <div
      id="drive-panel-shared-by-me"
      role="tabpanel"
      aria-labelledby="drive-tab-shared-by-me"
      className="space-y-6"
    >
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-[#232938] bg-[var(--quant-surface)] shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3.5">
          <div className="size-11 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0">
            <SharedUsersIcon className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#F8FAFC]">Shared by Me</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30">
                {items.length} Shared
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Files and folders you own and have shared with others
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-[#232938] bg-[var(--quant-surface-elevated)] text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#38BDF8]/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
          >
            Refresh Shares
          </button>
        )}
      </div>

      {/* Shared Items List */}
      {showSkeleton ? (
        <div className="space-y-3" aria-label="Loading shared items">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="p-4 rounded-xl border border-[#232938] bg-[var(--quant-surface)] animate-pulse"
            >
              <div className="h-3.5 w-48 rounded bg-[#1E2433]" />
              <div className="mt-2 h-3 w-32 rounded bg-[#1A1E2A]" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#232938] bg-[var(--quant-surface)] px-6 py-12 text-center">
          <div className="size-10 rounded-xl bg-[var(--quant-background)] border border-[#232938] flex items-center justify-center text-[#64748B]">
            <SharedUsersIcon className="size-5" />
          </div>
          <p className="text-sm font-semibold text-[#F8FAFC]">You haven&apos;t shared anything yet</p>
          <p className="text-xs text-[#94A3B8]">
            When you share a file or folder with someone, it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isExpanded = expandedId === item.id;
            const formattedDate = item.updatedAt
              ? new Date(item.updatedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Recent';
            const linkExpiry = item.linkShare?.expiresAt
              ? new Date(item.linkShare.expiresAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : null;
            const isLinkExpired =
              !!item.linkShare?.expiresAt && new Date(item.linkShare.expiresAt).getTime() < Date.now();

            return (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-[#232938] bg-[var(--quant-surface)] hover:border-[#38BDF8]/40 hover:bg-[var(--quant-surface-elevated)] transition-all shadow-[0_2px_12px_rgba(0,0,0,0.25)]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                  {/* Item Info */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="size-10 rounded-xl bg-[var(--quant-background)] border border-[#232938] flex items-center justify-center text-[#38BDF8] shrink-0">
                      {item.type === 'folder' ? (
                        <FolderIcon className="size-5 text-[var(--quant-primary)]" />
                      ) : (
                        <SharedUsersIcon className="size-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold text-[#F8FAFC] truncate max-w-sm">
                          {item.name}
                        </p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-white/[0.06] text-[#94A3B8] border border-[#232938]">
                          {item.type}
                        </span>
                        {item.linkShare && !isLinkExpired && (
                          <span
                            title={`Public link is on${linkExpiry ? ` — expires ${linkExpiry}` : ''}${item.linkShare.requiresPassword ? ' — password protected' : ''}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-sky-500/15 text-sky-400 border border-sky-500/35"
                          >
                            <CopyIcon className="size-3" />
                            Link on
                          </span>
                        )}
                        {item.linkShare && isLinkExpired && (
                          <span
                            title={`Public link expired ${linkExpiry ?? ''}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/35"
                          >
                            <CopyIcon className="size-3" />
                            Link expired
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-[#94A3B8] mt-1">
                        Shared with{' '}
                        <button
                          type="button"
                          onClick={() => toggleExpanded(item.id)}
                          aria-expanded={isExpanded}
                          className="text-[#38BDF8] font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] rounded"
                        >
                          {item.sharedCount} {item.sharedCount === 1 ? 'person' : 'people'}
                        </button>{' '}
                        · {item.type === 'file' ? formatBytes(item.size) : 'folder'} · Updated {formattedDate}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(item.id)}
                      aria-expanded={isExpanded}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--quant-surface-elevated)] border border-[#232938] text-xs font-medium text-[#F8FAFC] hover:border-[#38BDF8]/40 hover:bg-[#1E2433] transition-colors focus-visible:outline-none"
                    >
                      {isExpanded ? 'Hide people' : 'See people'}
                    </button>
                    {item.type === 'file' && onPreviewItem && (
                      <button
                        type="button"
                        onClick={() => onPreviewItem(item)}
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--quant-surface-elevated)] border border-[#232938] text-xs font-medium text-[#F8FAFC] hover:border-[#38BDF8]/40 hover:bg-[#1E2433] transition-colors focus-visible:outline-none"
                      >
                        Preview
                      </button>
                    )}
                    {item.type === 'file' && onManageAccess && (
                      <button
                        type="button"
                        onClick={() => onManageAccess(item)}
                        className="px-3 py-1.5 rounded-lg bg-[#38BDF8]/15 border border-[#38BDF8]/35 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                      >
                        View access
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable recipient list — the real current access */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-[#232938] space-y-2">
                    {item.sharedWith.map((person, idx) => {
                      const initials = getInitials(person.name, person.email);
                      const sharedOn = person.sharedAt
                        ? new Date(person.sharedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Recent';
                      return (
                        <div
                          key={`${item.id}-${person.email}-${idx}`}
                          className="flex items-center justify-between gap-3 py-1.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="size-8 rounded-full bg-gradient-to-tr from-[#0284C7] to-[#38BDF8] p-[1.5px] shrink-0">
                              <div className="size-full rounded-full bg-[var(--quant-surface)] flex items-center justify-center text-[10px] font-bold text-[#38BDF8] tracking-wider">
                                {initials}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[#F8FAFC] truncate">
                                {person.name || person.email}
                              </p>
                              {person.email && person.name !== person.email && (
                                <p className="text-[10px] text-[#64748B] truncate">{person.email}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${permissionChipClass(person.permission)}`}
                            >
                              {displayPermission(person.permission)}
                            </span>
                            <span
                              title={`Shared ${sharedOn}`}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${statusChipClass(person.status)}`}
                            >
                              {statusLabel(person.status)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {item.linkShare && (
                      <p className="text-[11px] text-[#94A3B8] pt-1">
                        Public link:{' '}
                        {isLinkExpired ? (
                          <span className="text-red-400 font-medium">expired{linkExpiry ? ` on ${linkExpiry}` : ''}</span>
                        ) : (
                          <span className="text-sky-400 font-medium">
                            on{linkExpiry ? ` — expires ${linkExpiry}` : ' — never expires'}
                            {item.linkShare.requiresPassword ? ' — password protected' : ''}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
