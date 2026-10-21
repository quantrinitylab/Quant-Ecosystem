'use client';

import React from 'react';
import { formatBytes } from '../../../lib/format-bytes';
import { isDocumentDriveId } from '../../../lib/drive-ids';
import { FileScanBadge } from './FileScanBadge';
import { SharedUsersIcon, HardDriveIcon } from './DriveIcons';

export interface SharedCollaborator {
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface SharedItemRecord {
  id: string;
  // QM-SCREEN-010 P0: the share record id (for accept/decline) is distinct
  // from the shared file/folder id (for preview/download). page.tsx sets
  // both from the ReceivedShare (`shareId: s.id`, `fileId: s.file?.id ??
  // s.folder?.id`); fall back to `id` when a caller builds the record the
  // old way with the share id only.
  shareId?: string;
  fileId?: string | null;
  name: string;
  type: 'file' | 'folder';
  mimeType: string;
  size: number;
  sharedDate: string;
  permission: 'Viewer' | 'Editor' | 'Admin';
  owner: SharedCollaborator;
  status?: 'pending' | 'accepted' | 'declined';
  // QM-M39-009: security scan state (never rendered as safe).
  scanStatus?: string | null;
  scanReason?: string | null;
}

export interface DriveSharedSubViewProps {
  shares?: SharedItemRecord[];
  loading?: boolean;
  // Honest load failure text from the caller (e.g. GET /api/drive/shares/received
  // rejected). Rendered as a banner instead of the empty state.
  error?: string | null;
  onRefresh?: () => void;
  onAcceptShare?: (shareId: string) => void;
  onDeclineShare?: (shareId: string) => void;
  onPreviewItem?: (item: any) => void;
  onDownloadFile?: (id: string, name: string) => void;
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

export function DriveSharedSubView({
  shares = [],
  loading = false,
  error = null,
  onRefresh,
  onAcceptShare,
  onDeclineShare,
  onPreviewItem,
  onDownloadFile,
}: DriveSharedSubViewProps) {
  const activeShares = shares;

  return (
    <div
      id="drive-panel-shared"
      role="tabpanel"
      aria-labelledby="drive-tab-shared"
      className="space-y-6"
    >
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3.5">
          <div className="size-11 rounded-xl bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)] flex items-center justify-center text-[var(--app-accent)] shrink-0">
            <SharedUsersIcon className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#F8FAFC]">Shared with Me</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)] text-[var(--app-accent)] border border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)]">
                {activeShares.length} Active
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Files others share with you appear here
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            Refresh Shares
          </button>
        )}
      </div>

      {/* Loading skeletons — shown while the backend query is in flight so the
          "No shared files yet" empty state never flashes before real data
          arrives. */}
      {loading && activeShares.length === 0 && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading shared files">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="p-4 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] animate-pulse"
            >
              <div className="flex items-center gap-3.5">
                <div className="size-10 rounded-full bg-[var(--quant-surface-elevated)] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 rounded bg-[var(--quant-surface-elevated)]" />
                  <div className="h-2.5 w-1/3 rounded bg-[var(--quant-surface-elevated)]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state — honest failure, never a fabricated list. */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--quant-border)] bg-[var(--quant-surface)] px-6 py-12 text-center">
          <p className="text-sm font-semibold text-[#F8FAFC]">Couldn&apos;t load shared files</p>
          <p className="text-xs text-[#94A3B8]">{error}</p>
        </div>
      )}

      {/* Honest empty state — shown only after loading finished without an
          error, never while the query is still in flight. */}
      {!loading && !error && activeShares.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--quant-border)] bg-[var(--quant-surface)] px-6 py-12 text-center">
          <div className="size-10 rounded-xl bg-[var(--quant-background)] border border-[var(--quant-border)] flex items-center justify-center text-[#64748B]">
            <SharedUsersIcon className="size-5" />
          </div>
          <p className="text-sm font-semibold text-[#F8FAFC]">No shared files yet</p>
          <p className="text-xs text-[#94A3B8]">
            When someone shares a file with you, it will appear here.
          </p>
        </div>
      )}

      {/* Shared Items List */}
      {activeShares.length > 0 && (
        <div className="space-y-3">
          {activeShares.map((item) => {
          const initials = getInitials(item.owner.name, item.owner.email);
          const formattedDate = item.sharedDate
            ? new Date(item.sharedDate).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'Recent';

          const isPending = item.status === 'pending';

          return (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] hover:bg-[var(--quant-surface-elevated)] transition-all gap-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]"
            >
              {/* File Info & Collaborator Avatar */}
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                {/* Collaborator Avatar */}
                <div
                  title={`Shared by ${item.owner.name} (${item.owner.email})`}
                  className="size-10 rounded-full bg-gradient-to-tr from-[var(--app-accent)] to-[var(--app-accent-hover)] p-[1.5px] shrink-0"
                >
                  <div className="size-full rounded-full bg-[var(--quant-surface)] flex items-center justify-center text-[11px] font-bold text-[var(--app-accent)] tracking-wider">
                    {initials}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-[#F8FAFC] truncate max-w-sm">
                      {item.name}
                    </p>

                    {/* Permission Chip (Viewer / Editor / Admin) */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${
                        item.permission === 'Editor'
                          ? 'bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)] text-[var(--app-accent)] border-[color-mix(in_srgb,var(--app-accent)_35%,transparent)]'
                          : item.permission === 'Admin'
                          ? 'bg-[color-mix(in_srgb,var(--app-accent)_22%,transparent)] text-[var(--app-accent)] border-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] font-bold'
                          : 'bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] text-[var(--app-accent)] border-[color-mix(in_srgb,var(--app-accent)_28%,transparent)] opacity-90'
                      }`}
                    >
                      {item.permission}
                    </span>

                    {isPending && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/35">
                        Pending Approval
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-[#94A3B8] mt-1">
                    Shared by <span className="text-[#E2E8F0] font-medium">{item.owner.name}</span> · {formatBytes(item.size)} · Shared {formattedDate}
                  </p>
                  {/* QM-M39-009: security scan state — 'unknown' renders as "Not scanned", never as safe */}
                  {item.type === 'file' && (
                    <div className="mt-1.5">
                      <FileScanBadge status={item.scanStatus} reason={item.scanReason} />
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                {isPending ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onAcceptShare?.(item.shareId ?? item.id)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--app-accent)] text-[var(--quant-background)] text-xs font-bold hover:bg-[#7DD3FC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeclineShare?.(item.shareId ?? item.id)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--quant-surface-elevated)] text-[#94A3B8] text-xs font-medium hover:text-[#F8FAFC] hover:bg-[#334155] transition-colors focus-visible:outline-none"
                    >
                      Decline
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      // QM-SCREEN-010 P0: preview with the FILE id, not the
                      // share record id, so the preview modal and
                      // recordFileOpen hit the real target.
                      onClick={() => onPreviewItem?.(item.fileId ? { ...item, id: item.fileId } : item)}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--quant-surface-elevated)] border border-[var(--quant-border)] text-xs font-medium text-[#F8FAFC] hover:border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] hover:bg-[#1E2433] transition-colors focus-visible:outline-none"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      // QM-SCREEN-010 P0: download with the FILE id, not the
                      // share record id (which 404s on /files/:id/download).
                      onClick={() => onDownloadFile?.(item.fileId ?? item.id, item.name)}
                      disabled={item.type === 'file' && item.scanStatus === 'quarantined'}
                      title={
                        item.scanStatus === 'quarantined'
                          ? 'Quarantined — download disabled. Open the file to see the security notice.'
                          : isDocumentDriveId(item.fileId ?? item.id)
                            ? 'Open in editor'
                            : 'Download'
                      }
                      className="px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_35%,transparent)] text-xs font-semibold text-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_25%,transparent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isDocumentDriveId(item.fileId ?? item.id) ? 'Open' : 'Download'}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
}
