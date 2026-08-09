'use client';

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';

interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

interface GitCommitPanelProps {
  changedFiles: ChangedFile[];
  onCommit: (message: string, files: string[]) => Promise<void>;
  onPush: () => Promise<void>;
  onDiscard: (file: string) => void;
}

const STATUS_CONFIG = {
  added: { icon: '+', color: '#4ade80', label: 'Added' },
  modified: { icon: '●', color: '#fbbf24', label: 'Modified' },
  deleted: { icon: '-', color: '#f87171', label: 'Deleted' },
  renamed: { icon: '→', color: '#60a5fa', label: 'Renamed' },
};

/**
 * Git Commit Panel — stage files, write commit message, commit, and push.
 * Built into the IDE. No need for terminal git commands.
 * Like VS Code's Source Control panel but better.
 */
export function GitCommitPanel({ changedFiles, onCommit, onPush, onDiscard }: GitCommitPanelProps) {
  const [message, setMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set(changedFiles.map((f) => f.path)));
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [lastCommit, setLastCommit] = useState<string | null>(null);

  const toggleFile = useCallback((path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleCommit = useCallback(async () => {
    if (!message.trim() || selectedFiles.size === 0) return;
    setIsCommitting(true);
    try {
      await onCommit(message, Array.from(selectedFiles));
      setLastCommit(message);
      setMessage('');
    } finally {
      setIsCommitting(false);
    }
  }, [message, selectedFiles, onCommit]);

  const handlePush = useCallback(async () => {
    setIsPushing(true);
    try {
      await onPush();
    } finally {
      setIsPushing(false);
    }
  }, [onPush]);

  if (changedFiles.length === 0 && !lastCommit) {
    return (
      <div className="git-panel-empty">
        <span>✓</span>
        <p>Working tree clean</p>
      </div>
    );
  }

  return (
    <div className="git-commit-panel">
      <header className="git-panel-header">
        <span className="git-panel-title">Source Control</span>
        <span className="git-panel-count">{changedFiles.length} changes</span>
      </header>

      {/* Commit message */}
      <div className="git-commit-input">
        <textarea
          placeholder="Commit message (Ctrl+Enter to commit)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void handleCommit(); }}
          rows={2}
        />
        <div className="git-commit-actions">
          <button type="button" className="git-commit-btn" onClick={handleCommit} disabled={isCommitting || !message.trim() || selectedFiles.size === 0}>
            {isCommitting ? 'Committing...' : '✓ Commit'}
          </button>
          {lastCommit && (
            <button type="button" className="git-push-btn" onClick={handlePush} disabled={isPushing}>
              {isPushing ? 'Pushing...' : '↑ Push'}
            </button>
          )}
        </div>
      </div>

      {/* Changed files */}
      <div className="git-file-list">
        {changedFiles.map((file) => {
          const config = STATUS_CONFIG[file.status];
          const isSelected = selectedFiles.has(file.path);
          return (
            <div key={file.path} className={`git-file-item ${isSelected ? 'is-staged' : ''}`}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleFile(file.path)}
                className="git-file-check"
              />
              <span className="git-file-status" style={{ color: config.color }}>{config.icon}</span>
              <span className="git-file-path">{file.path}</span>
              <span className="git-file-diff">
                {file.additions > 0 && <span className="git-diff-add">+{file.additions}</span>}
                {file.deletions > 0 && <span className="git-diff-del">-{file.deletions}</span>}
              </span>
              <button type="button" className="git-file-discard" onClick={() => onDiscard(file.path)} title="Discard changes">
                ↺
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
