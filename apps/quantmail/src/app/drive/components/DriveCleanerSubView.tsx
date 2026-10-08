'use client';

import React from 'react';
import { CleanerSparkleIcon } from './DriveIcons';

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
  onReclaimComplete?: () => void;
}

export function DriveCleanerSubView({ clusters = [] }: DriveCleanerSubViewProps) {
  return (
    <div
      id="drive-panel-cleaner"
      role="tabpanel"
      aria-labelledby="drive-tab-cleaner"
      className="space-y-6"
    >
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-[#232938] bg-[#12151E] shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3.5">
          <div className="size-11 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0">
            <CleanerSparkleIcon className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#F8FAFC]">Storage Cleaner</h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Find duplicate files and reclaim space
            </p>
          </div>
        </div>
      </div>

      {/* 2. Duplicate clusters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
            Duplicate Files ({clusters.length})
          </h4>
        </div>

        {clusters.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#232938] bg-[#12151E] px-6 py-12 text-center">
            <div className="size-10 rounded-xl bg-[#090A0E] border border-[#232938] flex items-center justify-center text-[#64748B]">
              <CleanerSparkleIcon className="size-5" />
            </div>
            <p className="text-sm font-semibold text-[#F8FAFC]">No duplicates found</p>
            <p className="text-xs text-[#94A3B8]">
              Your Drive looks clean. Duplicate scans will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {clusters.map((cluster) => (
              <div
                key={cluster.clusterId}
                className="p-4 rounded-xl border border-[#232938] bg-[#12151E] shadow-[0_2px_14px_rgba(0,0,0,0.3)] space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#232938] pb-2.5">
                  <div>
                    <h5 className="text-xs font-bold text-[#F8FAFC]">{cluster.title}</h5>
                    <p className="text-[11px] text-[#38BDF8] font-medium mt-0.5">
                      {cluster.similarity}
                    </p>
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
        )}
      </div>
    </div>
  );
}
