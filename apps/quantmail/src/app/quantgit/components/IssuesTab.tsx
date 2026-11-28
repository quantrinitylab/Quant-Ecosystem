'use client';

// ============================================================================
// QuantGit — Comprehensive Issues Lifecycle Engine (GitHub Screens 28, 76, 89–90, 147–158)
// ============================================================================

import React, { useState, useMemo } from 'react';
import type { IssueItem } from '../types';
import {
  QuantGitIssueOpenIcon,
  QuantGitIssueClosedIcon,
  QuantGitCommentIcon,
  QuantGitCheckIcon,
  QuantGitLinkIcon,
} from './QuantGitIcons';
import { QuantGitRowSkeleton, QuantGitEmptyState } from './QuantGitSkeletons';

export interface IssuesTabProps {
  issueSearchQuery: string;
  setIssueSearchQuery: (q: string) => void;
  filteredIssues: IssueItem[];
  openIssuesCount: number;
  closedIssuesCount: number;
  setModalState: (modal: any) => void;
  openIssueDetail: (issue: IssueItem) => void;
  handleToggleIssue: (id: number) => void;
  /** When true, renders skeleton rows instead of the issue list. */
  isLoading?: boolean;
  /** Real backend wiring: POST /api/repos/:repo/issues. */
  onCreateIssue: (title: string, body: string) => Promise<{ ok: boolean; error?: string }>;
  /** Real backend wiring: POST /api/repos/:repo/issues/:number/comments. */
  onPostIssueComment: (
    issueId: number,
    body: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Full issue list used to build the filter menus (authors/labels/assignees).
   * Optional — defaults to `filteredIssues` so the component still works when the
   * parent does not pass it. The parent passes the unfiltered `issues` array so
   * menu options stay stable while other filters are active.
   */
  allIssues?: IssueItem[];
}

// ============================================================================
// Real filter dropdowns (fix/qm-issues-filters).
// The Author/Label/Assignee/Sort buttons were native alert() stubs. They are now
// real client-side filters over the issue list. Projects/Milestones have no
// corresponding field on IssueItem, so those stay as HONEST disabled buttons
// (no fake options, no alert) until the backend exposes project/milestone data.
// ============================================================================

type FilterMenuId = 'author' | 'label' | 'assignee' | 'sort' | null;
type IssueSortOrder = 'newest' | 'oldest' | 'most-commented' | 'least-commented';

const SORT_LABELS: Record<IssueSortOrder, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  'most-commented': 'Most commented',
  'least-commented': 'Least commented',
};

/** Sentinel for the "Unassigned" assignee option (no real assignee is this). */
const UNASSIGNED = '__unassigned__';

function FilterDropdown({
  id,
  label,
  activeValue,
  isOpen,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  activeValue: string | null;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const isActive = activeValue !== null;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-testid={id}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={onToggle}
        className={`px-2.5 py-1 rounded-md border flex items-center gap-1 transition-colors cursor-pointer ${
          isActive
            ? 'bg-[#1c1230] border-[#8B5CF6] text-[#E6EDF3]'
            : 'bg-[var(--quant-surface-elevated)] hover:bg-[#21262D] border-[#30363D] text-[#8D96A0] hover:text-[#E6EDF3]'
        }`}
      >
        <span>
          {label}
          {isActive ? `: ${activeValue}` : ''}
        </span>
        <span className="text-[var(--q-type-xs)]">▼</span>
      </button>
      {isOpen && (
        <div
          role="menu"
          data-testid={`${id}-menu`}
          className="absolute left-0 top-full mt-2 w-60 max-h-64 overflow-y-auto bg-[var(--quant-surface-elevated)] border border-[#30363D] rounded-xl p-1.5 shadow-2xl z-50 space-y-0.5"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function FilterMenuOption({
  menuId,
  value,
  label,
  isSelected,
  onSelect,
  swatchColor,
}: {
  menuId: string;
  value: string;
  label: string;
  isSelected: boolean;
  onSelect: () => void;
  swatchColor?: string;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={isSelected}
      data-testid={`${menuId}-option-${value}`}
      onClick={onSelect}
      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors cursor-pointer ${
        isSelected
          ? 'bg-[#1c1230] text-[#E6EDF3] font-semibold'
          : 'text-[#8D96A0] hover:bg-[#21262D] hover:text-[#E6EDF3]'
      }`}
    >
      {swatchColor && (
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: swatchColor }}
        />
      )}
      <span className="flex-1 truncate">{label}</span>
      {isSelected && <span className="text-[#8B5CF6]">✓</span>}
    </button>
  );
}

/** Honest disabled stub: the IssueItem type carries no projects/milestones data. */
function UnavailableFilter({ id, label }: { id: string; label: string }) {
  return (
    <button
      type="button"
      disabled
      data-testid={id}
      title={`${label} filtering is unavailable — the issue data has no ${label.toLowerCase()} field yet.`}
      className="px-2.5 py-1 rounded-md bg-[var(--quant-surface-elevated)] border border-[#30363D] text-[#8D96A0] flex items-center gap-1 opacity-50 cursor-not-allowed shrink-0"
    >
      <span>{label}</span>
      <span className="text-[var(--q-type-xs)]">▼</span>
    </button>
  );
}

export function IssuesTab({
  issueSearchQuery,
  setIssueSearchQuery,
  filteredIssues,
  openIssuesCount,
  closedIssuesCount,
  setModalState,
  openIssueDetail,
  handleToggleIssue,
  isLoading = false,
  onCreateIssue,
  onPostIssueComment,
  allIssues,
}: IssuesTabProps) {
  const [selectedIssue, setSelectedIssue] = useState<IssueItem | null>(null);
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newComment, setNewComment] = useState('');
  const [activeTabMode, setActiveTabMode] = useState<'write' | 'preview'>('write');
  // Submission state for the real (non-stub) comment/create-issue flows.
  // On failure the user's text is NEVER cleared — the honest error is shown
  // inline instead, so no input is ever lost.
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
  const [createIssueError, setCreateIssueError] = useState<string | null>(null);

  // Real filter state (fix/qm-issues-filters): these drive the list below.
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<IssueSortOrder>('newest');
  const [openMenu, setOpenMenu] = useState<FilterMenuId>(null);

  // Menu options come from the FULL issue list so they stay stable while other
  // filters are active. Falls back to filteredIssues when the parent passes none.
  const filterSource = allIssues ?? filteredIssues;
  const authorOptions = useMemo(
    () =>
      Array.from(new Set(filterSource.map((i) => i.author).filter((a): a is string => !!a))).sort(),
    [filterSource],
  );
  const labelOptions = useMemo(() => {
    const byName = new Map<string, string>();
    for (const issue of filterSource) {
      for (const lbl of issue.labels) {
        if (!byName.has(lbl.name)) byName.set(lbl.name, lbl.color);
      }
    }
    return Array.from(byName.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filterSource]);
  const assigneeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          filterSource.map((i) => i.assignee).filter((a): a is string => !!a),
        ),
      ).sort(),
    [filterSource],
  );
  const hasUnassigned = useMemo(
    () => filterSource.some((i) => !i.assignee),
    [filterSource],
  );

  // The rendered list: parent search/state filter first, then our real filters.
  const displayIssues = useMemo(() => {
    let list = filteredIssues;
    if (authorFilter) list = list.filter((i) => i.author === authorFilter);
    if (labelFilter)
      list = list.filter((i) => i.labels.some((l) => l.name === labelFilter));
    if (assigneeFilter === UNASSIGNED) list = list.filter((i) => !i.assignee);
    else if (assigneeFilter) list = list.filter((i) => i.assignee === assigneeFilter);
    const sorted = [...list];
    // Issue ids are monotonic from the backend, so id order == creation order.
    switch (sortOrder) {
      case 'oldest':
        sorted.sort((a, b) => a.id - b.id);
        break;
      case 'most-commented':
        sorted.sort((a, b) => b.commentsCount - a.commentsCount);
        break;
      case 'least-commented':
        sorted.sort((a, b) => a.commentsCount - b.commentsCount);
        break;
      case 'newest':
      default:
        sorted.sort((a, b) => b.id - a.id);
        break;
    }
    return sorted;
  }, [filteredIssues, authorFilter, labelFilter, assigneeFilter, sortOrder]);

  const hasActiveFilters =
    authorFilter !== null || labelFilter !== null || assigneeFilter !== null;

  const clearFilters = () => {
    setAuthorFilter(null);
    setLabelFilter(null);
    setAssigneeFilter(null);
  };

  // Insert markdown tag helper
  const insertMarkdown = (prefix: string, suffix = '') => {
    setNewComment((prev) => `${prev}${prefix}text${suffix}`);
  };

  // Posts the typed comment through the real backend endpoint.
  const submitComment = async () => {
    if (!selectedIssue || isPostingComment) return;
    const body = newComment.trim();
    if (!body) return;
    setIsPostingComment(true);
    setCommentError(null);
    try {
      const result = await onPostIssueComment(selectedIssue.id, body);
      if (result.ok) {
        setNewComment('');
      } else {
        setCommentError(result.error || 'Failed to post comment. Your text was kept.');
      }
    } catch {
      setCommentError('Failed to post comment — network error. Your text was kept.');
    } finally {
      setIsPostingComment(false);
    }
  };

  // Creates the issue through the real backend endpoint.
  const submitNewIssue = async () => {
    if (isSubmittingIssue) return;
    const title = newTitle.trim();
    if (!title) {
      setCreateIssueError('Title is required.');
      return;
    }
    setIsSubmittingIssue(true);
    setCreateIssueError(null);
    try {
      const result = await onCreateIssue(title, newBody);
      if (result.ok) {
        setNewTitle('');
        setNewBody('');
        setIsCreatingIssue(false);
      } else {
        setCreateIssueError(result.error || 'Failed to create issue. Your text was kept.');
      }
    } catch {
      setCreateIssueError('Failed to create issue — network error. Your text was kept.');
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  return (
    <div className="space-y-4 text-xs text-[#E6EDF3]">
      {/* If viewing a selected issue detail */}
      {selectedIssue ? (
        <div className="space-y-6">
          {/* Back button & Issue Header */}
 <div className="space-y-3 pb-4">
            <button
              onClick={() => setSelectedIssue(null)}
              className="text-[#58A6FF] hover:underline flex items-center gap-1.5 font-medium"
            >
              <span>← Back to all issues</span>
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-[#E6EDF3]">
                {selectedIssue.title}{' '}
                <span className="text-[#8D96A0] font-normal">#{selectedIssue.id}</span>
              </h2>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleIssue(selectedIssue.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    selectedIssue.state === 'open'
                      ? 'bg-[#21262D] hover:bg-[#30363D] text-[#8D96A0] hover:text-[#E6EDF3] border border-[#30363D]'
                      : 'bg-[#238636] hover:bg-[#2EA043] text-white'
                  }`}
                >
                  {selectedIssue.state === 'open' ? 'Close issue' : 'Reopen issue'}
                </button>
              </div>
            </div>

            {/* Status Pill & Author metadata */}
            <div className="flex items-center gap-3 text-[11px] text-[#8D96A0]">
              <span
                className={`px-2.5 py-0.5 rounded-full text-white font-semibold flex items-center gap-1.5 ${
                  selectedIssue.state === 'open' ? 'bg-[#238636]' : 'bg-[#8957E5]'
                }`}
              >
                {selectedIssue.state === 'open' ? (
                  <>
                    <QuantGitIssueOpenIcon size={12} /> Open
                  </>
                ) : (
                  <>
                    <QuantGitIssueClosedIcon size={12} /> Closed
                  </>
                )}
              </span>
              <span>
                <strong className="text-[#E6EDF3]">{selectedIssue.author || 'Unknown'}</strong> opened this issue{' '}
                {selectedIssue.createdAt} · {selectedIssue.commentsCount} comments
              </span>
            </div>
          </div>

          {/* Two-column layout: Conversation stream + Sidebar metadata */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Conversation Timeline */}
            <div className="flex-1 space-y-4">
              {/* Original Post card */}
              <div className="rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] overflow-hidden">
 <div className="px-4 py-2.5 bg-[#0D1117] flex items-center justify-between">
                  <span className="font-semibold text-xs text-[#E6EDF3]">
                    {selectedIssue.author || 'Unknown'} commented {selectedIssue.createdAt}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#30363D] text-[#8D96A0]">
                    Author
                  </span>
                </div>
                <div className="p-4 space-y-3 leading-relaxed">
                  <p className="text-xs text-[#E6EDF3] whitespace-pre-wrap">
                    {selectedIssue.body?.trim() ? selectedIssue.body : 'No description provided.'}
                  </p>
                </div>
              </div>

              {/* Comment Composer with Markdown Toolbar (Screen 153) */}
              <div className="rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] overflow-hidden space-y-2">
 <div className="px-3 py-2 bg-[#0D1117] flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveTabMode('write')}
                      className={`px-3 py-1 rounded text-xs font-semibold ${
                        activeTabMode === 'write' ? 'bg-[#21262D] text-[#E6EDF3]' : 'text-[#8D96A0]'
                      }`}
                    >
                      Write
                    </button>
                    <button
                      onClick={() => setActiveTabMode('preview')}
                      className={`px-3 py-1 rounded text-xs font-semibold ${
                        activeTabMode === 'preview'
                          ? 'bg-[#21262D] text-[#E6EDF3]'
                          : 'text-[#8D96A0]'
                      }`}
                    >
                      Preview
                    </button>
                  </div>

                  {/* Markdown Toolbar (Screen 153) */}
                  <div className="flex items-center gap-1 text-[#8D96A0]">
                    <button
                      onClick={() => insertMarkdown('**', '**')}
                      className="p-1 hover:text-[#E6EDF3] font-bold"
                      title="Bold"
                    >
                      B
                    </button>
                    <button
                      onClick={() => insertMarkdown('*', '*')}
                      className="p-1 hover:text-[#E6EDF3] italic"
                      title="Italic"
                    >
                      I
                    </button>
                    <button
                      onClick={() => insertMarkdown('[', '](url)')}
                      className="p-1 hover:text-[#E6EDF3] flex"
                      title="Link"
                    >
                      <QuantGitLinkIcon size={14} />
                    </button>
                    <button
                      onClick={() => insertMarkdown('@')}
                      className="p-1 hover:text-[#E6EDF3]"
                      title="Mention"
                    >
                      @
                    </button>
                    <button
                      onClick={() => insertMarkdown('- ')}
                      className="p-1 hover:text-[#E6EDF3]"
                      title="Bullet list"
                    >
                      ≡
                    </button>
                    <button
                      onClick={() => insertMarkdown('- [ ] ')}
                      className="p-1 hover:text-[#E6EDF3]"
                      title="Task list"
                    >
                      ☑
                    </button>
                    <button
                      onClick={() => insertMarkdown('### ')}
                      className="p-1 hover:text-[#E6EDF3] font-bold"
                      title="Heading"
                    >
                      H
                    </button>
                  </div>
                </div>

                <div className="p-3">
                  {activeTabMode === 'write' ? (
                    <textarea
                      rows={4}
                      value={newComment}
                      onChange={(e) => {
                        setNewComment(e.target.value);
                        if (commentError) setCommentError(null);
                      }}
                      placeholder="Leave a comment"
                      data-testid="issue-comment-textarea"
                      className="w-full bg-[#0D1117] border border-[#30363D] focus:border-[#58A6FF] rounded-lg p-2.5 text-xs text-[#E6EDF3] outline-none"
                    />
                  ) : (
                    <div className="p-3 bg-[#0D1117] rounded-lg min-h-[96px] text-xs text-[#8D96A0]">
                      {newComment || 'Nothing to preview'}
                    </div>
                  )}

                  {commentError && (
                    <p
                      className="text-[#F85149] text-[11px] pt-1"
                      role="alert"
                      data-testid="issue-comment-error"
                    >
                      {commentError}
                    </p>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={submitComment}
                      disabled={isPostingComment || !newComment.trim()}
                      title={
                        isPostingComment ? 'Posting your comment…' : 'Post this comment to the issue'
                      }
                      data-testid="issue-comment-submit"
                      className="px-4 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-semibold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPostingComment ? 'Posting…' : 'Comment'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Metadata Sidebar (Screens 154–158) */}
            <div className="w-full lg:w-64 space-y-4 shrink-0 text-xs">
              {/* Assignees */}
 <div className="pb-3 space-y-1">
                <div className="flex items-center justify-between text-[#8D96A0]">
                  <span className="font-semibold">Assignees</span>
                  <button className="text-[#58A6FF] hover:underline text-[11px]">EDIT</button>
                </div>
                <p className="text-[#E6EDF3]">{selectedIssue.assignee || 'No one assigned'}</p>
              </div>

              {/* Labels */}
 <div className="pb-3 space-y-1.5">
                <div className="flex items-center justify-between text-[#8D96A0]">
                  <span className="font-semibold">Labels</span>
                  <button className="text-[#58A6FF] hover:underline text-[11px]">EDIT</button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedIssue.labels.map((lbl) => (
                    <span
                      key={lbl.name}
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: lbl.color }}
                    >
                      {lbl.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Milestone */}
 <div className="pb-3 space-y-1">
                <div className="flex items-center justify-between text-[#8D96A0]">
                  <span className="font-semibold">Milestone</span>
                  <button className="text-[#58A6FF] hover:underline text-[11px]">EDIT</button>
                </div>
                <p className="text-[#8D96A0]">No milestone selected</p>
              </div>

              {/* Linked Items */}
 <div className="pb-3 space-y-1">
                <div className="flex items-center justify-between text-[#8D96A0]">
                  <span className="font-semibold">Linked items</span>
                  <button className="text-[#58A6FF] hover:underline text-[11px]">EDIT</button>
                </div>
                <p className="text-[#8D96A0]">No linked items</p>
              </div>

              {/* Projects */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[#8D96A0]">
                  <span className="font-semibold">Projects</span>
                  <button className="text-[#58A6FF] hover:underline text-[11px]">EDIT</button>
                </div>
                <p className="text-[#8D96A0]">No projects selected</p>
              </div>
            </div>
          </div>
        </div>
      ) : isCreatingIssue ? (
        /* Issue Creation Composer */
        <div className="rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] p-5 space-y-4">
 <div className="flex items-center justify-between pb-3">
            <h3 className="font-bold text-sm text-[#E6EDF3]">Create new issue</h3>
            <button
              onClick={() => setIsCreatingIssue(false)}
              className="text-[#8D96A0] hover:text-[#E6EDF3]"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-[#8D96A0] block mb-1">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => {
                  setNewTitle(e.target.value);
                  if (createIssueError) setCreateIssueError(null);
                }}
                placeholder="Title"
                data-testid="issue-create-title"
                className="w-full bg-[#0D1117] border border-[#30363D] focus:border-[#58A6FF] rounded-lg p-2 text-xs text-[#E6EDF3] outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-[#8D96A0] block mb-1">Description</label>
              <textarea
                rows={6}
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Leave a description..."
                data-testid="issue-create-body"
                className="w-full bg-[#0D1117] border border-[#30363D] focus:border-[#58A6FF] rounded-lg p-2 text-xs text-[#E6EDF3] outline-none"
              />
            </div>

            {createIssueError && (
              <p className="text-[#F85149] text-[11px]" role="alert" data-testid="issue-create-error">
                {createIssueError}
              </p>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={submitNewIssue}
                disabled={isSubmittingIssue || !newTitle.trim()}
                title={isSubmittingIssue ? 'Creating your issue…' : 'Create this issue'}
                data-testid="issue-create-submit"
                className="px-4 py-2 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-semibold text-xs shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingIssue ? 'Creating…' : 'Submit new issue'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Issues List View */
        <div className="space-y-4">
          {/* Filter Bar & Action Button */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[260px] relative">
              <input
                type="text"
                value={issueSearchQuery}
                onChange={(e) => setIssueSearchQuery(e.target.value)}
                placeholder="is:issue state:open ..."
                className="w-full bg-[var(--quant-surface-elevated)] border border-[#30363D] focus:border-[#58A6FF] rounded-lg px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#8D96A0] outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreatingIssue(true)}
                className="px-3.5 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors"
              >
                New issue
              </button>
            </div>
          </div>

          {/* Filter Dropdowns (Screens 147–149) — real client-side filters.
              Projects/Milestones are honest disabled states: IssueItem carries
              no project/milestone field, so there is nothing real to offer. */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[#8D96A0] text-[11px]">
            <FilterDropdown
              id="issue-filter-author"
              label="Author"
              activeValue={authorFilter}
              isOpen={openMenu === 'author'}
              onToggle={() => setOpenMenu(openMenu === 'author' ? null : 'author')}
            >
              <FilterMenuOption
                menuId="issue-filter-author"
                value="all"
                label="All authors"
                isSelected={authorFilter === null}
                onSelect={() => {
                  setAuthorFilter(null);
                  setOpenMenu(null);
                }}
              />
              {authorOptions.length === 0 && (
                <p className="px-2.5 py-1.5 text-xs text-[#8D96A0]">
                  No authors in the issue list.
                </p>
              )}
              {authorOptions.map((author) => (
                <FilterMenuOption
                  key={author}
                  menuId="issue-filter-author"
                  value={author}
                  label={author}
                  isSelected={authorFilter === author}
                  onSelect={() => {
                    setAuthorFilter(author);
                    setOpenMenu(null);
                  }}
                />
              ))}
            </FilterDropdown>

            <FilterDropdown
              id="issue-filter-label"
              label="Label"
              activeValue={labelFilter}
              isOpen={openMenu === 'label'}
              onToggle={() => setOpenMenu(openMenu === 'label' ? null : 'label')}
            >
              <FilterMenuOption
                menuId="issue-filter-label"
                value="all"
                label="All labels"
                isSelected={labelFilter === null}
                onSelect={() => {
                  setLabelFilter(null);
                  setOpenMenu(null);
                }}
              />
              {labelOptions.length === 0 && (
                <p className="px-2.5 py-1.5 text-xs text-[#8D96A0]">
                  No labels in the issue list.
                </p>
              )}
              {labelOptions.map(([name, color]) => (
                <FilterMenuOption
                  key={name}
                  menuId="issue-filter-label"
                  value={name}
                  label={name}
                  swatchColor={color}
                  isSelected={labelFilter === name}
                  onSelect={() => {
                    setLabelFilter(name);
                    setOpenMenu(null);
                  }}
                />
              ))}
            </FilterDropdown>

            <UnavailableFilter id="issue-filter-projects" label="Projects" />
            <UnavailableFilter id="issue-filter-milestones" label="Milestones" />

            <FilterDropdown
              id="issue-filter-assignee"
              label="Assignee"
              activeValue={
                assigneeFilter === UNASSIGNED ? 'Unassigned' : assigneeFilter
              }
              isOpen={openMenu === 'assignee'}
              onToggle={() =>
                setOpenMenu(openMenu === 'assignee' ? null : 'assignee')
              }
            >
              <FilterMenuOption
                menuId="issue-filter-assignee"
                value="all"
                label="All assignees"
                isSelected={assigneeFilter === null}
                onSelect={() => {
                  setAssigneeFilter(null);
                  setOpenMenu(null);
                }}
              />
              {hasUnassigned && (
                <FilterMenuOption
                  menuId="issue-filter-assignee"
                  value={UNASSIGNED}
                  label="Unassigned"
                  isSelected={assigneeFilter === UNASSIGNED}
                  onSelect={() => {
                    setAssigneeFilter(UNASSIGNED);
                    setOpenMenu(null);
                  }}
                />
              )}
              {assigneeOptions.length === 0 && !hasUnassigned && (
                <p className="px-2.5 py-1.5 text-xs text-[#8D96A0]">
                  No assignees in the issue list.
                </p>
              )}
              {assigneeOptions.map((assignee) => (
                <FilterMenuOption
                  key={assignee}
                  menuId="issue-filter-assignee"
                  value={assignee}
                  label={assignee}
                  isSelected={assigneeFilter === assignee}
                  onSelect={() => {
                    setAssigneeFilter(assignee);
                    setOpenMenu(null);
                  }}
                />
              ))}
            </FilterDropdown>

            <FilterDropdown
              id="issue-filter-sort"
              label={`Sort: ${SORT_LABELS[sortOrder]}`}
              activeValue={null}
              isOpen={openMenu === 'sort'}
              onToggle={() => setOpenMenu(openMenu === 'sort' ? null : 'sort')}
            >
              {(Object.keys(SORT_LABELS) as IssueSortOrder[]).map((order) => (
                <FilterMenuOption
                  key={order}
                  menuId="issue-filter-sort"
                  value={order}
                  label={SORT_LABELS[order]}
                  isSelected={sortOrder === order}
                  onSelect={() => {
                    setSortOrder(order);
                    setOpenMenu(null);
                  }}
                />
              ))}
            </FilterDropdown>

            {hasActiveFilters && (
              <button
                type="button"
                data-testid="issue-filters-clear"
                onClick={clearFilters}
                className="px-2.5 py-1 rounded-md text-[#8B5CF6] hover:text-white hover:bg-[#1c1230] border border-transparent hover:border-[#8B5CF6] transition-colors cursor-pointer shrink-0"
              >
                Clear filters ✕
              </button>
            )}
          </div>

          {/* Issues List Container */}
          <div className="border border-[#30363D] rounded-xl bg-[#0D1117] overflow-hidden">
 <div className="bg-[var(--quant-surface-elevated)] px-4 py-3 flex items-center justify-between font-semibold">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setIssueSearchQuery('is:issue state:open')}
                  className={`flex items-center gap-1.5 ${
                    !issueSearchQuery.includes('state:closed')
                      ? 'text-white font-bold'
                      : 'text-[#8D96A0]'
                  }`}
                >
                  <span className="text-[#3FB950] flex">
                    <QuantGitIssueOpenIcon size={14} />
                  </span>{' '}
                  {openIssuesCount} Open
                </button>
                <button
                  type="button"
                  onClick={() => setIssueSearchQuery('is:issue state:closed')}
                  className={`flex items-center gap-1.5 ${
                    issueSearchQuery.includes('state:closed')
                      ? 'text-white font-bold'
                      : 'text-[#8D96A0]'
                  }`}
                >
                  <span className="text-[#8957E5] flex">
                    <QuantGitCheckIcon size={14} />
                  </span>{' '}
                  {closedIssuesCount} Closed
                </button>
              </div>
            </div>

 <div>
              {isLoading ? (
                <QuantGitRowSkeleton rows={5} testId="issue-list-skeleton" />
              ) : displayIssues.length === 0 ? (
                <QuantGitEmptyState
                  icon="issue"
                  title="No issues"
                  hint={
                    hasActiveFilters
                      ? 'No issues match the current filters. Clear the filters or adjust your search.'
                      : issueSearchQuery.includes('state:closed')
                        ? 'There are no closed issues matching your search.'
                        : 'There are no open issues. Create one to track work.'
                  }
                  actionLabel="New issue"
                  onAction={() => setModalState('new-issue')}
                  testId="issue-list-empty"
                />
              ) : (
                displayIssues.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    data-testid={`issue-row-${issue.id}`}
                    onClick={() => setSelectedIssue(issue)}
                    aria-label={`Open issue ${issue.title}`}
                    className="w-full p-4 hover:bg-[var(--quant-surface-elevated)] transition-colors flex items-start justify-between gap-4 group text-left cursor-pointer"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`flex ${
                            issue.state === 'open' ? 'text-[#3FB950]' : 'text-[#8957E5]'
                          }`}
                        >
                          {issue.state === 'open' ? (
                            <QuantGitIssueOpenIcon size={16} />
                          ) : (
                            <QuantGitIssueClosedIcon size={16} />
                          )}
                        </span>
                        <span className="font-semibold text-sm text-[#E6EDF3] group-hover:text-[#58A6FF] transition-colors">
                          {issue.title}
                        </span>
                        {issue.labels.map((lbl) => (
                          <span
                            key={lbl.name}
                            className="px-2 py-0.2 rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: lbl.color }}
                          >
                            {lbl.name}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-[#8D96A0]">
                        #{issue.id} opened {issue.createdAt} by {issue.author || 'Unknown'} · Assignee:{' '}
                        {issue.assignee}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[#8D96A0] shrink-0">
                      <QuantGitCommentIcon size={14} />
                      <span className="text-xs">{issue.commentsCount}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
