'use client';

// ============================================================================
// QuantGit — Pull Requests Engine, 3-Way Merge & CI Review Gate (Screens 27, 73–74, 99–103)
// ============================================================================

import React, { useState, useEffect } from 'react';
import type {
  PRItem,
  PRReviewDecision,
  PRReviewItem,
  PRDiffFile,
  PRDiffComment,
  MergeMethod,
} from '../types';
import {
  QuantGitPRIcon,
  QuantGitCheckCircleIcon,
  QuantGitXCircleIcon,
  QuantGitPendingDotIcon,
  QuantGitCommentIcon,
  QuantGitCheckIcon,
  QuantGitXIcon,
  QuantGitWarningIcon,
} from './QuantGitIcons';
import { QuantGitRowSkeleton, QuantGitEmptyState } from './QuantGitSkeletons';
import { apiFetchRaw } from '@quant/api-client';
import { parseUnifiedDiff } from './prDiffParser';
import { PRDiffViewer } from './PRDiffViewer';

export interface SecurityCheckItem {
  id: string;
  name: string;
  description: string;
  status: 'passed' | 'failed' | 'pending';
}

export interface PullRequestsTabProps {
  pullSearchQuery: string;
  setPullSearchQuery: (q: string) => void;
  filteredPulls: PRItem[];
  openPullsCount: number;
  closedPullsCount: number;
  setModalState?: (modal: any) => void;
  openPullDetail?: (pr: PRItem) => void;
  repoId?: string;
  currentUsername?: string;
  showToast?: (message: string) => void;
  onMergePR?: (prId: number, mergeMethod: MergeMethod) => Promise<boolean> | boolean | void;
  initialSelectedPR?: PRItem | null;
  checks?: SecurityCheckItem[];
  initialMergeMethod?: MergeMethod;
  initialIsMergeConfirmOpen?: boolean;
  /** When true, renders skeleton rows instead of the PR list. */
  isLoading?: boolean;
}



/**
 * Merge-conflict pre-check state for a PR. Rendered by {@link MergeConflictStatus}.
 * The "no conflicts" claim may ONLY appear in the `mergeable` state, which is
 * produced by a real backend dry-run (`GET /:id/pulls/:number/mergeable`).
 * `unknown` (check unavailable) must never render either claim.
 */
export type MergeConflictCheckState =
  | { status: 'checking' }
  | { status: 'mergeable' }
  | { status: 'conflict'; conflicts: string[] }
  | { status: 'unknown' };

/**
 * Honest merge-conflict status line for the merge box. Every state is backed by
 * the backend pre-check — nothing is claimed before the check completes.
 */
export function MergeConflictStatus({ check }: { check: MergeConflictCheckState }) {
  if (check.status === 'checking') {
    return (
      <div className="flex items-center gap-2" data-testid="merge-conflict-checking">
        <span className="text-[#D29922]">
          <QuantGitPendingDotIcon size={14} />
        </span>
        <span className="text-[11px] text-[#8D96A0]">Checking for merge conflicts…</span>
      </div>
    );
  }
  if (check.status === 'conflict') {
    const files = check.conflicts ?? [];
    const shown = files.slice(0, 5);
    return (
      <div className="flex flex-col gap-1" data-testid="merge-conflict-detected">
        <div className="flex items-center gap-2">
          <span className="text-[#F85149]">
            <QuantGitXIcon size={14} />
          </span>
          <span className="text-[11px] text-[#F85149] font-semibold">
            This branch has conflicts with the base branch that must be resolved before merging.
          </span>
        </div>
        {shown.length > 0 && (
          <ul className="text-[11px] text-[#8D96A0] font-mono pl-6 list-disc">
            {shown.map((f) => (
              <li key={f}>{f}</li>
            ))}
            {files.length > shown.length && <li>…and {files.length - shown.length} more</li>}
          </ul>
        )}
      </div>
    );
  }
  if (check.status === 'unknown') {
    return (
      <div className="flex items-center gap-2" data-testid="merge-conflict-unknown">
        <span className="text-[#D29922]">
          <QuantGitWarningIcon size={14} />
        </span>
        <span className="text-[11px] text-[#8D96A0]">
          Merge-conflict status is unknown — the pre-check is unavailable. This is neither a
          pass nor a failure.
        </span>
      </div>
    );
  }
  // status === 'mergeable': rendered ONLY after the backend dry-run verified it.
  return (
    <div className="flex items-center gap-2" data-testid="merge-conflict-clean">
      <span className="text-[#3FB950]">
        <QuantGitCheckIcon size={14} />
      </span>
      <span className="text-[11px] text-[#8D96A0]">
        This branch has no conflicts with the base branch.
      </span>
    </div>
  );
}

export function PullRequestsTab({
  pullSearchQuery,
  setPullSearchQuery,
  filteredPulls,
  openPullsCount,
  closedPullsCount,
  setModalState,
  openPullDetail,
  repoId = 'quant-ecosystem',
  currentUsername = '',
  showToast,
  onMergePR,
  initialSelectedPR = null,
  checks,
  initialMergeMethod = 'merge',
  initialIsMergeConfirmOpen = false,
  isLoading = false,
}: PullRequestsTabProps) {
  const [selectedPR, setSelectedPR] = useState<PRItem | null>(initialSelectedPR);

  // Merge controls
  const [selectedMergeMethod, setSelectedMergeMethod] = useState<MergeMethod>(initialMergeMethod);
  const [isMergeConfirmOpen, setIsMergeConfirmOpen] = useState<boolean>(initialIsMergeConfirmOpen);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [mergeCommitMsg, setMergeCommitMsg] = useState<string>('');

  // Honest check state: render ONLY checks supplied via the `checks` prop (real
  // backend data). Never invent a pass/fail list — when no check data exists the
  // box renders an explicit "status unknown" state instead of a fabricated gate.
  const activeChecks = React.useMemo(() => {
    if (checks && checks.length > 0) return checks;
    return [];
  }, [checks]);

  const checksKnown = activeChecks.length > 0;
  const anyCheckFailed = activeChecks.some((c) => c.status === 'failed');
  const allChecksPassed = checksKnown && activeChecks.every((c) => c.status === 'passed');
  // Merge-conflict pre-check — real backend data only. The merge box must NEVER
  // claim "no conflicts" from client-side guesswork: until the backend dry-run
  // reports back, the status is 'checking' (honest unknown), and if the check
  // is unavailable it stays 'unknown'. A known conflict blocks the merge UI.
  const [mergeConflictCheck, setMergeConflictCheck] = useState<MergeConflictCheckState>({
    status: 'checking',
  });

  useEffect(() => {
    let cancelled = false;
    if (!selectedPR || selectedPR.state !== 'open') {
      setMergeConflictCheck({ status: 'checking' });
      return;
    }
    const prNumber = (selectedPR as any).number || selectedPR.id;
    setMergeConflictCheck({ status: 'checking' });
    (async () => {
      try {
        const res = await apiFetchRaw(
          `/api/repos/${encodeURIComponent(repoId)}/pulls/${prNumber}/mergeable`,
        );
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        const data = res.ok && json?.success ? json.data : null;
        if (data?.mergeable === true) {
          setMergeConflictCheck({ status: 'mergeable' });
        } else if (data?.mergeable === false) {
          setMergeConflictCheck({
            status: 'conflict',
            conflicts: Array.isArray(data.conflicts)
              ? data.conflicts.map((f: unknown) => String(f))
              : [],
          });
        } else {
          // mergeable === null, non-ok, or malformed body: stay honest — unknown.
          setMergeConflictCheck({ status: 'unknown' });
        }
      } catch {
        if (!cancelled) setMergeConflictCheck({ status: 'unknown' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPR, repoId]);

  // "Unknown" (no data) must not hard-block the real backend merge — the backend
  // enforces required checks itself (403 BRANCH_PROTECTED / 409 MERGE_CONFLICT).
  // Only a REAL failed check, or a REAL detected conflict, blocks the merge UI.
  const mergeAllowed = !anyCheckFailed && mergeConflictCheck.status !== 'conflict';

  // Review decisions — start EMPTY and load only real backend data.
  // Never seed or invent reviews: a fabricated APPROVED review rendered as
  // real under "Review decisions: N submitted" was a P0 fake.
  const [isReviewBoxOpen, setIsReviewBoxOpen] = useState<boolean>(false);
  const [reviewDecision, setReviewDecision] = useState<PRReviewDecision>('comment');
  const [reviewCommentText, setReviewCommentText] = useState<string>('');
  const [reviews, setReviews] = useState<PRReviewItem[]>([]);

  // Load real reviews from GET /:id/pulls/:number/reviews whenever the
  // selected PR changes. An empty list renders the honest empty state.
  useEffect(() => {
    let cancelled = false;
    if (!selectedPR) {
      setReviews([]);
      return;
    }
    const prNumber = (selectedPR as any).number || selectedPR.id;
    setReviews([]);
    (async () => {
      try {
        const res = await apiFetchRaw(
          `/api/repos/${encodeURIComponent(repoId)}/pulls/${prNumber}/reviews`,
        );
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.success && Array.isArray(json.data)) {
          setReviews(
            json.data.map((r: any) => ({
              id: String(r.id),
              author:
                r.reviewer?.username || r.reviewer?.displayName || 'Unknown',
              state: r.status as PRReviewItem['state'],
              body: r.body ?? '',
              createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
            })),
          );
        }
      } catch {
        // Reviews stay empty — the empty state is honest.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPR, repoId, currentUsername]);

  // Load REAL diff stats from GET /:id/pulls/:number (computed server-side via
  // git numstat) whenever the selected PR changes. The list endpoint never
  // computes stats, so without this the header above would stay '—'. On any
  // failure the stats stay unknown — never invented.
  const statsFetchedFor = React.useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    if (!selectedPR) return;
    const prNumber = (selectedPR as any).number || selectedPR.id;
    const fetchKey = `${repoId}:${prNumber}`;
    if (statsFetchedFor.current.has(fetchKey)) return;
    statsFetchedFor.current.add(fetchKey);
    if (
      selectedPR.additions != null &&
      selectedPR.deletions != null &&
      selectedPR.changedFiles != null
    ) {
      return;
    }
    (async () => {
      try {
        const res = await apiFetchRaw(
          `/api/repos/${encodeURIComponent(repoId)}/pulls/${prNumber}`,
        );
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.success && json?.data) {
          const d = json.data;
          setSelectedPR((prev) =>
            prev
              ? {
                  ...prev,
                  additions: typeof d.additions === 'number' ? d.additions : prev.additions,
                  deletions: typeof d.deletions === 'number' ? d.deletions : prev.deletions,
                  changedFiles:
                    typeof d.changedFiles === 'number' ? d.changedFiles : prev.changedFiles,
                }
              : prev,
          );
        }
      } catch {
        // Stats stay unknown — the header renders '—'.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPR, repoId]);

  // Load the REAL unified diff from GET /:id/pulls/:number/diff whenever the
  // selected PR changes. The endpoint computes `git diff -p base..head`
  // server-side; the text is parsed client-side into per-file hunks. Results
  // are cached per PR key so switching back never refetches. On any failure
  // or empty payload the section keeps the honest "not available" state —
  // diff content is never invented.
  const diffFetchedFor = React.useRef<Set<string>>(new Set());
  const [prDiffByKey, setPrDiffByKey] = useState<
    Record<string, { status: 'loading' | 'loaded' | 'empty' | 'error'; files: PRDiffFile[] }>
  >({});
  const diffFetchKey = selectedPR
    ? `${repoId}:${(selectedPR as any).number || selectedPR.id}`
    : null;
  const prDiff = diffFetchKey ? (prDiffByKey[diffFetchKey] ?? null) : null;
  const prDiffTotals = React.useMemo(() => {
    if (!prDiff || prDiff.status !== 'loaded') return null;
    let additions = 0;
    let deletions = 0;
    for (const f of prDiff.files) {
      additions += f.additions;
      deletions += f.deletions;
    }
    return { additions, deletions };
  }, [prDiff]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedPR || !diffFetchKey) return;
    if (diffFetchedFor.current.has(diffFetchKey)) return;
    diffFetchedFor.current.add(diffFetchKey);
    setPrDiffByKey((prev) => ({ ...prev, [diffFetchKey]: { status: 'loading', files: [] } }));
    (async () => {
      try {
        const prNumber = (selectedPR as any).number || selectedPR.id;
        const res = await apiFetchRaw(
          `/api/repos/${encodeURIComponent(repoId ?? '')}/pulls/${prNumber}/diff`,
        );
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        const text = res.ok && json?.success ? json.data : null;
        if (typeof text === 'string' && text.trim().length > 0) {
          const files = parseUnifiedDiff(text);
          setPrDiffByKey((prev) => ({
            ...prev,
            [diffFetchKey]: { status: files.length > 0 ? 'loaded' : 'empty', files },
          }));
        } else {
          setPrDiffByKey((prev) => ({
            ...prev,
            [diffFetchKey]: { status: 'empty', files: [] },
          }));
        }
      } catch {
        if (!cancelled)
          setPrDiffByKey((prev) => ({
            ...prev,
            [diffFetchKey]: { status: 'error', files: [] },
          }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPR, repoId, diffFetchKey]);

  // Inline diff comments — empty until real data arrives. Never invent
  // comments or reviewers. The open comment box is keyed by the viewer's
  // unique line key (PRDiffLine.id); the backend line reference
  // (`filePath-l<line>`) plus side is what gets POSTed.
  const [activeCommentLineKey, setActiveCommentLineKey] = useState<string | null>(null);
  const [lineCommentText, setLineCommentText] = useState<string>('');
  const [diffComments, setDiffComments] = useState<Record<string, PRDiffComment[]>>({});

  const isAuthor = Boolean(
    selectedPR && selectedPR.author && currentUsername && selectedPR.author === currentUsername,
  );

  const handleAddInlineComment = async (lineId: string, side: 'LEFT' | 'RIGHT' = 'RIGHT') => {
    const body = lineCommentText.trim();
    if (!body) return;
    const prNumber = selectedPR ? (selectedPR as any).number || selectedPR.id : null;
    if (!prNumber) {
      showToast?.('Could not add inline comment: no pull request selected.');
      return;
    }
    // The backend needs a real file path and line number. The client-side
    // lineId is `filePath-l<line>`; never invent values when it cannot be parsed.
    const match = /^(.*)-l(\d+)$/.exec(lineId);
    const line = match ? parseInt(match[2], 10) : NaN;
    if (!match || Number.isNaN(line)) {
      showToast?.('Could not add inline comment: unrecognized diff line reference.');
      return;
    }
    try {
      const res = await apiFetchRaw(
        `/api/repos/${encodeURIComponent(repoId)}/pulls/${prNumber}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // side is LEFT for removed lines (old line number), RIGHT otherwise.
          body: JSON.stringify({ filePath: match[1], line, side, body }),
        },
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        // Add to local state ONLY on real API success — never lie.
        const created = json.data ?? {};
        const newComment: PRDiffComment = {
          id: String(created.id ?? `c-${Date.now()}`),
          lineId,
          author: created.author?.username || currentUsername,
          body: created.body ?? body,
          createdAt: created.createdAt ? new Date(created.createdAt).toLocaleString() : 'Just now',
          side,
        };
        setDiffComments((prev) => ({
          ...prev,
          [lineId]: [...(prev[lineId] || []), newComment],
        }));
        setLineCommentText('');
        setActiveCommentLineKey(null);
        showToast?.('Inline review comment added');
      } else {
        showToast?.(json?.error?.message || 'Could not add inline comment');
      }
    } catch {
      showToast?.('Could not add inline comment — network error');
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAuthor && reviewDecision === 'approve') {
      showToast?.('Authors cannot approve their own pull requests.');
      return;
    }
    const prNumber = selectedPR ? (selectedPR as any).number || selectedPR.id : null;
    if (!prNumber) {
      showToast?.('Could not submit review: no pull request selected.');
      return;
    }

    const stateMap: Record<PRReviewDecision, 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED'> = {
      approve: 'APPROVED',
      request_changes: 'CHANGES_REQUESTED',
      comment: 'COMMENTED',
    };
    const status = stateMap[reviewDecision];
    const body =
      reviewCommentText.trim() ||
      (reviewDecision === 'approve'
        ? 'Approved changes.'
        : reviewDecision === 'request_changes'
          ? 'Requested changes before merge.'
          : 'Submitted general comments.');

    // Optimistic add; it rolls back if the API rejects or the network fails.
    const tempId = `rev-${Date.now()}`;
    const newReview: PRReviewItem = {
      id: tempId,
      author: currentUsername,
      state: status,
      body,
      createdAt: 'Just now',
    };
    setReviews((prev) => [...prev, newReview]);
    setIsReviewBoxOpen(false);
    setReviewCommentText('');

    try {
      const res = await apiFetchRaw(
        `/api/repos/${encodeURIComponent(repoId)}/pulls/${prNumber}/reviews`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, body }),
        },
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        // Swap the optimistic row for the real server record.
        setReviews((prev) =>
          prev.map((r) => (r.id === tempId ? { ...r, id: String(json.data.id ?? r.id) } : r)),
        );
        showToast?.(`Review submitted: ${reviewDecision.replace('_', ' ')}`);
      } else {
        setReviews((prev) => prev.filter((r) => r.id !== tempId));
        showToast?.(json?.error?.message || 'Could not submit review');
      }
    } catch {
      setReviews((prev) => prev.filter((r) => r.id !== tempId));
      showToast?.('Could not submit review — network error');
    }
  };

  const handleExecuteMerge = async () => {
    if (!selectedPR) return;
    setIsMerging(true);

    const prNumber = (selectedPR as any).number || selectedPR.id;

    try {
      let merged = false;
      let backendError: string | null = null;
      if (onMergePR) {
        // Parent owns the merge and resolves true ONLY when it genuinely
        // succeeded. Anything else (false / undefined / throw) means the PR
        // stays open — never claim a merge that did not happen.
        merged = (await onMergePR(prNumber, selectedMergeMethod)) === true;
      } else {
        const res = await apiFetchRaw(
          `/api/repos/${encodeURIComponent(repoId)}/pulls/${prNumber}/merge`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: selectedMergeMethod }),
          },
        );
        merged = res.ok;
        if (!merged) {
          // Surface the backend's real error (e.g. 409 "Merge conflict
          // detected") instead of a vague generic message — honest errors only.
          const json = await res.json().catch(() => null);
          const msg =
            typeof json?.error?.message === 'string' ? json.error.message.trim() : '';
          backendError = msg || null;
        }
      }

      if (merged) {
        setSelectedPR((prev) => (prev ? { ...prev, state: 'merged' } : null));
        setIsMergeConfirmOpen(false);
        showToast?.(`Pull request #${prNumber} merged successfully!`);
      } else {
        // Do not claim success when the merge did not happen.
        showToast?.(backendError || `Could not merge pull request #${prNumber}. Please try again.`);
      }
    } catch {
      showToast?.(`Could not merge pull request #${prNumber}. Please try again.`);
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="space-y-4 text-xs text-[#E6EDF3]" data-testid="pull-requests-tab">
      {selectedPR ? (
        /* PR Detail View with 3-Way Diff, Review Decisions & Merge Box */
        <div className="space-y-6" data-testid="pr-detail-view">
          {/* Header */}
 <div className="space-y-3 pb-4">
            <button
              onClick={() => setSelectedPR(null)}
              data-testid="back-to-pulls-btn"
              className="text-[#58A6FF] hover:underline flex items-center gap-1.5 font-medium cursor-pointer"
            >
              <span>← Back to all pull requests</span>
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-[#E6EDF3] flex items-center gap-2">
                <span>{selectedPR.title}</span>
                <span className="text-[#8D96A0] font-normal">#{selectedPR.id}</span>
              </h2>

              <div className="flex items-center gap-3">
                <span className="text-[11px] text-[#8D96A0]">
                  {/* Honest diff stats: real numbers from the detail endpoint,
                      '—' when unknown — never invented +24/-5 counts. */}
                  <strong className="text-emerald-400">+{selectedPR.additions ?? '—'}</strong> /{' '}
                  <strong className="text-red-400">-{selectedPR.deletions ?? '—'}</strong> lines
                </span>

                {/* Review changes button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsReviewBoxOpen((prev) => !prev)}
                    data-testid="review-changes-btn"
                    className="px-3 py-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-[#E6EDF3] font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Review changes</span>
                    <span className="text-[10px]">▼</span>
                  </button>

                  {/* Review Decision Dropdown Box */}
                  {isReviewBoxOpen && (
                    <div
                      data-testid="review-changes-box"
                      className="absolute right-0 top-full mt-2 w-80 bg-[var(--quant-surface-elevated)] border border-[#30363D] rounded-xl p-4 shadow-2xl z-50 space-y-3 animate-in fade-in"
                    >
 <div className="flex items-center justify-between pb-2">
                        <span className="font-bold text-xs text-[#E6EDF3]">Review changes</span>
                        <button
                          type="button"
                          onClick={() => setIsReviewBoxOpen(false)}
                          className="text-[#8D96A0] hover:text-[#E6EDF3] cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>

                      <form onSubmit={handleSubmitReview} className="space-y-3">
                        <div>
                          <textarea
                            value={reviewCommentText}
                            onChange={(e) => setReviewCommentText(e.target.value)}
                            placeholder="Leave a comment on changes..."
                            data-testid="review-comment-textarea"
                            rows={3}
                            className="w-full bg-[#0D1117] border border-[#30363D] focus:border-[#58A6FF] rounded-lg p-2.5 text-xs text-[#E6EDF3] placeholder-[#8D96A0] outline-none resize-none"
                          />
                        </div>

                        {/* Author approval restriction warning */}
                        {isAuthor && (
                          <div
                            data-testid="author-approval-restriction"
                            className="p-2 rounded bg-red-500/10 border border-red-500/20 text-[#F85149] text-[11px] leading-tight flex items-center gap-1.5"
                          >
                            <QuantGitWarningIcon size={14} />
                            <span>Authors cannot approve their own pull requests.</span>
                          </div>
                        )}

                        <div className="space-y-2 text-[11px]">
                          {/* Comment option */}
                          <label
                            data-testid="review-option-comment"
                            className="flex items-start gap-2 cursor-pointer p-1.5 rounded hover:bg-[#21262D]"
                          >
                            <input
                              type="radio"
                              name="review_decision"
                              value="comment"
                              checked={reviewDecision === 'comment'}
                              onChange={() => setReviewDecision('comment')}
                              className="mt-0.5 text-[#58A6FF]"
                            />
                            <div>
                              <span className="font-semibold text-[#E6EDF3] block">Comment</span>
                              <span className="text-[#8D96A0]">
                                Submit general feedback without explicit approval.
                              </span>
                            </div>
                          </label>

                          {/* Approve option */}
                          <label
                            data-testid="review-option-approve"
                            className={`flex items-start gap-2 p-1.5 rounded ${
                              isAuthor
                                ? 'opacity-50 cursor-not-allowed'
                                : 'cursor-pointer hover:bg-[#21262D]'
                            }`}
                          >
                            <input
                              type="radio"
                              name="review_decision"
                              value="approve"
                              disabled={isAuthor}
                              checked={reviewDecision === 'approve'}
                              onChange={() => {
                                if (!isAuthor) setReviewDecision('approve');
                              }}
                              className="mt-0.5 text-[#3FB950]"
                            />
                            <div>
                              <span className="font-semibold text-[#3FB950] block">
                                Approve {isAuthor ? '(Disabled for Author)' : ''}
                              </span>
                              <span className="text-[#8D96A0]">
                                Submit feedback and approve merging these changes.
                              </span>
                            </div>
                          </label>

                          {/* Request changes option */}
                          <label
                            data-testid="review-option-request_changes"
                            className="flex items-start gap-2 cursor-pointer p-1.5 rounded hover:bg-[#21262D]"
                          >
                            <input
                              type="radio"
                              name="review_decision"
                              value="request_changes"
                              checked={reviewDecision === 'request_changes'}
                              onChange={() => setReviewDecision('request_changes')}
                              className="mt-0.5 text-[#F85149]"
                            />
                            <div>
                              <span className="font-semibold text-[#F85149] block">
                                Request changes
                              </span>
                              <span className="text-[#8D96A0]">
                                Submit feedback that must be addressed before merging.
                              </span>
                            </div>
                          </label>
                        </div>

 <div className="pt-2 flex justify-end">
                          <button
                            type="submit"
                            data-testid="submit-review-btn"
                            className="px-3.5 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
                          >
                            Submit review
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* State pill + Branch branch link */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#8D96A0]">
              <span
                data-testid={`pr-state-${selectedPR.state}`}
                className={`px-2.5 py-0.5 rounded-full text-white font-semibold flex items-center gap-1.5 ${
                  selectedPR.state === 'merged'
                    ? 'bg-[#8957E5]'
                    : selectedPR.state === 'open'
                      ? 'bg-[#238636]'
                      : 'bg-[#DA3633]'
                }`}
              >
                <QuantGitPRIcon size={12} />
                <span>
                  {selectedPR.state === 'merged'
                    ? 'Merged'
                    : selectedPR.state === 'open'
                      ? 'Open'
                      : 'Closed'}
                </span>
              </span>

              {selectedPR.state === 'merged' ? (
                <span data-testid="pr-merged-info">
                  Merged by{' '}
                  <strong className="text-[#E6EDF3]">{selectedPR.author || 'Unknown'}</strong>{' '}
                  into{' '}
                  <span className="px-1.5 py-px rounded bg-[#21262D] text-[#58A6FF] font-mono">
                    {selectedPR.branchTarget || 'main'}
                  </span>{' '}
                  from{' '}
                  <span className="px-1.5 py-px rounded bg-[#21262D] text-[#58A6FF] font-mono">
                    {selectedPR.branchSource}
                  </span>
                </span>
              ) : (
                <span>
                  <strong className="text-[#E6EDF3]">{selectedPR.author || 'Unknown'}</strong> wants to merge
                  into{' '}
                  <span className="px-1.5 py-px rounded bg-[#21262D] text-[#58A6FF] font-mono">
                    {selectedPR.branchTarget || 'main'}
                  </span>{' '}
                  from{' '}
                  <span className="px-1.5 py-px rounded bg-[#21262D] text-[#58A6FF] font-mono">
                    {selectedPR.branchSource}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Reviews Status Bar */}
          <div className="rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] p-3.5 space-y-2">
            <h4 className="font-bold text-xs text-[#E6EDF3] flex items-center justify-between">
              <span>Review decisions:</span>
              <span className="text-[#8D96A0] text-[11px] font-normal">
                {reviews.length} submitted
              </span>
            </h4>
            <div className="space-y-2">
              {reviews.length === 0 ? (
                <p data-testid="reviews-empty" className="text-[11px] text-[#8D96A0]">
                  No reviews submitted yet.
                </p>
              ) : (
                reviews.map((rev) => (
                  <div
                    key={rev.id}
                    data-testid={`review-item-${rev.id}`}
                    className="flex items-start justify-between p-2 rounded bg-[#0D1117] border border-[#21262D] text-[11px]"
                  >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#E6EDF3]">{rev.author}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold flex items-center gap-1 ${
                          rev.state === 'APPROVED'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : rev.state === 'CHANGES_REQUESTED'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {rev.state === 'APPROVED' ? (
                          <>
                            <QuantGitCheckIcon size={10} /> Approved
                          </>
                        ) : rev.state === 'CHANGES_REQUESTED' ? (
                          <>
                            <QuantGitXIcon size={10} /> Changes requested
                          </>
                        ) : (
                          <>
                            <QuantGitCommentIcon size={10} /> Commented
                          </>
                        )}
                      </span>
                    </div>
                    <p className="text-[#8D96A0]">{rev.body}</p>
                  </div>
                  <span className="text-[#8D96A0] text-[10px]">{rev.createdAt}</span>
                </div>
                ))
              )}
            </div>
          </div>

          {/* Automated Security & CI Status Check Box */}
          <div
            className="rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] p-4 space-y-3"
            data-testid="security-ci-checks-box"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    allChecksPassed
                      ? 'text-emerald-400'
                      : anyCheckFailed
                        ? 'text-red-400'
                        : 'text-[#D29922]'
                  }`}
                >
                  {allChecksPassed ? (
                    <QuantGitCheckCircleIcon size={20} />
                  ) : anyCheckFailed ? (
                    <QuantGitXCircleIcon size={20} />
                  ) : (
                    <QuantGitPendingDotIcon size={20} />
                  )}
                </span>
                <span className="font-semibold text-xs text-[#E6EDF3]">
                  {allChecksPassed
                    ? 'All checks have passed'
                    : anyCheckFailed
                      ? 'Some checks have failed or are required before merging'
                      : 'Checks status unknown — no check results available'}
                </span>
              </div>
              {checksKnown && (
                <button className="text-[#58A6FF] hover:underline text-[11px]">
                  Show all checks
                </button>
              )}
            </div>

            {checksKnown ? (
              <div
 className="text-[11px] text-[#8D96A0] pt-1"
                data-testid="security-ci-checks-list"
              >
                {activeChecks.map((check) => (
                <div
                  key={check.id}
                  className="py-1.5 flex items-center justify-between"
                  data-testid={`check-${check.id}`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={
                        check.status === 'passed'
                          ? 'text-[#3FB950]'
                          : check.status === 'failed'
                            ? 'text-[#F85149]'
                            : 'text-[#D29922]'
                      }
                    >
                      {check.status === 'passed' ? (
                        <QuantGitCheckCircleIcon size={16} />
                      ) : check.status === 'failed' ? (
                        <QuantGitXCircleIcon size={16} />
                      ) : (
                        <QuantGitPendingDotIcon size={16} />
                      )}
                    </span>
                    <span className="font-mono text-[#E6EDF3]">{check.name}</span>
                    <span>: {check.description}</span>
                  </span>
                  <span
                    className={`font-mono ${
                      check.status === 'passed'
                        ? 'text-emerald-400'
                        : check.status === 'failed'
                          ? 'text-red-400'
                          : 'text-amber-400'
                    }`}
                  >
                    {check.status === 'passed'
                      ? 'Passed'
                      : check.status === 'failed'
                        ? 'Failed'
                        : 'Pending'}
                  </span>
                </div>
              ))}
              </div>
            ) : (
              <p
                className="text-[11px] text-[#8D96A0] pt-1"
                data-testid="security-ci-checks-unknown"
              >
                No checks have been reported for this pull request yet. Status is unknown — this is
                neither a pass nor a failure.
              </p>
            )}

            {/* Merge Action Box */}
 <div className="pt-3" data-testid="merge-box-container">
              {selectedPR.state === 'open' ? (
                mergeAllowed ? (
                  <div className="space-y-3" data-testid="merge-enabled-box">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Conflict status comes ONLY from the backend pre-check
                          (GET /:id/pulls/:number/mergeable). It never claims
                          "no conflicts" before the check completes. */}
                      <MergeConflictStatus check={mergeConflictCheck} />

                      {/* Merge strategy selector and button */}
                      <div className="flex items-center gap-1.5">
                        <select
                          aria-label="Merge method" value={selectedMergeMethod}
                          onChange={(e) => setSelectedMergeMethod(e.target.value as MergeMethod)}
                          data-testid="merge-method-select"
                          className="bg-[#21262D] border border-[#30363D] text-[#E6EDF3] text-xs rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
                        >
                          <option value="merge">Merge pull request (create merge commit)</option>
                          <option value="squash">Squash and merge (1 commit)</option>
                          <option value="rebase">Rebase and merge (linear history)</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => setIsMergeConfirmOpen((prev) => !prev)}
                          data-testid="merge-pr-btn"
                          className="px-4 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>
                            {selectedMergeMethod === 'squash'
                              ? 'Squash and merge'
                              : selectedMergeMethod === 'rebase'
                                ? 'Rebase and merge'
                                : 'Merge pull request'}
                          </span>
                          <span className="text-[10px]">▼</span>
                        </button>
                      </div>
                    </div>

                    {/* Merge Confirmation Form */}
                    {isMergeConfirmOpen && (
                      <div
                        data-testid="merge-confirm-box"
                        className="p-3.5 bg-[#0D1117] rounded-lg border border-[#30363D] space-y-3 animate-in fade-in"
                      >
                        <div className="space-y-1">
                          <span className="font-bold text-xs text-[#E6EDF3]">
                            {selectedMergeMethod === 'squash'
                              ? 'Squash and merge pull request'
                              : selectedMergeMethod === 'rebase'
                                ? 'Rebase and merge pull request'
                                : 'Merge pull request'}
                          </span>
                          <p className="text-[11px] text-[#8D96A0]">
                            {selectedMergeMethod === 'squash'
                              ? 'The commits from this branch will be squashed into one commit on the base branch.'
                              : selectedMergeMethod === 'rebase'
                                ? 'The commits from this branch will be rebased and added to the base branch without a merge commit.'
                                : 'All commits from this branch will be added to the base branch via a merge commit.'}
                          </p>
                        </div>

                        <div>
                          <input
                            type="text"
                            value={mergeCommitMsg}
                            onChange={(e) => setMergeCommitMsg(e.target.value)}
                            placeholder={`Merge pull request #${(selectedPR as any).number || selectedPR.id} from ${selectedPR.branchSource}`}
                            data-testid="merge-commit-input"
                            className="w-full bg-[var(--quant-surface-elevated)] border border-[#30363D] focus:border-[#58A6FF] rounded px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#8D96A0] outline-none"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleExecuteMerge}
                            disabled={isMerging}
                            data-testid="confirm-merge-btn"
                            className="px-4 py-2 rounded-lg bg-[#238636] hover:bg-[#2EA043] disabled:opacity-50 text-white font-bold text-xs shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <QuantGitPRIcon size={14} />
                            <span>
                              {isMerging
                                ? 'Merging...'
                                : selectedMergeMethod === 'squash'
                                  ? 'Confirm squash and merge'
                                  : selectedMergeMethod === 'rebase'
                                    ? 'Confirm rebase and merge'
                                    : 'Confirm merge'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsMergeConfirmOpen(false)}
                            className="px-3 py-2 text-[#8D96A0] hover:text-[#E6EDF3] text-xs font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="p-3.5 bg-red-950/20 border border-red-500/30 rounded-lg flex items-center justify-between text-xs"
                    data-testid="merge-blocked-box"
                  >
                    <div className="flex flex-col gap-1 text-red-400">
                      <div className="flex items-center gap-2">
                        <QuantGitXIcon size={14} />
                        <span className="font-semibold">
                          {mergeConflictCheck.status === 'conflict'
                            ? 'Merging is blocked. Resolve the merge conflicts above before merging.'
                            : 'Merging is blocked. Required security & CI checks must pass before merging.'}
                        </span>
                      </div>
                      {mergeConflictCheck.status === 'conflict' &&
                        (mergeConflictCheck.conflicts ?? []).length > 0 && (
                          <span className="text-[11px] text-[#8D96A0] font-mono pl-6">
                            Conflicting files: {mergeConflictCheck.conflicts.join(', ')}
                          </span>
                        )}
                    </div>
                    <button
                      type="button"
                      disabled
                      data-testid="merge-blocked-btn"
                      className="px-4 py-1.5 rounded-lg bg-[#21262D] text-[#8D96A0] font-bold text-xs cursor-not-allowed opacity-50"
                    >
                      Merge blocked
                    </button>
                  </div>
                )
              ) : selectedPR.state === 'merged' ? (
                <div
                  data-testid="merged-status-banner"
                  className="bg-[#8957E5]/10 border border-[#8957E5]/30 rounded-lg p-3.5 flex items-center gap-2.5 text-[#A371F7]"
                >
                  <QuantGitCheckIcon size={16} />
                  <span className="font-semibold text-xs">
                    Pull request #{(selectedPR as any).number || selectedPR.id} was successfully
                    merged and closed. Merged by {selectedPR.author || 'Unknown'} into{' '}
                    {selectedPR.branchTarget || 'main'}.
                  </span>
                </div>
              ) : (
                <div className="bg-[#DA3633]/10 border border-[#DA3633]/30 rounded-lg p-3.5 flex items-center gap-2.5 text-[#F85149]">
                  <QuantGitXIcon size={16} />
                  <span className="font-semibold text-xs">This pull request is closed.</span>
                </div>
              )}
            </div>
          </div>

          {/* Diff section: renders the REAL per-file diff fetched from
              GET /api/repos/:id/pulls/:number/diff (server-side
              `git diff -p base..head`, parsed client-side into file hunks).
              No view-mode toggle is rendered here on purpose — PR #1090
              removed the dead mode toggles and they stay removed. */}
          <div className="space-y-4" data-testid="diff-viewer">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[#E6EDF3]">
                Files changed ({selectedPR?.changedFiles ?? '—'})
              </span>
              {prDiffTotals && (
                <span className="text-[11px] font-mono">
                  <span className="text-[#3FB950]">+{prDiffTotals.additions}</span>{' '}
                  <span className="text-[#F85149]">-{prDiffTotals.deletions}</span>
                </span>
              )}
            </div>

            {/* Only a real measured zero means "no files changed". Unknown
                (null/undefined) or an empty/failed diff fetch shows the
                honest not-available state — never invented file contents. */}
            {selectedPR?.changedFiles === 0 ? (
              <div
                data-testid="diff-empty"
                className="rounded-xl bg-[#0D1117] border border-dashed border-[#30363D] p-8 text-center"
              >
                <p className="text-xs text-[#8D96A0]">No files changed in this pull request.</p>
              </div>
            ) : prDiff?.status === 'loaded' ? (
              <PRDiffViewer
                files={prDiff.files}
                activeLineKey={activeCommentLineKey}
                lineCommentText={lineCommentText}
                diffComments={diffComments}
                onOpenLine={setActiveCommentLineKey}
                onCancelLine={() => {
                  setActiveCommentLineKey(null);
                  setLineCommentText('');
                }}
                onChangeCommentText={setLineCommentText}
                onSubmitComment={handleAddInlineComment}
              />
            ) : prDiff?.status === 'loading' ? (
              <div
                data-testid="diff-loading"
                className="rounded-xl bg-[#0D1117] border border-dashed border-[#30363D] p-8 text-center"
              >
                <p className="text-xs text-[#8D96A0]">Loading diff…</p>
              </div>
            ) : (
              <div
                data-testid="diff-unavailable"
                className="rounded-xl bg-[#0D1117] border border-dashed border-[#30363D] p-8 text-center"
              >
                <p className="text-xs text-[#8D96A0]">
                  Diff preview is not available for this pull request yet.
                </p>
                <p className="mt-1 text-[11px] text-[#6E7681]">
                  Browse the repository code tab to review the changes.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* PR List View */
        <div className="space-y-4" data-testid="pr-list-view">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[260px]">
              <input
                type="text"
                value={pullSearchQuery}
                onChange={(e) => setPullSearchQuery(e.target.value)}
                placeholder="is:pr state:open ..."
                data-testid="pull-search-input"
                className="w-full bg-[var(--quant-surface-elevated)] border border-[#30363D] focus:border-[#58A6FF] rounded-lg px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#8D96A0] outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setModalState?.('new-pr')}
              data-testid="new-pr-btn"
              className="px-3.5 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
            >
              New pull request
            </button>
          </div>

          <div className="border border-[#30363D] rounded-xl bg-[#0D1117] overflow-hidden">
 <div className="bg-[var(--quant-surface-elevated)] px-4 py-3 flex items-center justify-between font-semibold">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setPullSearchQuery('is:pr state:open')}
                  data-testid="open-pulls-filter"
                  className={`flex items-center gap-1.5 cursor-pointer ${
                    !pullSearchQuery.includes('state:closed')
                      ? 'text-white font-bold'
                      : 'text-[#8D96A0]'
                  }`}
                >
                  <span className="text-[#3FB950] flex">
                    <QuantGitPRIcon size={14} />
                  </span>{' '}
                  {openPullsCount} Open
                </button>
                <button
                  type="button"
                  onClick={() => setPullSearchQuery('is:pr state:closed')}
                  data-testid="closed-pulls-filter"
                  className={`flex items-center gap-1.5 cursor-pointer ${
                    pullSearchQuery.includes('state:closed')
                      ? 'text-white font-bold'
                      : 'text-[#8D96A0]'
                  }`}
                >
                  <span className="text-[#8957E5] flex">
                    <QuantGitCheckIcon size={14} />
                  </span>{' '}
                  {closedPullsCount} Closed
                </button>
              </div>
            </div>

 <div>
              {isLoading ? (
                <QuantGitRowSkeleton rows={5} testId="pr-list-skeleton" />
              ) : filteredPulls.length === 0 ? (
                <QuantGitEmptyState
                  icon="pr"
                  title="No pull requests"
                  hint={
                    pullSearchQuery.includes('state:closed')
                      ? 'There are no closed pull requests matching your search.'
                      : 'There are no open pull requests. Create one to start collaborating.'
                  }
                  actionLabel="New pull request"
                  onAction={() => setModalState?.('new-pr')}
                  testId="pr-list-empty"
                />
              ) : (
                filteredPulls.map((pr) => (
                  <button
                    key={pr.id}
                    type="button"
                    data-testid={`pr-row-${pr.id}`}
                    onClick={() => {
                      setSelectedPR(pr);
                      openPullDetail?.(pr);
                    }}
                    aria-label={`Open pull request ${pr.title}`}
                    className="w-full p-4 hover:bg-[var(--quant-surface-elevated)] transition-colors flex items-start justify-between gap-4 group text-left cursor-pointer"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            pr.state === 'merged'
                              ? 'text-[#8957E5]'
                              : pr.state === 'open'
                                ? 'text-[#3FB950]'
                                : 'text-[#DA3633]'
                          }
                        >
                          <QuantGitPRIcon size={16} />
                        </span>
                        <span className="font-semibold text-sm text-[#E6EDF3] group-hover:text-[#58A6FF] transition-colors">
                          {pr.title}
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-[#1F242C] text-[#58A6FF] font-mono text-[10px]">
                          {pr.branchSource}
                        </span>
                        <span className="px-1.5 py-0.2 rounded border border-[#30363D] text-[#8D96A0] text-[10px] font-semibold flex items-center gap-1">
                          <QuantGitPendingDotIcon size={10} /> Checks unknown
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#8D96A0] text-[10px]">
                          Review required
                        </span>
                      </div>
                      <p className="text-xs text-[#8D96A0]">
                        #{pr.id} by {pr.author || 'Unknown'} was {pr.state} {pr.createdAt}
                        {/* Diff stats only when actually known — never invented. */}
                        {(pr.additions != null || pr.deletions != null) && (
                          <>
                            {' '}· +{pr.additions ?? '—'} -{pr.deletions ?? '—'}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[#8D96A0] shrink-0">
                      <QuantGitCommentIcon size={14} />
                      {/* Unknown count renders as '—', never an invented 0. */}
                      <span className="text-xs">{pr.commentsCount ?? '—'}</span>
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
