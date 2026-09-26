'use client';

import React, { useState, useMemo } from 'react';
import type { Repo, CommitItem, CommitFileDiff } from '../types';
import { INITIAL_COMMITS } from '../constants';

export interface CommitsTabProps {
  repo: Repo;
  currentBranch?: string;
  repoBranches?: string[];
  commits?: CommitItem[];
  selectedCommitSha?: string | null;
  onSelectBranch?: (branch: string) => void;
  onBrowseCodeAtCommit?: (commitSha: string) => void;
  showToast?: (msg: string) => void;
}

export function CommitsTab({
  repo,
  currentBranch = 'main',
  repoBranches = ['main'],
  commits: initialCommits,
  selectedCommitSha: propSelectedCommitSha,
  onSelectBranch,
  onBrowseCodeAtCommit,
  showToast = () => {},
}: CommitsTabProps) {
  const allCommits = initialCommits && initialCommits.length > 0 ? initialCommits : INITIAL_COMMITS;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(currentBranch);
  const [expandedCommitSha, setExpandedCommitSha] = useState<string | null>(
    propSelectedCommitSha || null,
  );
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [copiedSha, setCopiedSha] = useState<string | null>(null);

  // Filter commits by search query
  const filteredCommits = useMemo(() => {
    if (!searchQuery.trim()) return allCommits;
    const q = searchQuery.toLowerCase().trim();
    return allCommits.filter(
      (c) =>
        c.message.toLowerCase().includes(q) ||
        (c.body && c.body.toLowerCase().includes(q)) ||
        c.sha.toLowerCase().includes(q) ||
        c.author.name.toLowerCase().includes(q) ||
        (c.author.username && c.author.username.toLowerCase().includes(q)),
    );
  }, [allCommits, searchQuery]);

  // Group commits by date (e.g. "Commits on Sep 26, 2026")
  const groupedCommits = useMemo(() => {
    const groups: Record<string, CommitItem[]> = {};
    for (const commit of filteredCommits) {
      const groupKey = commit.date.startsWith('Commits on')
        ? commit.date
        : `Commits on ${commit.date}`;
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(commit);
    }
    return groups;
  }, [filteredCommits]);

  const activeCommit = useMemo(() => {
    return allCommits.find((c) => c.sha === expandedCommitSha) || null;
  }, [allCommits, expandedCommitSha]);

  const handleCopySha = (sha: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const shortSha = sha.slice(0, 7);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(sha).catch(() => {});
    }
    setCopiedSha(sha);
    showToast(`Copied commit SHA: ${shortSha}`);
    setTimeout(() => setCopiedSha(null), 2500);
  };

  const handleBrowseCode = (commit: CommitItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const short = commit.sha.slice(0, 7);
    onBrowseCodeAtCommit?.(commit.sha);
    showToast(`Browsing repository files at ${short}`);
  };

  const toggleFileExpansion = (filename: string) => {
    setExpandedFiles((prev) => ({
      ...prev,
      [filename]: prev[filename] === false ? true : false,
    }));
  };

  return (
    <div data-testid="commits-tab" className="space-y-6">
      {/* 1. Header Toolbar: Branch Selector, Search, Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#161B22] border border-[#30363D] rounded-lg p-3.5 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Branch Picker */}
          <div className="flex items-center gap-1.5 bg-[#21262D] border border-[#30363D] rounded-md px-2.5 py-1 text-[#E6EDF3] font-medium">
            <svg height="14" viewBox="0 0 16 16" width="14" fill="#7D8590">
              <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
            </svg>
            <span className="text-[#7D8590]">Branch:</span>
            <select
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                onSelectBranch?.(e.target.value);
                showToast(`Switched to branch: ${e.target.value}`);
              }}
              className="bg-transparent border-none text-white font-semibold focus:outline-none cursor-pointer"
            >
              {repoBranches.map((b) => (
                <option key={b} value={b} className="bg-[#161B22] text-[#E6EDF3]">
                  {b}
                </option>
              ))}
            </select>
          </div>

          <span className="text-[#7D8590] hidden sm:inline">
            <span className="text-white font-semibold">{filteredCommits.length}</span> commits on{' '}
            <code className="text-[#58A6FF] bg-[#21262D] px-1.5 py-0.5 rounded font-mono text-[11px]">
              {selectedBranch}
            </code>
          </span>
        </div>

        {/* Filter Input */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Filter commits by message or author..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0D1117] border border-[#30363D] rounded-md px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7D8590] hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 2. Commit Diff Details Modal / Split Panel when a commit is selected */}
      {activeCommit && (
        <div
          data-testid="commit-diff-view"
          className="bg-[#161B22] border border-[#58A6FF]/40 rounded-lg overflow-hidden shadow-2xl space-y-4 p-4 animate-in fade-in duration-200"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[#30363D]">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded bg-[#58A6FF]/20 text-[#58A6FF] border border-[#58A6FF]/30">
                  Commit Diff Details
                </span>
                <span className="font-mono text-xs text-[#7D8590]">{activeCommit.sha}</span>
              </div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {activeCommit.message}
              </h3>
              {activeCommit.body && (
                <p className="text-xs text-[#7D8590] mt-1 whitespace-pre-line font-mono bg-[#0D1117] p-2 rounded border border-[#21262D]">
                  {activeCommit.body}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopySha(activeCommit.sha)}
                className="px-2.5 py-1 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors text-xs font-semibold flex items-center gap-1.5"
              >
                <span>{copiedSha === activeCommit.sha ? '✓ Copied' : 'Copy full SHA'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleBrowseCode(activeCommit)}
                className="px-2.5 py-1 rounded-md bg-[#21262D] border border-[#30363D] text-[#58A6FF] hover:bg-[#30363D] transition-colors text-xs font-semibold flex items-center gap-1"
              >
                <span>&lt;&gt; Browse code</span>
              </button>
              <button
                type="button"
                onClick={() => setExpandedCommitSha(null)}
                className="p-1 rounded-md text-[#7D8590] hover:text-white hover:bg-[#21262D] transition-colors text-sm"
                title="Close diff view"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Files Changed Summary Bar */}
          <div
            data-testid="files-changed-summary"
            className="flex items-center justify-between text-xs font-medium text-[#E6EDF3] bg-[#0D1117] px-3.5 py-2 rounded-md border border-[#30363D]"
          >
            <span>
              Showing{' '}
              <strong className="text-white font-bold">
                {activeCommit.stats?.totalFiles ?? activeCommit.files?.length ?? 1} changed files
              </strong>{' '}
              with{' '}
              <span className="text-[#3FB950] font-bold">
                +{activeCommit.stats?.additions ?? 42}
              </span>{' '}
              <span className="text-[#F85149] font-bold">
                -{activeCommit.stats?.deletions ?? 12} lines
              </span>
            </span>

            <div className="flex items-center gap-1.5">
              <span className="text-[#7D8590] text-[11px]">Author:</span>
              <span className="font-semibold text-white">{activeCommit.author.name}</span>
              <span className="text-[#7D8590]">·</span>
              <span className="text-[#7D8590]">{activeCommit.relativeTime}</span>
            </div>
          </div>

          {/* Expandable Per-File Diffs */}
          <div className="space-y-3">
            {(
              activeCommit.files || [
                {
                  filename: 'apps/quantmail/src/app/quantgit/page.tsx',
                  status: 'modified' as const,
                  additions: activeCommit.stats?.additions ?? 42,
                  deletions: activeCommit.stats?.deletions ?? 12,
                  lines: [
                    {
                      type: 'context' as const,
                      oldLineNumber: 1,
                      newLineNumber: 1,
                      content: "import { useState } from 'react';",
                    },
                    {
                      type: 'addition' as const,
                      newLineNumber: 2,
                      content: "+import { CommitsTab } from './components/CommitsTab';",
                    },
                    {
                      type: 'addition' as const,
                      newLineNumber: 3,
                      content: "+import { BranchesTab } from './components/BranchesTab';",
                    },
                    {
                      type: 'deletion' as const,
                      oldLineNumber: 2,
                      content: "-import { LegacyPlaceholder } from './legacy';",
                    },
                    {
                      type: 'context' as const,
                      oldLineNumber: 3,
                      newLineNumber: 4,
                      content: 'export default function QuantGitPage() {',
                    },
                  ],
                },
              ]
            ).map((file: CommitFileDiff, fIdx: number) => {
              const isCollapsed = expandedFiles[file.filename] === false;
              return (
                <div
                  key={file.filename || fIdx}
                  data-testid="file-diff-item"
                  className="rounded-md border border-[#30363D] bg-[#0D1117] overflow-hidden"
                >
                  <div
                    onClick={() => toggleFileExpansion(file.filename)}
                    className="flex items-center justify-between px-3.5 py-2 bg-[#161B22] border-b border-[#21262D] cursor-pointer hover:bg-[#21262D]/60 transition-colors select-none text-xs"
                  >
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-[#7D8590] text-[10px]">{isCollapsed ? '▶' : '▼'}</span>
                      <span className="text-white font-semibold">{file.filename}</span>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-[#21262D] text-[#7D8590] border border-[#30363D]">
                        {file.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="text-[#3FB950] font-semibold">+{file.additions}</span>
                      <span className="text-[#F85149] font-semibold">-{file.deletions}</span>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="font-mono text-xs overflow-x-auto divide-y divide-[#21262D]/40">
                      {file.lines && file.lines.length > 0 ? (
                        file.lines.map((line, lIdx) => {
                          const isAdd = line.type === 'addition';
                          const isDel = line.type === 'deletion';
                          return (
                            <div
                              key={lIdx}
                              data-testid={
                                isAdd
                                  ? 'diff-line-addition'
                                  : isDel
                                    ? 'diff-line-deletion'
                                    : undefined
                              }
                              className={`flex items-start px-3 py-0.5 text-[11px] leading-5 ${
                                isAdd
                                  ? 'bg-[#238636]/15 text-[#3FB950]'
                                  : isDel
                                    ? 'bg-[#DA3633]/15 text-[#F85149]'
                                    : 'text-[#E6EDF3] hover:bg-[#161B22]'
                              }`}
                            >
                              <span className="w-10 text-right pr-3 select-none text-[#7D8590]/50 shrink-0">
                                {line.oldLineNumber || ''}
                              </span>
                              <span className="w-10 text-right pr-3 select-none text-[#7D8590]/50 shrink-0">
                                {line.newLineNumber || ''}
                              </span>
                              <span className="w-4 select-none shrink-0 font-bold">
                                {isAdd ? '+' : isDel ? '-' : ' '}
                              </span>
                              <pre className="flex-1 font-mono whitespace-pre overflow-x-auto">
                                {line.content.replace(/^[+-]/, '')}
                              </pre>
                            </div>
                          );
                        })
                      ) : (
                        <div className="px-4 py-3 text-[#7D8590] italic">
                          Binary file or no syntax diff hunks available.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Commit History Timeline Grouped by Date */}
      <div data-testid="commits-timeline" className="space-y-6">
        {Object.keys(groupedCommits).length === 0 ? (
          <div className="text-center py-12 border border-[#30363D] rounded-lg bg-[#161B22] p-8 text-[#7D8590]">
            <p className="text-sm font-semibold text-white">No commits found</p>
            <p className="text-xs mt-1">Try adjusting your branch or search filter.</p>
          </div>
        ) : (
          Object.entries(groupedCommits).map(([dateGroup, items]) => (
            <div key={dateGroup} className="space-y-3">
              {/* Date Group Header */}
              <div
                data-testid="date-group-header"
                className="flex items-center gap-2 text-xs font-semibold text-[#7D8590]"
              >
                <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                  <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
                </svg>
                <span>{dateGroup}</span>
              </div>

              {/* Commits Container Box */}
              <div className="rounded-lg border border-[#30363D] bg-[#161B22] divide-y divide-[#21262D] overflow-hidden text-xs">
                {items.map((commit) => {
                  const shortSha = commit.shortSha || commit.sha.slice(0, 7);
                  const isExpanded = expandedCommitSha === commit.sha;
                  const authorInitial = commit.author.name
                    ? commit.author.name.charAt(0).toUpperCase()
                    : 'K';

                  return (
                    <div
                      key={commit.sha}
                      data-testid={`commit-item-${commit.sha}`}
                      onClick={() =>
                        setExpandedCommitSha((prev) => (prev === commit.sha ? null : commit.sha))
                      }
                      className={`p-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isExpanded
                          ? 'bg-[#21262D]/70 border-l-4 border-l-[#58A6FF]'
                          : 'hover:bg-[#21262D]/40'
                      }`}
                    >
                      {/* Left: Message & Author Metadata */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            data-testid="commit-message"
                            className="font-bold text-white hover:text-[#58A6FF] transition-colors truncate max-w-xl text-sm"
                            title={commit.message}
                          >
                            {commit.message}
                          </span>

                          {commit.body && (
                            <span className="text-[#7D8590] text-[11px] px-1 rounded bg-[#21262D] border border-[#30363D]">
                              ...
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-[#7D8590] flex-wrap">
                          {/* Author Avatar Pill */}
                          <div className="flex items-center gap-1.5">
                            {commit.author.avatarUrl ? (
                              <img
                                src={commit.author.avatarUrl}
                                alt={commit.author.name}
                                className="w-4 h-4 rounded-full"
                              />
                            ) : (
                              <span className="w-4 h-4 rounded-full bg-[#FF8C42] text-black font-bold flex items-center justify-center text-[9px] shrink-0">
                                {authorInitial}
                              </span>
                            )}
                            <span className="font-semibold text-[#E6EDF3]">
                              {commit.author.name}
                            </span>
                          </div>

                          <span>committed</span>
                          <span title={commit.date}>{commit.relativeTime}</span>

                          {/* Stats Preview */}
                          {commit.stats && (
                            <span className="hidden md:inline text-[11px] text-[#7D8590]">
                              · {commit.stats.totalFiles} files (
                              <span className="text-[#3FB950]">+{commit.stats.additions}</span>{' '}
                              <span className="text-[#F85149]">-{commit.stats.deletions}</span>)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Badges & Action Controls */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Verified Commit Badge */}
                        {commit.verified && (
                          <span
                            data-testid="verified-badge"
                            className="px-2 py-0.5 rounded-full border border-[#238636] text-[#3FB950] bg-[#238636]/10 text-[10px] font-bold flex items-center gap-1"
                            title={commit.verificationReason || 'GPG signature verified'}
                          >
                            <span>✓</span> Verified
                          </span>
                        )}

                        {/* 7-Character Commit SHA Badge with 1-Click Clipboard Copy */}
                        <div className="flex items-center rounded border border-[#30363D] bg-[#0D1117] overflow-hidden">
                          <button
                            type="button"
                            data-testid={`copy-sha-btn-${commit.sha}`}
                            onClick={(e) => handleCopySha(commit.sha, e)}
                            className="px-2.5 py-1 font-mono text-xs font-semibold text-[#58A6FF] hover:bg-[#21262D] hover:underline transition-colors flex items-center gap-1"
                            title={`Click to copy SHA: ${commit.sha}`}
                          >
                            <span>{shortSha}</span>
                            <span className="text-[10px] text-[#7D8590]">
                              {copiedSha === commit.sha ? '✓' : '📋'}
                            </span>
                          </button>
                        </div>

                        {/* Browse Code at this Commit Button (< >) */}
                        <button
                          type="button"
                          data-testid={`browse-code-btn-${commit.sha}`}
                          onClick={(e) => handleBrowseCode(commit, e)}
                          className="p-1.5 rounded-md border border-[#30363D] bg-[#21262D] text-[#7D8590] hover:text-white hover:border-[#58A6FF] transition-colors"
                          title={`Browse repository at ${shortSha}`}
                        >
                          <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                            <path d="M4.72 3.22a.75.75 0 0 1 1.06 1.06L2.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25Zm6.56 0a.75.75 0 1 0-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06l4.25-4.25a.75.75 0 0 0 0-1.06l-4.25-4.25Z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
