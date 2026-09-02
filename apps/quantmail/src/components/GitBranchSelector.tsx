'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SearchClearButton } from './SearchClearButton';
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconGitBranch,
  IconLock,
} from './icons';

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
      <button
        type="button"
        className="branch-current"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-label={`Current branch ${currentBranch}. Switch branch`}
      >
        <IconGitBranch size={14} />
        <span>{currentBranch}</span>
        <span className="branch-chevron">
          {isOpen ? <IconChevronUp size={11} /> : <IconChevronDown size={11} />}
        </span>
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
            <div className="branch-search quant-filter-field">
              <input
                type="search"
                placeholder="Find or create branch..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                autoFocus
              />
              {filter && <SearchClearButton onClear={() => setFilter('')} label="Clear filter" />}
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
                      <IconLock size={11} className="text-[#FF8C42]" />
                    </span>
                  )}
                  {branch.aheadBehind &&
                    (branch.aheadBehind.ahead > 0 || branch.aheadBehind.behind > 0) && (
                      <span className="branch-ahead-behind">
                        {branch.aheadBehind.ahead > 0 && (
                          <span
                            className="branch-ahead"
                            title={`${branch.aheadBehind.ahead} commits ahead`}
                          >
                            <IconArrowUp size={10} />
                            {branch.aheadBehind.ahead}
                          </span>
                        )}
                        {branch.aheadBehind.behind > 0 && (
                          <span
                            className="branch-behind"
                            title={`${branch.aheadBehind.behind} commits behind`}
                          >
                            <IconArrowDown size={10} />
                            {branch.aheadBehind.behind}
                          </span>
                        )}
                      </span>
                    )}
                  {branch.name === currentBranch && (
                    <span className="branch-check">
                      <IconCheck size={13} className="text-[#FF8C42]" />
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
