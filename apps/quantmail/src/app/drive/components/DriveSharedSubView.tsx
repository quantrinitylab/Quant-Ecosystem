'use client';

import React from 'react';
import { formatBytes } from '../../../lib/format-bytes';
import { FileScanBadge } from './FileScanBadge';
import { SharedUsersIcon, HardDriveIcon } from './DriveIcons';

export interface SharedCollaborator {
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface SharedItemRecord {
  id: string;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-[#232938] bg-[#12151E] shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3.5">
          <div className="size-11 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0">
            <SharedUsersIcon className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#F8FAFC]">Shared with Me</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30">
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
            className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-[#232938] bg-[#161A26] text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#38BDF8]/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
          >
            Refresh Shares
          </button>
        )}
      </div>

      {/* Shared Items List */}
      {activeShares.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#232938] bg-[#12151E] px-6 py-12 text-center">
          <div className="size-10 rounded-xl bg-[#090A0E] border border-[#232938] flex items-center justify-center text-[#64748B]">
            <SharedUsersIcon className="size-5" />
          </div>
          <p className="text-sm font-semibold text-[#F8FAFC]">No shared files yet</p>
          <p className="text-xs text-[#94A3B8]">
            When someone shares a file with you, it will appear here.
          </p>
        </div>
      ) : (
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
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-[#232938] bg-[#12151E] hover:border-[#38BDF8]/40 hover:bg-[#161A26] transition-all gap-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]"
            >
              {/* File Info & Collaborator Avatar */}
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                {/* Collaborator Avatar */}
                <div
                  title={`Shared by ${item.owner.name} (${item.owner.email})`}
                  className="size-10 rounded-full bg-gradient-to-tr from-[#0284C7] to-[#38BDF8] p-[1.5px] shrink-0"
                >
                  <div className="size-full rounded-full bg-[#12151E] flex items-center justify-center text-[11px] font-bold text-[#38BDF8] tracking-wider">
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
                          ? 'bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/35'
                          : item.permission === 'Admin'
                          ? 'bg-purple-500/15 text-purple-400 border-purple-500/35'
                          : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35'
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
                      onClick={() => onAcceptShare?.(item.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#38BDF8] text-[#090A0E] text-xs font-bold hover:bg-[#7DD3FC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeclineShare?.(item.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#1E293B] text-[#94A3B8] text-xs font-medium hover:text-[#F8FAFC] hover:bg-[#334155] transition-colors focus-visible:outline-none"
                    >
                      Decline
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onPreviewItem?.(item)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#161A26] border border-[#232938] text-xs font-medium text-[#F8FAFC] hover:border-[#38BDF8]/40 hover:bg-[#1E2433] transition-colors focus-visible:outline-none"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadFile?.(item.id, item.name)}
                      disabled={item.type === 'file' && item.scanStatus === 'quarantined'}
                      title={
                        item.scanStatus === 'quarantined'
                          ? 'Quarantined — download disabled. Open the file to see the security notice.'
                          : 'Download'
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#38BDF8]/15 border border-[#38BDF8]/35 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Download
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
