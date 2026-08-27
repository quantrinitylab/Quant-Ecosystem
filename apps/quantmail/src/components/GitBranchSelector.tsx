'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface Branch {
  name: string;
  isDefault: boolean;
  isProtected: boolean;
  lastCommit?: string;
  aheadBehind?: { ahead: number; behind: number };
}

interface GitBranchSelectorProps {
  branches: Branch[];
  currentBranch: string;
  onSwitchBranch: (branch: string) => void;
  onCreateBranch: (name: string) => void;
}

/**
 * Git Branch Selector — switch branches from the editor.
 * GitHub has this in the repo page. We bring it into the IDE
 * with create, switch, and ahead/behind indicators.
 */
export function GitBranchSelector({
  branches,
  currentBranch,
  onSwitchBranch,
  onCreateBranch,
}: GitBranchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const filtered = branches.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()));

  const handleCreate = useCallback(() => {
    if (!newBranchName.trim()) return;
    onCreateBranch(newBranchName.trim());
    setNewBranchName('');
    setShowCreate(false);
    setIsOpen(false);
  }, [newBranchName, onCreateBranch]);

  return (
    <div className="git-branch-selector">
      <button type="button" className="branch-current" onClick={() => setIsOpen((v) => !v)}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="w-3.5 h-3.5"
        >
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
        <span>{currentBranch}</span>
        <span className="branch-chevron">{isOpen ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="branch-dropdown"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            <div className="branch-search">
              <input
                type="search"
                placeholder="Find or create branch..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                autoFocus
              />
            </div>
            <div className="branch-list">
              {filtered.map((branch) => (
                <button
                  key={branch.name}
                  type="button"
                  className={`branch-item ${branch.name === currentBranch ? 'is-current' : ''}`}
                  onClick={() => {
                    onSwitchBranch(branch.name);
                    setIsOpen(false);
                  }}
                >
                  <span className="branch-name">{branch.name}</span>
                  {branch.isDefault && <span className="branch-badge">default</span>}
                  {branch.isProtected && (
                    <span className="branch-badge branch-badge--protected" title="Protected branch">
                      <svg
                        className="size-3 text-[#FF8C42]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                  )}
                  {branch.aheadBehind &&
                    (branch.aheadBehind.ahead > 0 || branch.aheadBehind.behind > 0) && (
                      <span className="branch-ahead-behind">
                        {branch.aheadBehind.ahead > 0 && (
                          <span className="branch-ahead">↑{branch.aheadBehind.ahead}</span>
                        )}
                        {branch.aheadBehind.behind > 0 && (
                          <span className="branch-behind">↓{branch.aheadBehind.behind}</span>
                        )}
                      </span>
                    )}
                  {branch.name === currentBranch && (
                    <span className="branch-check">
                      <svg
                        className="size-3.5 text-[#FF8C42]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
              {filtered.length === 0 && filter && (
                <button
                  type="button"
                  className="branch-create-inline"
                  onClick={() => {
                    setShowCreate(true);
                    setNewBranchName(filter);
                  }}
                >
                  Create branch "{filter}"
                </button>
              )}
            </div>
            {!showCreate && (
              <button
                type="button"
                className="branch-create-btn"
                onClick={() => setShowCreate(true)}
              >
                + New branch
              </button>
            )}
            {showCreate && (
              <div className="branch-create-form">
                <input
                  type="text"
                  placeholder="new-branch-name"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
                <button type="button" onClick={handleCreate}>
                  Create
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
