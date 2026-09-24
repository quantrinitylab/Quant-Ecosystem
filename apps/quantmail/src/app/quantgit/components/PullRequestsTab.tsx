'use client';

// ============================================================================
// QuantGit — Pull Requests Engine & CI Checks Gate (Screens 27, 73–74, 99–103)
// ============================================================================

import React, { useState } from 'react';
import type { PRItem } from '../types';

export interface PullRequestsTabProps {
  pullSearchQuery: string;
  setPullSearchQuery: (q: string) => void;
  filteredPulls: PRItem[];
  openPullsCount: number;
  closedPullsCount: number;
  setModalState: (modal: any) => void;
  openPullDetail: (pr: PRItem) => void;
}

export function PullRequestsTab({
  pullSearchQuery,
  setPullSearchQuery,
  filteredPulls,
  openPullsCount,
  closedPullsCount,
  setModalState,
  openPullDetail,
}: PullRequestsTabProps) {
  const [selectedPR, setSelectedPR] = useState<PRItem | null>(null);
  const [diffViewMode, setDiffViewMode] = useState<'unified' | 'split'>('unified');

  return (
    <div className="space-y-4 text-xs text-[#E6EDF3]">
      {selectedPR ? (
        /* PR Detail View with 3-Way Diff & Checks Gate */
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-3 pb-4 border-b border-[#30363D]">
            <button
              onClick={() => setSelectedPR(null)}
              className="text-[#58A6FF] hover:underline flex items-center gap-1.5 font-medium"
            >
              <span>← Back to all pull requests</span>
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-[#E6EDF3]">
                {selectedPR.title}{' '}
                <span className="text-[#8D96A0] font-normal">#{selectedPR.id}</span>
              </h2>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#8D96A0]">
                  <strong className="text-emerald-400">+{selectedPR.additions}</strong> /{' '}
                  <strong className="text-red-400">-{selectedPR.deletions}</strong> lines
                </span>
              </div>
            </div>

            {/* State pill + Branch branch link */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#8D96A0]">
              <span
                className={`px-2.5 py-0.5 rounded-full text-white font-semibold flex items-center gap-1 ${
                  selectedPR.state === 'merged'
                    ? 'bg-[#8957E5]'
                    : selectedPR.state === 'open'
                      ? 'bg-[#238636]'
                      : 'bg-[#DA3633]'
                }`}
              >
                <span>
                  ⑂{' '}
                  {selectedPR.state === 'merged'
                    ? 'Merged'
                    : selectedPR.state === 'open'
                      ? 'Open'
                      : 'Closed'}
                </span>
              </span>

              <span>
                <strong className="text-[#E6EDF3]">{selectedPR.author}</strong> wants to merge into{' '}
                <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#58A6FF] font-mono">
                  main
                </span>{' '}
                from{' '}
                <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#58A6FF] font-mono">
                  {selectedPR.branchSource}
                </span>
              </span>
            </div>
          </div>

          {/* CI Checks & Review Status Box (Screens 99–103) */}
          <div className="rounded-xl bg-[#161B22] border border-[#30363D] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">
                  ✓
                </span>
                <span className="font-semibold text-xs text-[#E6EDF3]">
                  All checks have passed (55/56 checks verified green)
                </span>
              </div>
              <button className="text-[#58A6FF] hover:underline text-[11px]">
                Show all checks
              </button>
            </div>

            <div className="divide-y divide-[#21262D] text-[11px] text-[#8D96A0] pt-1">
              <div className="py-1.5 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>gate — CI test and typecheck suite passed (3m 33s)</span>
                </span>
                <span className="font-mono text-[#E6EDF3]">Required</span>
              </div>
              <div className="py-1.5 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>CodeQL — 0 security vulnerabilities detected</span>
                </span>
                <span className="font-mono text-[#E6EDF3]">Passed</span>
              </div>
            </div>

            {/* Merge Action Box */}
            <div className="pt-3 border-t border-[#30363D] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => alert(`Pull Request #${selectedPR.id} merged successfully!`)}
                  className="px-4 py-2 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm flex items-center gap-2 transition-colors"
                >
                  <span>Merge pull request</span>
                  <span className="text-[10px]">▼</span>
                </button>
                <span className="text-[11px] text-[#8D96A0]">
                  This branch has no conflicts with the base branch.
                </span>
              </div>
            </div>
          </div>

          {/* Diff Viewer Mockup (Screen 99–103) */}
          <div className="rounded-xl bg-[#0D1117] border border-[#30363D] overflow-hidden">
            <div className="px-4 py-2.5 bg-[#161B22] border-b border-[#30363D] flex items-center justify-between">
              <span className="font-semibold text-xs text-[#E6EDF3] font-mono">
                Showing 1 changed file with +{selectedPR.additions} -{selectedPR.deletions} lines
              </span>
              <div className="flex items-center gap-1 bg-[#0D1117] p-0.5 rounded border border-[#30363D]">
                <button
                  onClick={() => setDiffViewMode('unified')}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    diffViewMode === 'unified' ? 'bg-[#21262D] text-[#E6EDF3]' : 'text-[#8D96A0]'
                  }`}
                >
                  Unified
                </button>
                <button
                  onClick={() => setDiffViewMode('split')}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    diffViewMode === 'split' ? 'bg-[#21262D] text-[#E6EDF3]' : 'text-[#8D96A0]'
                  }`}
                >
                  Split
                </button>
              </div>
            </div>

            <div className="p-4 font-mono text-[11px] space-y-1 overflow-x-auto">
              <p className="text-[#8D96A0]">
                @@ -14,8 +14,14 @@ export interface SpeechTelemetryConfig
              </p>
              <p className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                + export const TELEMETRY_SAMPLE_RATE = 1.0;
              </p>
              <p className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                + export function recordSpeechMetric(event: SpeechEvent): void;
              </p>
              <p className="text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                - const legacyRecordingEnabled = false;
              </p>
              <p className="text-[#8D96A0] px-2 py-0.5"> export const defaultVoiceId = 'nova';</p>
            </div>
          </div>
        </div>
      ) : (
        /* PR List View */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[260px]">
              <input
                type="text"
                value={pullSearchQuery}
                onChange={(e) => setPullSearchQuery(e.target.value)}
                placeholder="is:pr state:open ..."
                className="w-full bg-[#161B22] border border-[#30363D] focus:border-[#58A6FF] rounded-lg px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#8D96A0] outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setModalState('new-pr')}
              className="px-3.5 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors"
            >
              New pull request
            </button>
          </div>

          <div className="border border-[#30363D] rounded-xl bg-[#0D1117] overflow-hidden">
            <div className="bg-[#161B22] border-b border-[#30363D] px-4 py-3 flex items-center justify-between font-semibold">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setPullSearchQuery('is:pr state:open')}
                  className={`flex items-center gap-1.5 ${
                    !pullSearchQuery.includes('state:closed')
                      ? 'text-white font-bold'
                      : 'text-[#8D96A0]'
                  }`}
                >
                  <span className="text-[#3FB950]">⑂</span> {openPullsCount} Open
                </button>
                <button
                  type="button"
                  onClick={() => setPullSearchQuery('is:pr state:closed')}
                  className={`flex items-center gap-1.5 ${
                    pullSearchQuery.includes('state:closed')
                      ? 'text-white font-bold'
                      : 'text-[#8D96A0]'
                  }`}
                >
                  <span className="text-[#8957E5]">✓</span> {closedPullsCount} Closed
                </button>
              </div>
            </div>

            <div className="divide-y divide-[#21262D]">
              {filteredPulls.map((pr) => (
                <div
                  key={pr.id}
                  onClick={() => setSelectedPR(pr)}
                  className="p-3.5 hover:bg-[#161B22] transition-colors flex items-start justify-between gap-4 cursor-pointer group"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={pr.state === 'merged' ? 'text-[#8957E5]' : 'text-[#3FB950]'}>
                        ⑂
                      </span>
                      <span className="font-semibold text-xs text-[#E6EDF3] group-hover:text-[#58A6FF] transition-colors">
                        {pr.title}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-[#1F242C] text-[#58A6FF] font-mono text-[10px]">
                        {pr.branchSource}
                      </span>
                      <span className="px-1.5 py-0.2 rounded border border-[#238636] text-[#3FB950] text-[10px] font-semibold">
                        ✓ 55/56 passed
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#8D96A0] text-[10px]">
                        Review required
                      </span>
                    </div>
                    <p className="text-[11px] text-[#8D96A0]">
                      #{pr.id} by {pr.author} was {pr.state} {pr.createdAt} · +{pr.additions} -
                      {pr.deletions}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[#8D96A0]">
                    <span>💬</span>
                    <span>{pr.commentsCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
