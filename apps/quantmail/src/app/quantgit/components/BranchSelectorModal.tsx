'use client';

// ============================================================================
// QuantGit — Interactive Branch & Tag Selector Modal (GitHub Screens 108–110)
// ============================================================================

import React, { useState, useMemo } from 'react';

export interface BranchSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBranch: string;
  branches: string[];
  tags: string[];
  defaultBranch?: string;
  onSelectBranch: (branch: string) => void;
  onSelectTag: (tag: string) => void;
}

export const BranchSelectorModal: React.FC<BranchSelectorModalProps> = ({
  isOpen,
  onClose,
  currentBranch,
  branches,
  tags,
  defaultBranch = 'main',
  onSelectBranch,
  onSelectTag,
}) => {
  const [activeTab, setActiveTab] = useState<'branches' | 'tags'>('branches');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBranches = useMemo(() => {
    if (!searchQuery.trim()) return branches;
    const q = searchQuery.toLowerCase();
    return branches.filter((b) => b.toLowerCase().includes(q));
  }, [branches, searchQuery]);

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return tags;
    const q = searchQuery.toLowerCase();
    return tags.filter((t) => t.toLowerCase().includes(q));
  }, [tags, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-sm rounded-xl bg-[#161B22] border border-[#30363D] shadow-2xl overflow-hidden z-10 flex flex-col text-sm text-[#E6EDF3] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363D]">
          <span className="font-semibold text-xs text-[#E6EDF3] tracking-wide">
            Switch branches/tags
          </span>
          <button
            onClick={onClose}
            className="text-[#8D96A0] hover:text-[#E6EDF3] p-1 rounded-md transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div className="p-3 border-b border-[#30363D]">
          <div className="relative flex items-center">
            <svg
              className="absolute left-3 w-4 h-4 text-[#8D96A0]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === 'branches' ? 'Find a branch...' : 'Find a tag...'}
              className="w-full bg-[#0D1117] border border-[#30363D] focus:border-[#58A6FF] focus:ring-1 focus:ring-[#58A6FF] rounded-md py-1.5 pl-9 pr-3 text-xs text-[#E6EDF3] placeholder-[#8D96A0] outline-none transition-all"
              autoFocus
            />
          </div>
        </div>

        {/* Tabs: Branches vs Tags */}
        <div className="flex border-b border-[#30363D] bg-[#0D1117]">
          <button
            onClick={() => setActiveTab('branches')}
            className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition-colors ${
              activeTab === 'branches'
                ? 'border-[#F78166] text-[#E6EDF3]'
                : 'border-transparent text-[#8D96A0] hover:text-[#E6EDF3]'
            }`}
          >
            Branches ({branches.length})
          </button>
          <button
            onClick={() => setActiveTab('tags')}
            className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition-colors ${
              activeTab === 'tags'
                ? 'border-[#F78166] text-[#E6EDF3]'
                : 'border-transparent text-[#8D96A0] hover:text-[#E6EDF3]'
            }`}
          >
            Tags ({tags.length})
          </button>
        </div>

        {/* Items List */}
        <div className="max-h-72 overflow-y-auto divide-y divide-[#21262D]">
          {activeTab === 'branches' ? (
            filteredBranches.length > 0 ? (
              filteredBranches.map((branch) => {
                const isSelected = branch === currentBranch;
                const isDefault = branch === defaultBranch;
                return (
                  <button
                    key={branch}
                    onClick={() => {
                      onSelectBranch(branch);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#1C2128] transition-colors text-left ${
                      isSelected ? 'bg-[#1F242C]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-4 flex items-center justify-center">
                        {isSelected && (
                          <svg
                            className="w-3.5 h-3.5 text-[#58A6FF]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                      <span className="text-xs font-medium text-[#E6EDF3] truncate">{branch}</span>
                    </div>
                    {isDefault && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[#30363D] text-[#8D96A0] font-mono">
                        default
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="p-6 text-center text-xs text-[#8D96A0]">
                No branches match "{searchQuery}"
              </div>
            )
          ) : filteredTags.length > 0 ? (
            filteredTags.map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  onSelectTag(tag);
                  onClose();
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-[#1C2128] transition-colors text-left"
              >
                <svg
                  className="w-3.5 h-3.5 text-[#8D96A0]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                  />
                </svg>
                <span className="text-xs font-medium text-[#E6EDF3] truncate">{tag}</span>
              </button>
            ))
          ) : (
            <div className="p-6 text-center text-xs text-[#8D96A0]">
              No tags match "{searchQuery}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#0D1117] border-t border-[#30363D] text-center">
          <span className="text-xs text-[#58A6FF] hover:underline cursor-pointer">
            {activeTab === 'branches' ? 'View all branches' : 'View all tags'}
          </span>
        </div>
      </div>
    </div>
  );
};
