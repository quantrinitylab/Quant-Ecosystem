'use client';

import React, { useState } from 'react';
import {
  CleanerSparkleIcon,
  DatabaseBlocksIcon,
  ActivityBandwidthIcon,
  HardDriveIcon,
  CheckIcon,
} from './DriveIcons';

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
  onReclaimComplete?: () => void;
}

const DEFAULT_CLUSTERS: DuplicateCluster[] = [
  {
    clusterId: 'cluster-1',
    title: 'Quarterly_Report_v1.pdf vs v2.pdf',
    similarity: '98.4% Block Match · FastCDC 64KB CAS',
    potentialSavings: '6.1 MB',
    files: [
      {
        id: 'f-1a',
        name: 'Quarterly_Report_v1.pdf',
        path: '/Corporate/Reports/Quarterly_Report_v1.pdf',
        size: '12.4 MB',
        modified: 'Sep 24, 2026',
        isOriginal: true,
      },
      {
        id: 'f-1b',
        name: 'Quarterly_Report_v2.pdf',
        path: '/Backups/Drafts/Quarterly_Report_v2.pdf',
        size: '12.4 MB',
        modified: 'Sep 28, 2026',
        isOriginal: false,
      },
    ],
  },
  {
    clusterId: 'cluster-2',
    title: 'Design_System_Master.fig vs Backup',
    similarity: '95.2% Block Match · FastCDC 64KB CAS',
    potentialSavings: '21.0 MB',
    files: [
      {
        id: 'f-2a',
        name: 'Design_System_Master.fig',
        path: '/Design/Assets/Design_System_Master.fig',
        size: '42.8 MB',
        modified: 'Sep 15, 2026',
        isOriginal: true,
      },
      {
        id: 'f-2b',
        name: 'Design_System_Backup.fig',
        path: '/Archive/Design_System_Backup.fig',
        size: '42.8 MB',
        modified: 'Sep 22, 2026',
        isOriginal: false,
      },
    ],
  },
  {
    clusterId: 'cluster-3',
    title: 'Financial_Ledger_2026.xlsx vs Copy',
    similarity: '100.0% Exact CAS Match',
    potentialSavings: '8.2 MB',
    files: [
      {
        id: 'f-3a',
        name: 'Financial_Ledger_2026.xlsx',
        path: '/Finance/2026/Financial_Ledger_2026.xlsx',
        size: '8.2 MB',
        modified: 'Oct 01, 2026',
        isOriginal: true,
      },
      {
        id: 'f-3b',
        name: 'Financial_Ledger_Copy.xlsx',
        path: '/Downloads/Financial_Ledger_Copy.xlsx',
        size: '8.2 MB',
        modified: 'Oct 01, 2026',
        isOriginal: false,
      },
    ],
  },
];

export function DriveCleanerSubView({ onReclaimComplete }: DriveCleanerSubViewProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isReclaiming, setIsReclaiming] = useState(false);
  const [isReclaimed, setIsReclaimed] = useState(false);

  const handleConfirmReclaim = () => {
    setIsReclaiming(true);
    setTimeout(() => {
      setIsReclaiming(false);
      setIsReclaimed(true);
      setShowConfirmModal(false);
      onReclaimComplete?.();
    }, 800);
  };

  return (
    <div
      id="drive-panel-cleaner"
      role="tabpanel"
      aria-labelledby="drive-tab-cleaner"
      className="space-y-6"
    >
      {/* 1. Header Banner & Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-[#232938] bg-[#12151E] shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3.5">
          <div className="size-11 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0">
            <CleanerSparkleIcon className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#F8FAFC]">FastCDC 64KB Deduplication Cleaner</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30">
                BLAKE3 CAS
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Content-Defined Chunking across 64KB variable-sized boundaries with single-instance CAS
            </p>
          </div>
        </div>

        {/* Action button: [Reclaim 4.8 GB Storage] */}
        <div>
          {isReclaimed ? (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-bold">
              <CheckIcon className="size-4" />
              <span>4.8 GB Storage Reclaimed</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#38BDF8] hover:bg-[#7DD3FC] text-[#090A0E] text-xs font-bold shadow-[0_0_20px_rgba(56,189,248,0.25)] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] active:scale-95"
            >
              <CleanerSparkleIcon className="size-4 text-[#090A0E]" />
              <span>Reclaim 4.8 GB Storage</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Metric cards: 94.2% Bandwidth Saved, 4.8 GB Duplicate Blocks Identified */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl border border-[#232938] bg-[#12151E] shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#64748B]">Efficiency</span>
            <ActivityBandwidthIcon className="size-4 text-[#38BDF8]" />
          </div>
          <div className="text-xl font-black text-[#38BDF8] tracking-tight">94.2% Bandwidth Saved</div>
          <p className="text-[11px] text-[#94A3B8] mt-1">Zero cloud egress for repeated 64KB chunks</p>
        </div>

        <div className="p-4 rounded-xl border border-[#232938] bg-[#12151E] shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#64748B]">Identified</span>
            <DatabaseBlocksIcon className="size-4 text-[#F59E0B]" />
          </div>
          <div className="text-xl font-black text-[#F8FAFC] tracking-tight">4.8 GB Duplicate Blocks Identified</div>
          <p className="text-[11px] text-[#94A3B8] mt-1">Consolidation candidates in CAS index</p>
        </div>

        <div className="p-4 rounded-xl border border-[#232938] bg-[#12151E] shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#64748B]">CAS Chunks</span>
            <HardDriveIcon className="size-4 text-emerald-400" />
          </div>
          <div className="text-xl font-black text-emerald-400 tracking-tight">1,280 CAS Blocks Chunked</div>
          <p className="text-[11px] text-[#94A3B8] mt-1">Single-instance Content Addressed Storage</p>
        </div>

        <div className="p-4 rounded-xl border border-[#232938] bg-[#12151E] shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#64748B]">Algorithm</span>
            <CleanerSparkleIcon className="size-4 text-purple-400" />
          </div>
          <div className="text-xl font-black text-purple-400 tracking-tight">FastCDC 64KB Rolling</div>
          <p className="text-[11px] text-[#94A3B8] mt-1">Gear-hash cut-point normalization</p>
        </div>
      </div>

      {/* 3. Duplicate file clusters list (e.g. Quarterly_Report_v1.pdf vs v2.pdf) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
            Duplicate File Clusters ({DEFAULT_CLUSTERS.length})
          </h4>
          <span className="text-[11px] text-[#64748B]">
            Automated FastCDC chunk signature matching
          </span>
        </div>

        <div className="space-y-3.5">
          {DEFAULT_CLUSTERS.map((cluster) => (
            <div
              key={cluster.clusterId}
              className="p-4 rounded-xl border border-[#232938] bg-[#12151E] shadow-[0_2px_14px_rgba(0,0,0,0.3)] space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#232938] pb-2.5">
                <div>
                  <h5 className="text-xs font-bold text-[#F8FAFC]">{cluster.title}</h5>
                  <p className="text-[11px] text-[#38BDF8] font-medium mt-0.5">{cluster.similarity}</p>
                </div>
                <div className="text-left sm:text-right">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/30">
                    Reclaimable: {cluster.potentialSavings}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {cluster.files.map((file) => (
                  <div
                    key={file.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg bg-[#090A0E] border border-[#232938] text-xs gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="size-6 rounded bg-[#161A26] border border-[#232938] flex items-center justify-center text-[#94A3B8] shrink-0 font-mono text-[10px]">
                        {file.isOriginal ? 'ORIG' : 'DUP'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#F8FAFC] truncate">{file.name}</p>
                        <p className="text-[10px] text-[#64748B] truncate font-mono">{file.path}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[#94A3B8] shrink-0">
                      <span>{file.size}</span>
                      <span className="text-[#64748B]">·</span>
                      <span>{file.modified}</span>
                      {file.isOriginal && (
                        <span className="px-1.5 py-px rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
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
      </div>

      {/* 4. Confirmation Modal */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cleaner-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#38BDF8]/40 bg-[#12151E] p-6 shadow-[0_0_32px_rgba(56,189,248,0.25)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/35 flex items-center justify-center text-[#38BDF8] shrink-0">
                <CleanerSparkleIcon className="size-5" />
              </div>
              <div>
                <h3 id="cleaner-confirm-title" className="text-sm font-bold text-[#F8FAFC]">
                  Reclaim 4.8 GB Storage?
                </h3>
                <p className="text-xs text-[#38BDF8] font-medium">
                  FastCDC 64KB CAS Consolidation
                </p>
              </div>
            </div>

            <p className="text-xs text-[#94A3B8] leading-relaxed">
              FastCDC deduplication will reference identical 64KB chunk hashes in single-instance Content Addressed Storage. Your files, paths, and version history remain completely intact with zero data loss.
            </p>

            <div className="p-3 rounded-xl bg-[#090A0E] border border-[#232938] text-[11px] font-mono text-[#94A3B8] space-y-1">
              <div>Identified Redundancy: <strong className="text-[#F8FAFC]">4.8 GB</strong></div>
              <div>Chunk Algorithm: <span className="text-[#38BDF8]">FastCDC-64KB-BLAKE3</span></div>
              <div>Data Integrity: <span className="text-emerald-400">100% Cryptographic Match</span></div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-2 rounded-xl bg-[#1E293B] text-[#94A3B8] text-xs font-medium hover:text-[#F8FAFC] transition-colors focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isReclaiming}
                onClick={handleConfirmReclaim}
                className="px-4 py-2 rounded-xl bg-[#38BDF8] text-[#090A0E] text-xs font-bold hover:bg-[#7DD3FC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] disabled:opacity-50"
              >
                {isReclaiming ? 'Consolidating CAS Chunks...' : 'Confirm Reclamation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
