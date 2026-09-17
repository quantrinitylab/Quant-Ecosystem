'use client';

import React from 'react';
import type { IssueItem } from '../types';

export interface IssuesTabProps {
  issueSearchQuery: string;
  setIssueSearchQuery: (q: string) => void;
  filteredIssues: IssueItem[];
  openIssuesCount: number;
  closedIssuesCount: number;
  setModalState: (modal: any) => void;
  openIssueDetail: (issue: IssueItem) => void;
  handleToggleIssue: (id: number) => void;
}

export function IssuesTab({
  issueSearchQuery,
  setIssueSearchQuery,
  filteredIssues,
  openIssuesCount,
  closedIssuesCount,
  setModalState,
  openIssueDetail,
  handleToggleIssue,
}: IssuesTabProps) {
  return (
    <div className="space-y-4 text-xs">
      {/* Issues Filter & New Issue Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[240px] relative">
          <input
            type="text"
            value={issueSearchQuery}
            onChange={(e) => setIssueSearchQuery(e.target.value)}
            placeholder="Search all issues..."
            className="w-full bg-[#161B22] border border-[#30363D] rounded-md px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setModalState('new-issue')}
            className="px-3.5 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors"
          >
            New issue
          </button>
        </div>
      </div>

      {/* Issues List Container */}
      <div className="border border-[#30363D] rounded-md bg-[#0D1117] overflow-hidden">
        <div className="bg-[#161B22] border-b border-[#30363D] px-4 py-3 flex items-center justify-between font-semibold">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIssueSearchQuery('is:issue state:open')}
              className={`flex items-center gap-1.5 ${!issueSearchQuery.includes('state:closed') ? 'text-white font-bold' : 'text-[#7D8590]'}`}
            >
              ⨀ {openIssuesCount} Open
            </button>
            <button
              type="button"
              onClick={() => setIssueSearchQuery('is:issue state:closed')}
              className={`flex items-center gap-1.5 ${issueSearchQuery.includes('state:closed') ? 'text-white font-bold' : 'text-[#7D8590]'}`}
            >
              ✓ {closedIssuesCount} Closed
            </button>
          </div>
        </div>

        <div className="divide-y divide-[#21262D]">
          {filteredIssues.map((issue) => (
            <div
              key={issue.id}
              className="p-3.5 hover:bg-[#161B22] transition-colors flex items-start justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleIssue(issue.id);
                    }}
                    title={
                      issue.state === 'open' ? 'Click to close issue' : 'Click to reopen issue'
                    }
                    className={`font-bold transition-transform hover:scale-110 ${
                      issue.state === 'open' ? 'text-[#3FB950]' : 'text-[#8957E5]'
                    }`}
                  >
                    {issue.state === 'open' ? '⨀' : '✓'}
                  </button>
                  <span
                    onClick={() => {
                      openIssueDetail(issue);
                    }}
                    className={`font-bold hover:text-[#58A6FF] cursor-pointer ${
                      issue.state === 'closed' ? 'line-through text-[#7D8590]' : 'text-white'
                    }`}
                  >
                    {issue.title}
                  </span>
                  {issue.labels.map((lbl) => (
                    <span
                      key={lbl.name}
                      className="px-2 py-0.2 rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: lbl.color }}
                    >
                      {lbl.name}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-[#7D8590]">
                  #{issue.id} opened {issue.createdAt} by {issue.author} · Assignee:{' '}
                  {issue.assignee}
                </p>
              </div>
              <div className="flex items-center gap-1 text-[#7D8590]">
                <span>💬</span>
                <span>{issue.commentsCount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
