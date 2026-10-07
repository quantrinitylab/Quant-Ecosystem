// ============================================================================
// QuantMail - Git Diff Viewer Component
// Side-by-side or unified mode, syntax colored additions/deletions, line numbers
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';

interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'header';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

interface DiffHunk {
  header: string;
  startOld: number;
  startNew: number;
  lines: DiffLine[];
}

interface FileDiff {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  isBinary: boolean;
  language?: string;
}

interface GitDiffProps {
  files: FileDiff[];
  mode?: 'unified' | 'split';
  onModeChange?: (mode: 'unified' | 'split') => void;
  onCommentClick?: (path: string, line: number) => void;
  expandLines?: number;
  showFileTree?: boolean;
  collapsedByDefault?: boolean;
}

interface FileExpansionState {
  [path: string]: boolean;
}

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  added: { text: 'Added', color: '#28a745' },
  modified: { text: 'Modified', color: '#ffc107' },
  deleted: { text: 'Deleted', color: '#dc3545' },
  renamed: { text: 'Renamed', color: '#17a2b8' },
  copied: { text: 'Copied', color: '#6f42c1' },
};

export const GitDiff: React.FC<GitDiffProps> = ({
  files,
  mode = 'unified',
  onModeChange,
  onCommentClick,
  expandLines = 3,
  showFileTree = true,
  collapsedByDefault = false
}) => {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>(mode);
  const [expandedFiles, setExpandedFiles] = useState<FileExpansionState>(() => {
    const initial: FileExpansionState = {};
    files.forEach(f => { initial[f.path] = !collapsedByDefault; });
    return initial;
  });
  const [hoveredLine, setHoveredLine] = useState<{ path: string; line: number } | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedContexts, setExpandedContexts] = useState<Set<string>>(new Set());

  const toggleFile = useCallback((path: string) => {
    setExpandedFiles(prev => ({ ...prev, [path]: !prev[path] }));
  }, []);

  const toggleViewMode = useCallback(() => {
    const newMode = viewMode === 'unified' ? 'split' : 'unified';
    setViewMode(newMode);
    if (onModeChange) onModeChange(newMode);
  }, [viewMode, onModeChange]);

  const expandContext = useCallback((key: string) => {
    setExpandedContexts(prev => new Set([...prev, key]));
  }, []);

  const totalStats = useMemo(() => ({
    additions: files.reduce((sum, f) => sum + f.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    filesChanged: files.length,
  }), [files]);

  const renderUnifiedDiff = useCallback((file: FileDiff) => {
    if (file.isBinary) {
      return <div className="binary-notice">Binary file not shown.</div>;
    }
    return (
      <div className="diff-unified">
        {file.hunks.map((hunk, hIdx) => (
          <div key={hIdx} className="diff-hunk-block">
            <div className="hunk-header-line">
              <span className="hunk-info">{hunk.header}</span>
            </div>
            {hunk.lines.map((line, lIdx) => {
              const lineKey = `${file.path}-${hIdx}-${lIdx}`;
              const isHovered = hoveredLine?.path === file.path && hoveredLine?.line === (line.newLineNumber || line.oldLineNumber || 0);
              return (
                <div
                  key={lIdx}
                  className={`diff-line diff-line-${line.type} ${isHovered ? 'hovered' : ''}`}
                  onMouseEnter={() => setHoveredLine({ path: file.path, line: line.newLineNumber || line.oldLineNumber || 0 })}
                  onMouseLeave={() => setHoveredLine(null)}
                >
                  <span className="line-num old-num">{line.oldLineNumber || ''}</span>
                  <span className="line-num new-num">{line.newLineNumber || ''}</span>
                  <span className="line-indicator">
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                  </span>
                  <span className="line-content">{line.content}</span>
                  {onCommentClick && isHovered && (
                    <button className="comment-btn" onClick={() => onCommentClick(file.path, line.newLineNumber || line.oldLineNumber || 0)} title="Add comment">+</button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }, [hoveredLine, onCommentClick]);

  const renderSplitDiff = useCallback((file: FileDiff) => {
    if (file.isBinary) {
      return <div className="binary-notice">Binary file not shown.</div>;
    }
    return (
      <div className="diff-split">
        {file.hunks.map((hunk, hIdx) => {
          const leftLines: (DiffLine | null)[] = [];
          const rightLines: (DiffLine | null)[] = [];
          let i = 0;
          while (i < hunk.lines.length) {
            const line = hunk.lines[i];
            if (line.type === 'context') {
              leftLines.push(line);
              rightLines.push(line);
              i++;
            } else if (line.type === 'removed') {
              leftLines.push(line);
              if (i + 1 < hunk.lines.length && hunk.lines[i + 1].type === 'added') {
                rightLines.push(hunk.lines[i + 1]);
                i += 2;
              } else {
                rightLines.push(null);
                i++;
              }
            } else if (line.type === 'added') {
              leftLines.push(null);
              rightLines.push(line);
              i++;
            } else {
              i++;
            }
          }
          return (
            <div key={hIdx} className="split-hunk">
              <div className="hunk-header-line"><span>{hunk.header}</span></div>
              {leftLines.map((leftLine, idx) => {
                const rightLine = rightLines[idx];
                return (
                  <div key={idx} className="split-row">
                    <div className={`split-side left ${leftLine?.type === 'removed' ? 'removed' : ''}`}>
                      <span className="line-num">{leftLine?.oldLineNumber || ''}</span>
                      <span className="line-content">{leftLine ? `${leftLine.type === 'removed' ? '-' : ' '} ${leftLine.content}` : ''}</span>
                    </div>
                    <div className={`split-side right ${rightLine?.type === 'added' ? 'added' : ''}`}>
                      <span className="line-num">{rightLine?.newLineNumber || ''}</span>
                      <span className="line-content">{rightLine ? `${rightLine.type === 'added' ? '+' : ' '} ${rightLine.content}` : ''}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }, []);

  return (
    <div className="git-diff-viewer">
      <div className="diff-toolbar">
        <div className="diff-stats">
          <span className="files-changed">{totalStats.filesChanged} files changed</span>
          <span className="additions-stat">+{totalStats.additions}</span>
          <span className="deletions-stat">-{totalStats.deletions}</span>
        </div>
        <div className="diff-controls">
          <button onClick={toggleViewMode} className="mode-toggle">
            {viewMode === 'unified' ? 'Split View' : 'Unified View'}
          </button>
          <button onClick={() => setExpandedFiles(Object.fromEntries(files.map(f => [f.path, true])))} className="expand-all">Expand All</button>
          <button onClick={() => setExpandedFiles(Object.fromEntries(files.map(f => [f.path, false])))} className="collapse-all">Collapse All</button>
        </div>
      </div>

      {showFileTree && (
        <div className="diff-file-tree">
          {files.map(file => (
            <button key={file.path} onClick={() => { setSelectedFile(file.path); setExpandedFiles(prev => ({ ...prev, [file.path]: true })); }} className={`file-tree-item ${selectedFile === file.path ? 'active' : ''}`}>
              <span className="status-dot" style={{ color: STATUS_LABELS[file.status]?.color }}>{file.status.charAt(0).toUpperCase()}</span>
              <span className="file-path">{file.path}</span>
              <span className="file-stats"><span className="add">+{file.additions}</span> <span className="del">-{file.deletions}</span></span>
            </button>
          ))}
        </div>
      )}

      <div className="diff-files-list">
        {files.map(file => (
          <div key={file.path} className={`diff-file-block ${expandedFiles[file.path] ? 'expanded' : 'collapsed'}`}>
            <div className="diff-file-header" onClick={() => toggleFile(file.path)}>
              <span className="collapse-icon">{expandedFiles[file.path] ? '\u25BC' : '\u25B6'}</span>
              <span className={`file-status-badge`} style={{ backgroundColor: STATUS_LABELS[file.status]?.color }}>{STATUS_LABELS[file.status]?.text}</span>
              <span className="file-path-display">{file.oldPath && file.oldPath !== file.path ? `${file.oldPath} \u2192 ${file.path}` : file.path}</span>
              <span className="file-change-stats">
                <span className="additions">+{file.additions}</span>
                <span className="deletions">-{file.deletions}</span>
                <span className="change-bar">
                  {Array.from({ length: Math.min(file.additions + file.deletions, 5) }).map((_, i) => (
                    <span key={i} className={`bar-segment ${i < Math.ceil((file.additions / (file.additions + file.deletions || 1)) * 5) ? 'add' : 'del'}`}></span>
                  ))}
                </span>
              </span>
            </div>
            {expandedFiles[file.path] && (
              <div className="diff-file-content">
                {viewMode === 'unified' ? renderUnifiedDiff(file) : renderSplitDiff(file)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default GitDiff;
