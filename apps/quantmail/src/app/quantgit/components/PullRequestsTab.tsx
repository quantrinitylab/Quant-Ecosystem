'use client';

import React from 'react';
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
  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[240px]">
          <input
            type="text"
            value={pullSearchQuery}
            onChange={(e) => setPullSearchQuery(e.target.value)}
            placeholder="Search all pull requests..."
            className="w-full bg-[#161B22] border border-[#30363D] rounded-md px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
          />
        </div>
        <button
          type="button"
          onClick={() => setModalState('new-pr')}
          className="px-3.5 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors"
        >
          New pull request
        </button>
      </div>

      <div className="border border-[#30363D] rounded-md bg-[#0D1117] overflow-hidden">
        <div className="bg-[#161B22] border-b border-[#30363D] px-4 py-3 flex items-center justify-between font-semibold">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setPullSearchQuery('is:pr state:open')}
              className={`flex items-center gap-1.5 ${!pullSearchQuery.includes('state:closed') ? 'text-white font-bold' : 'text-[#7D8590]'}`}
            >
              ⑂ {openPullsCount} Open
            </button>
            <button
              type="button"
              onClick={() => setPullSearchQuery('is:pr state:closed')}
              className={`flex items-center gap-1.5 ${pullSearchQuery.includes('state:closed') ? 'text-white font-bold' : 'text-[#7D8590]'}`}
            >
              ✓ {closedPullsCount} Closed
            </button>
          </div>
        </div>

        <div className="divide-y divide-[#21262D]">
          {filteredPulls.map((pr) => (
            <div
              key={pr.id}
              className="p-3.5 hover:bg-[#161B22] transition-colors flex items-start justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={pr.state === 'merged' ? 'text-[#A371F7]' : 'text-[#3FB950]'}>
                    ⑂
                  </span>
                  <span
                    onClick={() => {
                      openPullDetail(pr);
                    }}
                    className="font-bold text-white hover:text-[#58A6FF] cursor-pointer"
                  >
                    {pr.title}
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-[#1F242C] text-[#58A6FF] font-mono text-[10px]">
                    {pr.branchSource}
                  </span>
                  <span className="px-1.5 py-0.2 rounded border border-[#238636] text-[#3FB950] text-[10px] font-semibold">
                    ✓ checks passed
                  </span>
                </div>
                <p className="text-[11px] text-[#7D8590]">
                  #{pr.id} by {pr.author} was {pr.state} {pr.createdAt} · +{pr.additions} -
                  {pr.deletions}
                </p>
              </div>
              <div className="flex items-center gap-1 text-[#7D8590]">
                <span>💬</span>
                <span>{pr.commentsCount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
