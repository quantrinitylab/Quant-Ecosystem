'use client';

// ============================================================================
// QuantGit — Comprehensive Issues Lifecycle Engine (GitHub Screens 28, 76, 89–90, 147–158)
// ============================================================================

import React, { useState } from 'react';
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
  const [selectedIssue, setSelectedIssue] = useState<IssueItem | null>(null);
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newComment, setNewComment] = useState('');
  const [activeTabMode, setActiveTabMode] = useState<'write' | 'preview'>('write');

  // Insert markdown tag helper
  const insertMarkdown = (prefix: string, suffix = '') => {
    setNewComment((prev) => `${prev}${prefix}text${suffix}`);
  };

  return (
    <div className="space-y-4 text-xs text-[#E6EDF3]">
      {/* If viewing a selected issue detail */}
      {selectedIssue ? (
        <div className="space-y-6">
          {/* Back button & Issue Header */}
          <div className="space-y-3 pb-4 border-b border-[#30363D]">
            <button
              onClick={() => setSelectedIssue(null)}
              className="text-[#58A6FF] hover:underline flex items-center gap-1.5 font-medium"
            >
              <span>← Back to all issues</span>
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-[#E6EDF3]">
                {selectedIssue.title}{' '}
                <span className="text-[#8D96A0] font-normal">#{selectedIssue.id}</span>
              </h2>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleIssue(selectedIssue.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    selectedIssue.state === 'open'
                      ? 'bg-[#21262D] hover:bg-[#30363D] text-[#8D96A0] hover:text-[#E6EDF3] border border-[#30363D]'
                      : 'bg-[#238636] hover:bg-[#2EA043] text-white'
                  }`}
                >
                  {selectedIssue.state === 'open' ? 'Close issue' : 'Reopen issue'}
                </button>
              </div>
            </div>

            {/* Status Pill & Author metadata */}
            <div className="flex items-center gap-3 text-[11px] text-[#8D96A0]">
              <span
                className={`px-2.5 py-0.5 rounded-full text-white font-semibold flex items-center gap-1 ${
                  selectedIssue.state === 'open' ? 'bg-[#238636]' : 'bg-[#8957E5]'
                }`}
              >
                <span>{selectedIssue.state === 'open' ? '☉ Open' : '✓ Closed'}</span>
              </span>
              <span>
                <strong className="text-[#E6EDF3]">{selectedIssue.author}</strong> opened this issue{' '}
                {selectedIssue.createdAt} · {selectedIssue.commentsCount} comments
              </span>
            </div>
          </div>

          {/* Two-column layout: Conversation stream + Sidebar metadata */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Conversation Timeline */}
            <div className="flex-1 space-y-4">
              {/* Original Post card */}
              <div className="rounded-xl bg-[#161B22] border border-[#30363D] overflow-hidden">
                <div className="px-4 py-2.5 bg-[#0D1117] border-b border-[#30363D] flex items-center justify-between">
                  <span className="font-semibold text-xs text-[#E6EDF3]">
                    {selectedIssue.author} commented {selectedIssue.createdAt}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#30363D] text-[#8D96A0]">
                    Author
                  </span>
                </div>
                <div className="p-4 space-y-3 leading-relaxed">
                  <p className="text-xs text-[#E6EDF3]">
                    Tracking issue for the CodeHub / QuantGit Smart HTTP daemon and repository
                    inspection engine. Companion to the Wave A tracking issue #250.
                  </p>
                  <div className="p-3 rounded-lg bg-[#0D1117] border border-[#30363D] font-mono text-[11px] space-y-1">
                    <p className="text-[#58A6FF]">git -c key=value receive-pack</p>
                    <p className="text-[#8D96A0]">
                      One directory, versioned with application, zero state.
                    </p>
                  </div>
                </div>
              </div>

              {/* Comment Composer with Markdown Toolbar (Screen 153) */}
              <div className="rounded-xl bg-[#161B22] border border-[#30363D] overflow-hidden space-y-2">
                <div className="px-3 py-2 bg-[#0D1117] border-b border-[#30363D] flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveTabMode('write')}
                      className={`px-3 py-1 rounded text-xs font-semibold ${
                        activeTabMode === 'write' ? 'bg-[#21262D] text-[#E6EDF3]' : 'text-[#8D96A0]'
                      }`}
                    >
                      Write
                    </button>
                    <button
                      onClick={() => setActiveTabMode('preview')}
                      className={`px-3 py-1 rounded text-xs font-semibold ${
                        activeTabMode === 'preview'
                          ? 'bg-[#21262D] text-[#E6EDF3]'
                          : 'text-[#8D96A0]'
                      }`}
                    >
                      Preview
                    </button>
                  </div>

                  {/* Markdown Toolbar (Screen 153) */}
                  <div className="flex items-center gap-1 text-[#8D96A0]">
                    <button
                      onClick={() => insertMarkdown('**', '**')}
                      className="p-1 hover:text-[#E6EDF3] font-bold"
                      title="Bold"
                    >
                      B
                    </button>
                    <button
                      onClick={() => insertMarkdown('*', '*')}
                      className="p-1 hover:text-[#E6EDF3] italic"
                      title="Italic"
                    >
                      I
                    </button>
                    <button
                      onClick={() => insertMarkdown('[', '](url)')}
                      className="p-1 hover:text-[#E6EDF3]"
                      title="Link"
                    >
                      🔗
                    </button>
                    <button
                      onClick={() => insertMarkdown('@')}
                      className="p-1 hover:text-[#E6EDF3]"
                      title="Mention"
                    >
                      @
                    </button>
                    <button
                      onClick={() => insertMarkdown('- ')}
                      className="p-1 hover:text-[#E6EDF3]"
                      title="Bullet list"
                    >
                      ≡
                    </button>
                    <button
                      onClick={() => insertMarkdown('- [ ] ')}
                      className="p-1 hover:text-[#E6EDF3]"
                      title="Task list"
                    >
                      ☑
                    </button>
                    <button
                      onClick={() => insertMarkdown('### ')}
                      className="p-1 hover:text-[#E6EDF3] font-bold"
                      title="Heading"
                    >
                      H
                    </button>
                  </div>
                </div>

                <div className="p-3">
                  {activeTabMode === 'write' ? (
                    <textarea
                      rows={4}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Leave a comment"
                      className="w-full bg-[#0D1117] border border-[#30363D] focus:border-[#58A6FF] rounded-lg p-2.5 text-xs text-[#E6EDF3] outline-none"
                    />
                  ) : (
                    <div className="p-3 bg-[#0D1117] rounded-lg min-h-[96px] text-xs text-[#8D96A0]">
                      {newComment || 'Nothing to preview'}
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => {
                        alert('Comment posted!');
                        setNewComment('');
                      }}
                      className="px-4 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-semibold text-xs transition-colors"
                    >
                      Comment
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Metadata Sidebar (Screens 154–158) */}
            <div className="w-full lg:w-64 space-y-4 shrink-0 text-xs">
              {/* Assignees */}
              <div className="pb-3 border-b border-[#21262D] space-y-1">
                <div className="flex items-center justify-between text-[#8D96A0]">
                  <span className="font-semibold">Assignees</span>
                  <button className="text-[#58A6FF] hover:underline text-[11px]">EDIT</button>
                </div>
                <p className="text-[#E6EDF3]">{selectedIssue.assignee || 'No one assigned'}</p>
              </div>

              {/* Labels */}
              <div className="pb-3 border-b border-[#21262D] space-y-1.5">
                <div className="flex items-center justify-between text-[#8D96A0]">
                  <span className="font-semibold">Labels</span>
                  <button className="text-[#58A6FF] hover:underline text-[11px]">EDIT</button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedIssue.labels.map((lbl) => (
                    <span
                      key={lbl.name}
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: lbl.color }}
                    >
                      {lbl.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Milestone */}
              <div className="pb-3 border-b border-[#21262D] space-y-1">
                <div className="flex items-center justify-between text-[#8D96A0]">
                  <span className="font-semibold">Milestone</span>
                  <button className="text-[#58A6FF] hover:underline text-[11px]">EDIT</button>
                </div>
                <p className="text-[#8D96A0]">No milestone selected</p>
              </div>

              {/* Linked Items */}
              <div className="pb-3 border-b border-[#21262D] space-y-1">
                <div className="flex items-center justify-between text-[#8D96A0]">
                  <span className="font-semibold">Linked items</span>
                  <button className="text-[#58A6FF] hover:underline text-[11px]">EDIT</button>
                </div>
                <p className="text-[#8D96A0]">No linked items</p>
              </div>

              {/* Projects */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[#8D96A0]">
                  <span className="font-semibold">Projects</span>
                  <button className="text-[#58A6FF] hover:underline text-[11px]">EDIT</button>
                </div>
                <p className="text-[#8D96A0]">No projects selected</p>
              </div>
            </div>
          </div>
        </div>
      ) : isCreatingIssue ? (
        /* Issue Creation Composer */
        <div className="rounded-xl bg-[#161B22] border border-[#30363D] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
            <h3 className="font-bold text-sm text-[#E6EDF3]">Create new issue</h3>
            <button
              onClick={() => setIsCreatingIssue(false)}
              className="text-[#8D96A0] hover:text-[#E6EDF3]"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-[#8D96A0] block mb-1">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Title"
                className="w-full bg-[#0D1117] border border-[#30363D] focus:border-[#58A6FF] rounded-lg p-2 text-xs text-[#E6EDF3] outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-[#8D96A0] block mb-1">Description</label>
              <textarea
                rows={6}
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Leave a description..."
                className="w-full bg-[#0D1117] border border-[#30363D] focus:border-[#58A6FF] rounded-lg p-2 text-xs text-[#E6EDF3] outline-none"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  alert(`Issue created: ${newTitle}`);
                  setIsCreatingIssue(false);
                }}
                className="px-4 py-2 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-semibold text-xs shadow-sm transition-colors"
              >
                Submit new issue
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Issues List View */
        <div className="space-y-4">
          {/* Filter Bar & Action Button */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[260px] relative">
              <input
                type="text"
                value={issueSearchQuery}
                onChange={(e) => setIssueSearchQuery(e.target.value)}
                placeholder="is:issue state:open ..."
                className="w-full bg-[#161B22] border border-[#30363D] focus:border-[#58A6FF] rounded-lg px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#8D96A0] outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreatingIssue(true)}
                className="px-3.5 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors"
              >
                New issue
              </button>
            </div>
          </div>

          {/* Filter Dropdowns (Screens 147–149) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[#8D96A0] text-[11px]">
            {['Author', 'Label', 'Projects', 'Milestones', 'Assignee', 'Sort: Newest'].map(
              (flt) => (
                <button
                  key={flt}
                  onClick={() => alert(`Filter by ${flt}...`)}
                  className="px-2.5 py-1 rounded-md bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-[#8D96A0] hover:text-[#E6EDF3] flex items-center gap-1 transition-colors"
                >
                  <span>{flt}</span>
                  <span className="text-[9px]">▼</span>
                </button>
              ),
            )}
          </div>

          {/* Issues List Container */}
          <div className="border border-[#30363D] rounded-xl bg-[#0D1117] overflow-hidden">
            <div className="bg-[#161B22] border-b border-[#30363D] px-4 py-3 flex items-center justify-between font-semibold">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setIssueSearchQuery('is:issue state:open')}
                  className={`flex items-center gap-1.5 ${
                    !issueSearchQuery.includes('state:closed')
                      ? 'text-white font-bold'
                      : 'text-[#8D96A0]'
                  }`}
                >
                  <span className="text-[#3FB950]">☉</span> {openIssuesCount} Open
                </button>
                <button
                  type="button"
                  onClick={() => setIssueSearchQuery('is:issue state:closed')}
                  className={`flex items-center gap-1.5 ${
                    issueSearchQuery.includes('state:closed')
                      ? 'text-white font-bold'
                      : 'text-[#8D96A0]'
                  }`}
                >
                  <span className="text-[#8957E5]">✓</span> {closedIssuesCount} Closed
                </button>
              </div>
            </div>

            <div className="divide-y divide-[#21262D]">
              {filteredIssues.map((issue) => (
                <div
                  key={issue.id}
                  onClick={() => setSelectedIssue(issue)}
                  className="p-3.5 hover:bg-[#161B22] transition-colors flex items-start justify-between gap-4 cursor-pointer group"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-bold ${
                          issue.state === 'open' ? 'text-[#3FB950]' : 'text-[#8957E5]'
                        }`}
                      >
                        {issue.state === 'open' ? '☉' : '✓'}
                      </span>
                      <span className="font-semibold text-xs text-[#E6EDF3] group-hover:text-[#58A6FF] transition-colors">
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
                    <p className="text-[11px] text-[#8D96A0]">
                      #{issue.id} opened {issue.createdAt} by {issue.author} · Assignee:{' '}
                      {issue.assignee}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[#8D96A0]">
                    <span>💬</span>
                    <span>{issue.commentsCount}</span>
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
