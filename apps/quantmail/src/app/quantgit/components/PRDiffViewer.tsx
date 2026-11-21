'use client';

import React from 'react';
import type { PRDiffFile, PRDiffComment } from '../types';
import { QuantGitCommentIcon } from './QuantGitIcons';

export interface PRDiffViewerProps {
  files: PRDiffFile[];
  /** Unique line key (PRDiffLine.id) of the line whose comment box is open.
      Keyed by line id — not by `filePath-l<line>` — because a removed line N
      and an added line N share the same backend line reference. */
  activeLineKey: string | null;
  lineCommentText: string;
  /** Comments posted this session, keyed by backend line reference
      (`<filePath>-l<line>`). */
  diffComments: Record<string, PRDiffComment[]>;
  onOpenLine: (lineKey: string) => void;
  onCancelLine: () => void;
  onChangeCommentText: (text: string) => void;
  onSubmitComment: (lineId: string, side: 'LEFT' | 'RIGHT') => void;
  /** Shift+Click range selection (keyboard review flow). */
  selectedLineIds?: string[];
  onLineClick?: (lineId: string, shiftKey: boolean) => void;
}

const STATUS_CHIP: Record<string, string> = {
  added: 'bg-[#238636]/20 text-[#3FB950] border-[#238636]/40',
  deleted: 'bg-[#DA3633]/20 text-[#F85149] border-[#DA3633]/40',
  renamed: 'bg-[#8B5CF6]/20 text-[#A371F7] border-[#8B5CF6]/40',
  modified: 'bg-[#6E7681]/20 text-[#8D96A0] border-[#6E7681]/40',
};

function statusLabel(file: PRDiffFile): string {
  if (file.status === 'added') return 'Added';
  if (file.status === 'deleted') return 'Deleted';
  if (file.oldFilename) return 'Renamed';
  return 'Modified';
}

function statusChipClass(file: PRDiffFile): string {
  if (file.status === 'added') return STATUS_CHIP.added;
  if (file.status === 'deleted') return STATUS_CHIP.deleted;
  if (file.oldFilename) return STATUS_CHIP.renamed;
  return STATUS_CHIP.modified;
}

function lineRowClass(type: 'addition' | 'deletion' | 'context'): string {
  if (type === 'addition') return 'bg-[#238636]/15';
  if (type === 'deletion') return 'bg-[#DA3633]/15';
  return 'hover:bg-[var(--quant-surface-elevated)]';
}

function lineMarker(type: 'addition' | 'deletion' | 'context'): string {
  if (type === 'addition') return '+';
  if (type === 'deletion') return '-';
  return ' ';
}

export function PRDiffViewer({
  files,
  activeLineKey,
  lineCommentText,
  diffComments,
  onOpenLine,
  onCancelLine,
  onChangeCommentText,
  onSubmitComment,
  selectedLineIds = [],
  onLineClick,
}: PRDiffViewerProps) {
  return (
    <div className="space-y-3" data-testid="diff-files">
      {files.map((file, fileIdx) => (
        <div
          key={`${file.filename}-${fileIdx}`}
          data-testid="diff-file-block"
          className="rounded-xl bg-[#0D1117] border border-[#30363D] overflow-hidden"
        >
          {/* File header */}
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--quant-surface-elevated)]">
            <span
              className={`px-1.5 py-px rounded text-[10px] font-bold border ${statusChipClass(file)}`}
            >
              {statusLabel(file)}
            </span>
            <span
              className="font-mono text-xs text-[#E6EDF3] truncate"
              title={file.oldFilename ? `${file.oldFilename} → ${file.filename}` : file.filename}
            >
              {file.filename}
            </span>
            {file.oldFilename && (
              <span className="font-mono text-[10px] text-[#6E7681] truncate hidden sm:inline">
                renamed from {file.oldFilename}
              </span>
            )}
            {!file.binary && (
              <span className="ml-auto font-mono text-[11px] shrink-0">
                <span className="text-[#3FB950]">+{file.additions}</span>{' '}
                <span className="text-[#F85149]">-{file.deletions}</span>
              </span>
            )}
          </div>

          {file.binary ? (
            <div className="px-3 py-4 text-[11px] text-[#8D96A0]">
              Binary file — diff not shown.
            </div>
          ) : (
            <div className="overflow-x-auto font-mono text-[11px] leading-5 py-1">
              {file.hunks.map((hunk, hunkIdx) => (
                <div key={hunkIdx}>
                  <div className="px-3 py-1 text-[#6E7681] bg-[var(--quant-surface-elevated)] select-none whitespace-pre">
                    {hunk.header}
                  </div>
                  {hunk.lines.map((line) => {
                    const lineNumber = line.newLineNumber ?? line.oldLineNumber;
                    const commentLineId =
                      lineNumber != null ? `${file.filename}-l${lineNumber}` : null;
                    const side: 'LEFT' | 'RIGHT' =
                      line.newLineNumber != null ? 'RIGHT' : 'LEFT';
                    // Same backend line reference can appear on both sides
                    // (removed line N vs added line N) — only show comments
                    // posted on this side.
                    const comments = (
                      commentLineId != null ? (diffComments[commentLineId] ?? []) : []
                    ).filter((c) => !c.side || c.side === side);
                    const isCommentOpen = activeLineKey === line.id;
                    const isSelected = selectedLineIds.includes(line.id);
                    return (
                      <div key={line.id}>
                        <div
                          data-testid={`diff-line-${line.id}`}
                          data-selected={isSelected ? 'true' : undefined}
                          onClick={(e) => onLineClick?.(line.id, e.shiftKey)}
                          className={`group flex items-start cursor-pointer ${lineRowClass(line.type)} ${
                            isSelected ? 'outline outline-1 outline-[#8B5CF6] bg-[#8B5CF6]/10' : ''
                          }`}
                        >
                          <span className="w-10 shrink-0 text-right pr-2 text-[#484F58] select-none">
                            {line.oldLineNumber ?? ''}
                          </span>
                          <span className="w-10 shrink-0 text-right pr-2 text-[#484F58] select-none">
                            {line.newLineNumber ?? ''}
                          </span>
                          {commentLineId != null ? (
                            <button
                              type="button"
                              data-testid={`diff-line-comment-btn-${line.id}`}
                              aria-label={`Add a review comment on ${file.filename} line ${lineNumber}`}
                              title="Add a review comment on this line"
                              onClick={() => onOpenLine(line.id)}
                              className="w-6 shrink-0 text-center text-[#58A6FF] opacity-60 hover:opacity-100 hover:bg-[#1C2128] focus-visible:opacity-100 cursor-pointer select-none"
                            >
                              +
                            </button>
                          ) : (
                            <span className="w-6 shrink-0 select-none" />
                          )}
                          <span className="pr-1.5 text-[#484F58] select-none">
                            {lineMarker(line.type)}
                          </span>
                          <span className="whitespace-pre-wrap break-all pr-3 flex-1 text-[#E6EDF3]">
                            {line.content === '' ? ' ' : line.content}
                          </span>
                        </div>

                        {comments.length > 0 && (
                          <div className="px-3 py-1 space-y-1 bg-[#0D1117]">
                            {comments.map((c) => (
                              <div
                                key={c.id}
                                data-testid={`diff-line-comment-${c.id}`}
                                className="rounded-lg bg-[var(--quant-surface-elevated)] border border-[#30363D] px-3 py-2"
                              >
                                <div className="text-[11px] mb-0.5">
                                  <span className="font-semibold text-[#E6EDF3]">{c.author}</span>
                                  <span className="text-[#6E7681] ml-2">{c.createdAt}</span>
                                </div>
                                <p className="text-xs text-[#E6EDF3] whitespace-pre-wrap break-words">
                                  {c.body}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        {isCommentOpen && commentLineId != null && (
                          <div
                            data-testid={`diff-line-comment-box-${line.id}`}
                            className="px-3 py-2 bg-[#0D1117]"
                          >
                            <textarea
                              data-testid="diff-line-comment-input"
                              value={lineCommentText}
                              onChange={(e) => onChangeCommentText(e.target.value)}
                              onKeyDown={(e) => {
                                // Cmd/Ctrl+Enter submits the standalone line
                                // comment (GitHub review-flow shortcut).
                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  onSubmitComment(commentLineId, side);
                                }
                              }}
                              placeholder="Add a review comment on this line…"
                              rows={2}
                              className="w-full bg-[var(--quant-surface-elevated)] border border-[#30363D] focus:border-[#58A6FF] rounded-lg px-3 py-2 text-xs text-[#E6EDF3] placeholder-[#6E7681] outline-none resize-y"
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <button
                                type="button"
                                onClick={onCancelLine}
                                className="px-3 py-1 rounded-lg text-[11px] font-semibold text-[#8D96A0] hover:text-[#E6EDF3] cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                data-testid="diff-line-comment-submit"
                                onClick={() => onSubmitComment(commentLineId, side)}
                                disabled={lineCommentText.trim().length === 0}
                                className="px-3 py-1 rounded-lg text-[11px] font-bold bg-[#238636] hover:bg-[#2EA043] disabled:opacity-40 disabled:cursor-not-allowed text-white cursor-pointer flex items-center gap-1.5"
                              >
                                <QuantGitCommentIcon size={12} />
                                Comment
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
