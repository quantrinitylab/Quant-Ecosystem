'use client';

import React from 'react';
import { formatBytes } from '../../../lib/format-bytes';
import { isDocumentDriveId } from '../../../lib/drive-ids';
import { FileScanBadge } from './FileScanBadge';
import { StarFilledIcon, HardDriveIcon, FolderIcon } from './DriveIcons';

export interface StarredItem {
  id: string;
  name: string;
  // QM-UIUX-079: 'document' items are the /drive/files projection of
  // doc-editor documents (backend id `doc:<documentId>`).
  type: 'file' | 'folder' | 'document';
  mimeType: string;
  size: number;
  modifiedAt: string;
  isStarred?: boolean;
  // QM-M39-009: security scan state (never rendered as safe).
  scanStatus?: string | null;
  scanReason?: string | null;
}

export interface DriveStarredSubViewProps {
  items: StarredItem[];
  loading?: boolean;
  onToggleStar?: (item: StarredItem, e?: React.MouseEvent) => void;
  onPreviewItem?: (item: StarredItem) => void;
  onDownloadFile?: (id: string, name: string) => void;
  onDeleteItem?: (id: string, name: string, e?: React.MouseEvent) => void;
}

export function DriveStarredSubView({
  items,
  loading = false,
  onToggleStar,
  onPreviewItem,
  onDownloadFile,
  onDeleteItem,
}: DriveStarredSubViewProps) {
  const activeItems = items;

  return (
    <div
      id="drive-panel-starred"
      role="tabpanel"
      aria-labelledby="drive-tab-starred"
      className="space-y-6"
    >
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-[#232938] bg-[var(--quant-surface)] shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3.5">
          <div className="size-11 rounded-xl bg-[var(--quant-warning)]/10 border border-[var(--quant-warning)]/30 flex items-center justify-center text-[var(--quant-warning)] shrink-0">
            <StarFilledIcon className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#F8FAFC]">Starred & Pinned Files</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--quant-warning)]/15 text-[var(--quant-warning)] border border-[var(--quant-warning)]/30">
                {activeItems.length} Pinned
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Priority bookmarks and quick-access files
            </p>
          </div>
        </div>
      </div>

      {/* Starred Files Grid */}
      {activeItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#232938] bg-[var(--quant-surface)] px-6 py-12 text-center">
          <div className="size-10 rounded-xl bg-[var(--quant-background)] border border-[#232938] flex items-center justify-center text-[#64748B]">
            <StarFilledIcon className="size-5" />
          </div>
          <p className="text-sm font-semibold text-[#F8FAFC]">No starred files yet</p>
          <p className="text-xs text-[#94A3B8]">
            Star a file to pin it here for quick access.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          {activeItems.map((item) => (
          <div
            key={item.id}
            onClick={() => onPreviewItem?.(item)}
            className="group relative flex flex-col justify-between p-4 rounded-xl border border-[#232938] bg-[var(--quant-surface)] hover:border-[var(--quant-warning)]/40 hover:bg-[var(--quant-surface-elevated)] transition-all cursor-pointer shadow-[0_2px_14px_rgba(0,0,0,0.3)] space-y-3"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="size-9 rounded-lg bg-[var(--quant-warning)]/10 border border-[var(--quant-warning)]/25 flex items-center justify-center text-[var(--quant-warning)] shrink-0">
                  {item.type === 'folder' ? (
                    <FolderIcon className="size-4" />
                  ) : (
                    <HardDriveIcon className="size-4" />
                  )}
                </div>

                <button
                  type="button"
                  aria-label={`Unstar ${item.name}`}
                  onClick={(e) => onToggleStar?.(item, e)}
                  className="size-7 rounded grid place-items-center text-[var(--quant-warning)] hover:scale-110 transition-transform focus-visible:outline-none"
                >
                  <StarFilledIcon className="size-4" />
                </button>
              </div>

              <p className="text-xs font-bold text-[#F8FAFC] truncate group-hover:text-[var(--quant-warning)] transition-colors">
                {item.name}
              </p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">
                {item.type === 'folder' ? 'Folder' : formatBytes(item.size)} · Pinned
              </p>
              {/* QM-M39-009: security scan state — 'unknown' renders as "Not scanned", never as safe */}
              {item.type === 'file' && (
                <div className="mt-1.5">
                  <FileScanBadge status={item.scanStatus} reason={item.scanReason} />
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#232938] flex items-center justify-between text-[11px]">
              <span className="text-[#64748B] font-mono text-[10px]">Pinned</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownloadFile?.(item.id, item.name);
                  }}
                  disabled={item.type === 'file' && item.scanStatus === 'quarantined'}
                  title={
                    item.scanStatus === 'quarantined'
                      ? 'Quarantined — download disabled. Open the file to see the security notice.'
                      : isDocumentDriveId(item.id)
                        ? 'Open in editor'
                        : 'Download'
                  }
                  className="px-2.5 py-1 rounded-lg bg-[var(--quant-surface-elevated)] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#334155] transition-colors text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isDocumentDriveId(item.id) ? 'Open' : 'Download'}
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
        ))}
        </div>
      )}
    </div>
  );
}
