'use client';

import React, { useState, useMemo } from 'react';
import type { Repo, BranchItem } from '../types';
import { INITIAL_BRANCHES } from '../constants';

export interface BranchesTabProps {
  repo: Repo;
  branches?: BranchItem[];
  defaultBranch?: string;
  currentBranch?: string;
  onSelectBranch?: (branch: string) => void;
  onCreateBranch?: (name: string, sourceBranch: string) => Promise<void> | void;
  onDeleteBranch?: (name: string) => Promise<void> | void;
  showToast?: (msg: string) => void;
}

export function BranchesTab({
  repo,
  branches: initialBranches,
  defaultBranch: propDefaultBranch,
  currentBranch,
  onSelectBranch,
  onCreateBranch,
  onDeleteBranch,
  showToast = () => {},
}: BranchesTabProps) {
  const defaultBranch = propDefaultBranch || repo.defaultBranch || 'main';
  const [branchList, setBranchList] = useState<BranchItem[]>(
    initialBranches && initialBranches.length > 0 ? initialBranches : INITIAL_BRANCHES,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewBranchModalOpen, setIsNewBranchModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [sourceBranch, setSourceBranch] = useState(defaultBranch);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'all'>('overview');

  // Filter branches by search query
  const filteredBranches = useMemo(() => {
    if (!searchQuery.trim()) return branchList;
    const q = searchQuery.toLowerCase().trim();
    return branchList.filter((b) => b.name.toLowerCase().includes(q));
  }, [branchList, searchQuery]);

  const defaultBranchItem = useMemo(() => {
    return (
      branchList.find((b) => b.name === defaultBranch || b.isDefault) || {
        name: defaultBranch,
        sha: repo.latestCommitSha || 'c4e6121',
        isDefault: true,
        isProtected: true,
        protection: 'require_reviews',
        aheadBy: 0,
        behindBy: 0,
        lastCommitAuthor: 'kundansinghrajput31980',
        lastCommitMessage: repo.latestCommit || 'Initial commit',
        lastCommitTime: repo.latestCommitTime || 'recently',
      }
    );
  }, [branchList, defaultBranch, repo]);

  const activeBranches = useMemo(() => {
    return filteredBranches.filter((b) => b.name !== defaultBranchItem.name);
  }, [filteredBranches, defaultBranchItem]);

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newBranchName.trim();
    if (!trimmed) {
      showToast('Please enter a branch name');
      return;
    }

    if (branchList.some((b) => b.name.toLowerCase() === trimmed.toLowerCase())) {
      showToast('A branch with this name already exists');
      return;
    }

    setIsSubmitting(true);
    try {
      if (onCreateBranch) {
        await onCreateBranch(trimmed, sourceBranch);
      }

      const newBranch: BranchItem = {
        name: trimmed,
        sha: '948e3612a1b2c3d4e5f60718293a4b5c6d7e8f90',
        isDefault: false,
        isProtected: false,
        protection: 'none',
        aheadBy: 0,
        behindBy: 0,
        lastCommitAuthor: 'kundansinghrajput31980',
        lastCommitMessage: `Branch created from ${sourceBranch}`,
        lastCommitTime: 'just now',
      };

      setBranchList((prev) => [...prev, newBranch]);
      setNewBranchName('');
      setIsNewBranchModalOpen(false);
      showToast(`Branch "${trimmed}" created successfully!`);
    } catch {
      showToast('Failed to create branch');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBranch = async (name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (name === defaultBranchItem.name) {
      showToast('Cannot delete the default branch');
      return;
    }

    try {
      if (onDeleteBranch) {
        await onDeleteBranch(name);
      }
      setBranchList((prev) => prev.filter((b) => b.name !== name));
      showToast(`Deleted branch "${name}"`);
    } catch {
      showToast(`Failed to delete branch "${name}"`);
    }
  };

  return (
    <div data-testid="branches-tab" className="space-y-6">
      {/* 1. Header Toolbar: Search Filter & "+ New branch" Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#161B22] border border-[#30363D] rounded-lg p-3.5 text-xs">
        <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-md">
          <div className="relative w-full">
            <input
              type="text"
              data-testid="branch-search-input"
              placeholder="Filter branches..."
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

        <div className="flex items-center gap-2">
          {/* Sub-Tabs: Overview vs All */}
          <div className="hidden sm:flex rounded-md border border-[#30363D] bg-[#0D1117] p-0.5">
            <button
              type="button"
              onClick={() => setActiveSubTab('overview')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                activeSubTab === 'overview'
                  ? 'bg-[#21262D] text-white'
                  : 'text-[#7D8590] hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('all')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                activeSubTab === 'all'
                  ? 'bg-[#21262D] text-white'
                  : 'text-[#7D8590] hover:text-white'
              }`}
            >
              All branches ({branchList.length})
            </button>
          </div>

          {/* "+ New branch" Action Button */}
          <button
            type="button"
            data-testid="new-branch-btn"
            onClick={() => setIsNewBranchModalOpen(true)}
            className="px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            + New branch
          </button>
        </div>
      </div>

      {/* 2. Default Branch Card with Protected Badge */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#7D8590] px-1">
          Default branch
        </h3>

        <div
          data-testid="default-branch-card"
          className="rounded-lg border border-[#30363D] bg-[#161B22] p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-3">
            <svg height="16" viewBox="0 0 16 16" width="16" fill="#58A6FF" className="shrink-0">
              <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
            </svg>

            <div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelectBranch?.(defaultBranchItem.name);
                    showToast(`Switched to default branch: ${defaultBranchItem.name}`);
                  }}
                  className="font-bold text-white text-sm hover:text-[#58A6FF] hover:underline transition-colors font-mono"
                >
                  {defaultBranchItem.name}
                </button>

                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#58A6FF]/20 text-[#58A6FF] border border-[#58A6FF]/40">
                  default
                </span>

                {defaultBranchItem.isProtected && (
                  <span
                    data-testid="protected-branch-badge"
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#A371F7]/20 text-[#D2A8FF] border border-[#A371F7]/40 flex items-center gap-1"
                    title="Protected branch — requires pull request reviews before merging"
                  >
                    <span>🛡️</span> Protected
                  </span>
                )}
              </div>

              <div className="text-[#7D8590] mt-1 text-[11px] flex items-center gap-2">
                <span>
                  Updated {defaultBranchItem.lastCommitTime || 'recently'} by{' '}
                  <strong className="text-white">
                    {defaultBranchItem.lastCommitAuthor || 'kundansinghrajput31980'}
                  </strong>
                </span>
                {defaultBranchItem.lastCommitMessage && (
                  <span
                    className="truncate max-w-xs text-[#7D8590] hidden md:inline"
                    title={defaultBranchItem.lastCommitMessage}
                  >
                    · {defaultBranchItem.lastCommitMessage}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              data-testid={`delete-branch-btn-${defaultBranchItem.name}`}
              className="p-1.5 rounded-md border border-[#30363D] bg-[#21262D] text-[#7D8590]/40 cursor-not-allowed text-xs font-semibold"
              title="The default branch cannot be deleted"
            >
              <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a1.75 1.75 0 0 0 1.744 1.475h2.2a1.75 1.75 0 0 0 1.744-1.475l.66-6.6a.75.75 0 1 0-1.492-.15l-.66 6.6a.25.25 0 0 1-.25.21H6.9a.25.25 0 0 1-.25-.21l-.66-6.6a.75.75 0 0 0-1.494.15Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Active Branches List with Ahead/Behind Indicators */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#7D8590] px-1 flex items-center justify-between">
          <span>Active branches ({activeBranches.length})</span>
          <span className="text-[11px] font-normal normal-case text-[#7D8590]">
            Comparing against <strong className="text-white">{defaultBranchItem.name}</strong>
          </span>
        </h3>

        <div
          data-testid="active-branches-list"
          className="rounded-lg border border-[#30363D] bg-[#161B22] divide-y divide-[#21262D] overflow-hidden text-xs"
        >
          {activeBranches.length === 0 ? (
            <div className="p-8 text-center text-[#7D8590]">
              <p className="text-sm font-semibold text-white">
                No active branches match your filter
              </p>
              <p className="text-xs mt-1">Try a different search query or create a new branch.</p>
            </div>
          ) : (
            activeBranches.map((branch) => (
              <div
                key={branch.name}
                data-testid={`branch-row-${branch.name}`}
                className="p-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-[#21262D]/40 transition-colors"
              >
                {/* Branch Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <svg
                    height="16"
                    viewBox="0 0 16 16"
                    width="16"
                    fill="#7D8590"
                    className="shrink-0"
                  >
                    <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
                  </svg>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectBranch?.(branch.name);
                          showToast(`Switched to branch: ${branch.name}`);
                        }}
                        className="font-bold text-[#58A6FF] hover:underline font-mono text-xs sm:text-sm truncate max-w-xs"
                      >
                        {branch.name}
                      </button>

                      {branch.isProtected && (
                        <span
                          data-testid="protected-branch-badge"
                          className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#A371F7]/20 text-[#D2A8FF] border border-[#A371F7]/40 flex items-center gap-1"
                        >
                          🛡️ Protected
                        </span>
                      )}
                    </div>

                    <div className="text-[#7D8590] mt-0.5 text-[11px] flex items-center gap-2 truncate">
                      <span>
                        Updated {branch.lastCommitTime || 'recently'} by{' '}
                        <strong className="text-white">
                          {branch.lastCommitAuthor || 'Developer 6'}
                        </strong>
                      </span>
                      {branch.lastCommitMessage && (
                        <span
                          className="truncate max-w-sm hidden md:inline text-[#7D8590]"
                          title={branch.lastCommitMessage}
                        >
                          · {branch.lastCommitMessage}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Behind / Ahead Indicator & Delete Action */}
                <div className="flex items-center gap-3 shrink-0">
                  <div
                    data-testid="behind-ahead-indicator"
                    className="flex items-center gap-1 text-[11px] font-mono bg-[#0D1117] px-2.5 py-1 rounded-md border border-[#30363D]"
                    title={`${branch.behindBy} commits behind, ${branch.aheadBy} commits ahead of ${defaultBranchItem.name}`}
                  >
                    <span
                      className={
                        branch.behindBy > 0 ? 'text-[#F85149] font-bold' : 'text-[#7D8590]'
                      }
                    >
                      behind {branch.behindBy}
                    </span>
                    <span className="text-[#30363D]">/</span>
                    <span
                      className={branch.aheadBy > 0 ? 'text-[#3FB950] font-bold' : 'text-[#7D8590]'}
                    >
                      ahead {branch.aheadBy}
                    </span>
                  </div>

                  {/* Delete branch button (enabled for non-default branch) */}
                  <button
                    type="button"
                    data-testid={`delete-branch-btn-${branch.name}`}
                    onClick={(e) => handleDeleteBranch(branch.name, e)}
                    className="p-1.5 rounded-md border border-[#30363D] bg-[#21262D] text-[#7D8590] hover:text-[#F85149] hover:border-[#F85149]/40 hover:bg-[#F85149]/10 transition-colors"
                    title={`Delete branch ${branch.name}`}
                  >
                    <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                      <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a1.75 1.75 0 0 0 1.744 1.475h2.2a1.75 1.75 0 0 0 1.744-1.475l.66-6.6a.75.75 0 1 0-1.492-.15l-.66 6.6a.25.25 0 0 1-.25.21H6.9a.25.25 0 0 1-.25-.21l-.66-6.6a.75.75 0 0 0-1.494.15Z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 4. "+ New branch" Modal Dialog */}
      {isNewBranchModalOpen && (
        <div
          data-testid="new-branch-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-[#30363D] bg-[#161B22] p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <span>🌱</span> Create a branch
              </h3>
              <button
                type="button"
                onClick={() => setIsNewBranchModalOpen(false)}
                className="text-[#7D8590] hover:text-white text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBranch} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-white block">Branch name</label>
                <input
                  type="text"
                  data-testid="new-branch-input"
                  placeholder="e.g. feat/new-authentication"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  autoFocus
                  required
                  className="w-full bg-[#0D1117] border border-[#30363D] rounded-md px-3 py-2 text-xs text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF] font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-white block">Source branch</label>
                <select
                  data-testid="source-branch-select"
                  value={sourceBranch}
                  onChange={(e) => setSourceBranch(e.target.value)}
                  className="w-full bg-[#0D1117] border border-[#30363D] rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-[#58A6FF] cursor-pointer font-mono"
                >
                  {branchList.map((b) => (
                    <option key={b.name} value={b.name} className="bg-[#161B22] text-[#E6EDF3]">
                      {b.name} {b.name === defaultBranchItem.name ? '(default)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#21262D]">
                <button
                  type="button"
                  onClick={() => setIsNewBranchModalOpen(false)}
                  className="px-3 py-1.5 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] font-semibold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newBranchName.trim()}
                  data-testid="create-branch-confirm-btn"
                  className="px-4 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] disabled:opacity-50 text-white font-bold text-xs transition-colors"
                >
                  {isSubmitting ? 'Creating...' : 'Create branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
