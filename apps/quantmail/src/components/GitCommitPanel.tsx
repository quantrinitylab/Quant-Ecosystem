'use client';

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import type { ComponentType } from 'react';
import {
  IconArrowRight,
  IconArrowUp,
  IconCheck,
  IconCheckCircle,
  IconDot,
  IconMinus,
  IconPlus,
  IconUndo,
  type IconProps,
} from './icons';

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

/**
 * Status glyphs are components, and `label` is now rendered as each glyph's
 * accessible name rather than sitting unused: the four states were previously
 * told apart by colour and a bare character, which leaves a screen reader
 * announcing a bullet and a colour-blind reader guessing between modified and
 * renamed.
 */
const STATUS_CONFIG: Record<
  ChangedFile['status'],
  { Icon: ComponentType<IconProps>; color: string; label: string }
> = {
  added: { Icon: IconPlus, color: '#4ade80', label: 'Added' },
  modified: { Icon: IconDot, color: '#fbbf24', label: 'Modified' },
  deleted: { Icon: IconMinus, color: '#f87171', label: 'Deleted' },
  renamed: { Icon: IconArrowRight, color: '#60a5fa', label: 'Renamed' },
};

/**
 * Git Commit Panel — stage files, write commit message, commit, and push.
 * Built into the IDE. No need for terminal git commands.
 * Like VS Code's Source Control panel but better.
 */
export function GitCommitPanel({ changedFiles, onCommit, onPush, onDiscard }: GitCommitPanelProps) {
  const [message, setMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(
    new Set(changedFiles.map((f) => f.path)),
  );
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
        <IconCheckCircle size={18} />
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
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void handleCommit();
          }}
          rows={2}
        />
        <div className="git-commit-actions">
          <button
            type="button"
            className="git-commit-btn"
            onClick={handleCommit}
            disabled={isCommitting || !message.trim() || selectedFiles.size === 0}
          >
            {isCommitting ? (
              'Committing...'
            ) : (
              <>
                <IconCheck size={12} />
                Commit
              </>
            )}
          </button>
          {lastCommit && (
            <button
              type="button"
              className="git-push-btn"
              onClick={handlePush}
              disabled={isPushing}
            >
              {isPushing ? (
                'Pushing...'
              ) : (
                <>
                  <IconArrowUp size={12} />
                  Push
                </>
              )}
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
              {/* The 44px target lives on the label, not the box: a native
                  checkbox keeps its own look and the whole pad still toggles it,
                  and the label finally gives the input an accessible name. */}
              <label className="git-file-check-hit">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleFile(file.path)}
                  className="git-file-check"
                />
                <span className="sr-only">{`Stage ${file.path}`}</span>
              </label>
              <span className="git-file-status" style={{ color: config.color }}>
                <config.Icon size={12} role="img" aria-hidden={false} aria-label={config.label} />
              </span>
              <span className="git-file-path">{file.path}</span>
              <span className="git-file-diff">
                {file.additions > 0 && <span className="git-diff-add">+{file.additions}</span>}
                {file.deletions > 0 && <span className="git-diff-del">-{file.deletions}</span>}
              </span>
              <button
                type="button"
                className="git-file-discard"
                onClick={() => onDiscard(file.path)}
                title="Discard changes"
                aria-label={`Discard changes in ${file.path}`}
              >
                <IconUndo size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
