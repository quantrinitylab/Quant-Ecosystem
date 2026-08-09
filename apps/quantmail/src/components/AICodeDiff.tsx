'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  lineNumber: { old?: number; new?: number };
}

interface AICodeDiffProps {
  originalCode: string;
  modifiedCode: string;
  filename: string;
  onAccept: () => void;
  onReject: () => void;
}

/**
 * AI Code Diff Viewer — shows proposed changes from AI in a GitHub-style diff.
 * When AI suggests code changes, this shows the before/after diff so the developer
 * can review and accept/reject (like a PR review for AI suggestions).
 */
export function AICodeDiff({ originalCode, modifiedCode, filename, onAccept, onReject }: AICodeDiffProps) {
  const diffLines = useMemo(() => computeDiff(originalCode, modifiedCode), [originalCode, modifiedCode]);
  
  const stats = useMemo(() => {
    const adds = diffLines.filter((l) => l.type === 'add').length;
    const removes = diffLines.filter((l) => l.type === 'remove').length;
    return { adds, removes };
  }, [diffLines]);

  return (
    <motion.div
      className="ai-code-diff"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <header className="diff-header">
        <div className="diff-file-info">
          <span className="diff-filename">{filename}</span>
          <span className="diff-stats">
            <span className="diff-adds">+{stats.adds}</span>
            <span className="diff-removes">-{stats.removes}</span>
          </span>
        </div>
        <div className="diff-actions">
          <button type="button" className="diff-reject" onClick={onReject}>
            ✕ Reject
          </button>
          <button type="button" className="diff-accept" onClick={onAccept}>
            ✓ Accept changes
          </button>
        </div>
      </header>
      <div className="diff-body">
        {diffLines.map((line, idx) => (
          <div key={idx} className={`diff-line diff-line--${line.type}`}>
            <span className="diff-gutter">
              {line.type === 'remove' && line.lineNumber.old}
              {line.type === 'add' && ''}
              {line.type === 'context' && line.lineNumber.old}
            </span>
            <span className="diff-gutter">
              {line.type === 'add' && line.lineNumber.new}
              {line.type === 'remove' && ''}
              {line.type === 'context' && line.lineNumber.new}
            </span>
            <span className="diff-marker">
              {line.type === 'add' && '+'}
              {line.type === 'remove' && '-'}
              {line.type === 'context' && ' '}
            </span>
            <span className="diff-content">{line.content || ' '}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function computeDiff(original: string, modified: string): DiffLine[] {
  const oldLines = original.split('\n');
  const newLines = modified.split('\n');
  const result: DiffLine[] = [];
  
  let oldIdx = 0;
  let newIdx = 0;

  // Simple line-by-line diff (in production, use a proper diff algorithm like Myers)
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx >= oldLines.length) {
      // Remaining new lines are additions
      result.push({ type: 'add', content: newLines[newIdx], lineNumber: { new: newIdx + 1 } });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      // Remaining old lines are removals
      result.push({ type: 'remove', content: oldLines[oldIdx], lineNumber: { old: oldIdx + 1 } });
      oldIdx++;
    } else if (oldLines[oldIdx] === newLines[newIdx]) {
      // Same line
      result.push({ type: 'context', content: oldLines[oldIdx], lineNumber: { old: oldIdx + 1, new: newIdx + 1 } });
      oldIdx++;
      newIdx++;
    } else {
      // Different — show as remove + add
      result.push({ type: 'remove', content: oldLines[oldIdx], lineNumber: { old: oldIdx + 1 } });
      result.push({ type: 'add', content: newLines[newIdx], lineNumber: { new: newIdx + 1 } });
      oldIdx++;
      newIdx++;
    }
  }

  return result;
}
