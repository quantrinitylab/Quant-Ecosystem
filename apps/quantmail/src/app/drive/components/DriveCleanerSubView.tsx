'use client';

import React from 'react';
import { CleanerSparkleIcon } from './DriveIcons';
import { formatBytes } from '../../../lib/format-bytes';
import type {
  DuplicateGroup,
  DuplicateFileItem,
} from '../../../components/drive/AIDuplicateCleanerModal';

export interface DuplicateClusterItem {
  id: string;
  name: string;
  path: string;
  size: string;
  modified: string;
  isOriginal?: boolean;
}

export interface DuplicateCluster {
  clusterId: string;
  title: string;
  similarity: string;
  potentialSavings: string;
  files: DuplicateClusterItem[];
}

export interface DriveCleanerSubViewProps {
  clusters?: DuplicateCluster[];
  /**
   * Real scan wiring (QM cleaner-tab fix): when provided, the tab owns a
   * duplicate-scan control wired to the same DuplicateCleanerManager that
   * drives AIDuplicateCleanerModal, so the tab is no longer a dead panel.
   */
  isScanning?: boolean;
  scanError?: string | null;
  hasScanned?: boolean;
  onScan?: () => void;
  onOpenCleanup?: () => void;
}

/**
 * Maps the DuplicateCleanerManager scan groups (real `/api/drive/ai/duplicates`
 * results) into this view's read-only cluster shape. Honest formatting only —
 * sizes come from real byte counts via formatBytes.
 */
export function duplicateGroupsToClusters(
  groups: DuplicateGroup[],
): DuplicateCluster[] {
  return groups.map((group) => {
    const files: DuplicateClusterItem[] = group.files.map(
      (file: DuplicateFileItem) => ({
        id: file.id,
        name: file.name,
        path: file.path,
        size: formatBytes(file.size),
        modified: file.modifiedAt ? file.modifiedAt.slice(0, 10) : '—',
        isOriginal: file.isOriginal,
      }),
    );
    return {
      clusterId: group.hash,
      title: `${group.files.length} files with identical content`,
      similarity: 'Exact match — identical content hash',
      potentialSavings: formatBytes(group.potentialSavings),
      files,
    };
  });
}

const noop = () => {};

/**
 * Storage Cleaner — duplicate scan results.
 *
 * NOTE (QM-M39-013 fake-data purge): the interactive duplicate scan + reclaim
 * flow lives in `AIDuplicateCleanerModal` (real `/api/drive/ai/duplicates`
 * scan, real `/api/drive/files/trash` cleanup, real byte counts). This view
 * renders clusters only — it previously accepted an `onReclaimComplete`
 * callback whose page-level handler fired a hardcoded
 * "4.8 GB duplicate storage reclaimed" toast that was pure fabrication
 * (nothing ever reclaimed anything; the callback was never even invoked).
 * The dead callback and the fake toast were removed. Never reintroduce a
 * reclaim message here that does not carry real removedCount/savedBytes.
 *
 * NOTE (cleaner-tab fix): the page now passes the real scan state from the
 * shared DuplicateCleanerManager (`clusters`, `isScanning`, `scanError`,
 * `hasScanned`, `onScan`, `onOpenCleanup`), so this tab shows the same real
 * results as the modal instead of a permanently-empty panel.
 */
export function DriveCleanerSubView({
  clusters = [],
  isScanning = false,
  scanError = null,
  hasScanned = false,
  onScan = noop,
  onOpenCleanup = noop,
}: DriveCleanerSubViewProps) {
  const scanButton = (
    <button
      type="button"
      onClick={onScan}
      disabled={isScanning}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-xs font-bold text-[#0A0F14] bg-[var(--app-accent)] transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
    >
      {isScanning ? (
        <>
          <svg
            className="size-3.5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          Scanning…
        </>
      ) : hasScanned ? (
        'Rescan for duplicates'
      ) : (
        'Scan for duplicates'
      )}
    </button>
  );

  return (
    <div
      id="drive-panel-cleaner"
      role="tabpanel"
      aria-labelledby="drive-tab-cleaner"
      className="space-y-6"
    >
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3.5">
          <div className="size-11 rounded-xl bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)] flex items-center justify-center text-[var(--app-accent)] shrink-0">
            <CleanerSparkleIcon className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#F8FAFC]">Storage Cleaner</h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Find duplicate files and reclaim space
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {clusters.length > 0 && (
            <button
              type="button"
              onClick={onOpenCleanup}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-xs font-bold text-[var(--app-accent)] border border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
            >
              Review &amp; clean up
            </button>
          )}
          {scanButton}
        </div>
      </div>

      {/* Scan error — honest, never swallowed */}
      {scanError && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300"
        >
          Duplicate scan failed: {scanError}
        </div>
      )}

      {/* 2. Duplicate clusters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
            Duplicate Files ({clusters.length})
          </h4>
        </div>

        {clusters.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--quant-border)] bg-[var(--quant-surface)] px-6 py-12 text-center">
            <div className="size-10 rounded-xl bg-[var(--quant-background)] border border-[var(--quant-border)] flex items-center justify-center text-[#64748B]">
              <CleanerSparkleIcon className="size-5" />
            </div>
            {isScanning ? (
              <>
                <p className="text-sm font-semibold text-[#F8FAFC]">
                  Scanning your Drive…
                </p>
                <p className="text-xs text-[#94A3B8]">
                  Comparing file contents to find duplicates.
                </p>
              </>
            ) : scanError && !hasScanned ? (
              // CODEX-REVIEW 6308089740: a failed FIRST scan renders the error
              // alone — never "No scan yet" (a scan WAS attempted) and never
              // "No duplicates found" (nothing was proven). The role="alert"
              // banner above carries the message; this panel just offers retry.
              <>
                <p className="text-sm font-semibold text-[#F8FAFC]">
                  Scan couldn&apos;t complete
                </p>
                <p className="text-xs text-[#94A3B8]">
                  Your files were not changed. Try the scan again.
                </p>
              </>
            ) : hasScanned ? (
              <>
                <p className="text-sm font-semibold text-[#F8FAFC]">
                  No duplicates found
                </p>
                <p className="text-xs text-[#94A3B8]">
                  Your Drive looks clean. Run another scan any time.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-[#F8FAFC]">
                  No scan yet
                </p>
                <p className="text-xs text-[#94A3B8]">
                  Run a duplicate scan to see identical files and how much
                  space they take.
                </p>
              </>
            )}
            {!isScanning && <div className="mt-2">{scanButton}</div>}
          </div>
        ) : (
          <div className="space-y-3.5">
            {clusters.map((cluster) => (
              <div
                key={cluster.clusterId}
                className="p-4 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] shadow-[0_2px_14px_rgba(0,0,0,0.3)] space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                  <div>
                    <h5 className="text-xs font-bold text-[#F8FAFC]">{cluster.title}</h5>
                    <p className="text-[11px] text-[var(--app-accent)] font-medium mt-0.5">
                      {cluster.similarity}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] text-[var(--app-accent)] border border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)]">
                      Reclaimable: {cluster.potentialSavings}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {cluster.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg bg-[var(--quant-background)] border border-[var(--quant-border)] text-xs gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="size-6 rounded bg-[var(--quant-surface-elevated)] border border-[var(--quant-border)] flex items-center justify-center text-[#94A3B8] shrink-0 font-mono text-[10px]">
                          {file.isOriginal ? 'ORIG' : 'DUP'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[#F8FAFC] truncate">{file.name}</p>
                          <p className="text-[10px] text-[#64748B] truncate font-mono">
                            {file.path}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-[#94A3B8] shrink-0">
                        <span>{file.size}</span>
                        <span className="text-[#64748B]">·</span>
                        <span>{file.modified}</span>
                        {file.isOriginal && (
                          <span className="px-1.5 py-px rounded text-[var(--q-type-xs)] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                            Keeper
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
