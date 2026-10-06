'use client';

// ============================================================================
// QuantGit — Pull Requests Engine, 3-Way Merge & CI Review Gate (Screens 27, 73–74, 99–103)
// ============================================================================

import React, { useState } from 'react';
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
  onMergePR?: (prId: number, mergeMethod: MergeMethod) => Promise<void> | void;
  initialSelectedPR?: PRItem | null;
  checks?: SecurityCheckItem[];
  initialMergeMethod?: MergeMethod;
  initialIsMergeConfirmOpen?: boolean;
  /** When true, renders skeleton rows instead of the PR list. */
  isLoading?: boolean;
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
  const [diffViewMode, setDiffViewMode] = useState<'unified' | 'split'>('unified');

  // Merge controls
  const [selectedMergeMethod, setSelectedMergeMethod] = useState<MergeMethod>(initialMergeMethod);
  const [isMergeConfirmOpen, setIsMergeConfirmOpen] = useState<boolean>(initialIsMergeConfirmOpen);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [mergeCommitMsg, setMergeCommitMsg] = useState<string>('');

  const DEFAULT_SECURITY_CHECKS: SecurityCheckItem[] = [
    {
      id: 'ci-quantgit-actions',
      name: 'ci/quantgit-actions',
      description: 'All tests passed.',
      status: 'passed',
    },
    {
      id: 'security-secret-scan',
      name: 'security/secret-scan',
      description: 'No leaked credentials found.',
      status: 'passed',
    },
    {
      id: 'security-dependabot',
      name: 'security/dependabot',
      description: '0 critical or high vulnerabilities.',
      status: 'passed',
    },
  ];

  const activeChecks = React.useMemo(() => {
    if (checks && checks.length > 0) return checks;
    if (selectedPR?.checksStatus === 'failing') {
      return [
        {
          id: 'ci-quantgit-actions',
          name: 'ci/quantgit-actions',
          description: 'All tests passed.',
          status: 'failed' as const,
        },
        DEFAULT_SECURITY_CHECKS[1],
        DEFAULT_SECURITY_CHECKS[2],
      ];
    }
    return DEFAULT_SECURITY_CHECKS;
  }, [checks, selectedPR?.checksStatus]);

  const allChecksPassed =
    activeChecks.every((c) => c.status === 'passed') && selectedPR?.checksStatus !== 'failing';

  // Review decisions
  const [isReviewBoxOpen, setIsReviewBoxOpen] = useState<boolean>(false);
  const [reviewDecision, setReviewDecision] = useState<PRReviewDecision>('comment');
  const [reviewCommentText, setReviewCommentText] = useState<string>('');
  const [reviews, setReviews] = useState<PRReviewItem[]>([
    {
      id: 'rev-1',
      author: 'ai-sdk-factory[bot]',
      state: 'APPROVED',
      body: 'Automated CI test gates & CodeQL checks passed with 100% test coverage.',
      createdAt: '10 minutes ago',
    },
  ]);

  // Inline diff comments
  const [activeCommentLineId, setActiveCommentLineId] = useState<string | null>(null);
  const [lineCommentText, setLineCommentText] = useState<string>('');
  const [diffComments, setDiffComments] = useState<Record<string, PRDiffComment[]>>({
    'diff-1-l6': [
      {
        id: 'c-1',
        lineId: 'diff-1-l6',
        author: 'edward0127',
        body: 'Make sure speech metric telemetry handles zero-latency web socket disconnects.',
        createdAt: '15 minutes ago',
      },
    ],
  });

  const isAuthor = Boolean(
    selectedPR && selectedPR.author && currentUsername && selectedPR.author === currentUsername,
  );

  const handleAddInlineComment = (lineId: string) => {
    if (!lineCommentText.trim()) return;
    const newComment: PRDiffComment = {
      id: `c-${Date.now()}`,
      lineId,
      author: currentUsername,
      body: lineCommentText.trim(),
      createdAt: 'Just now',
    };
    setDiffComments((prev) => ({
      ...prev,
      [lineId]: [...(prev[lineId] || []), newComment],
    }));
    setLineCommentText('');
    setActiveCommentLineId(null);
    showToast?.('Inline review comment added');
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAuthor && reviewDecision === 'approve') {
      showToast?.('Authors cannot approve their own pull requests.');
      return;
    }

    const stateMap: Record<PRReviewDecision, 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED'> = {
      approve: 'APPROVED',
      request_changes: 'CHANGES_REQUESTED',
      comment: 'COMMENTED',
    };

    const newReview: PRReviewItem = {
      id: `rev-${Date.now()}`,
      author: currentUsername,
      state: stateMap[reviewDecision],
      body:
        reviewCommentText.trim() ||
        (reviewDecision === 'approve'
          ? 'Approved changes.'
          : reviewDecision === 'request_changes'
            ? 'Requested changes before merge.'
            : 'Submitted general comments.'),
      createdAt: 'Just now',
    };

    setReviews((prev) => [...prev, newReview]);
    setIsReviewBoxOpen(false);
    setReviewCommentText('');
    showToast?.(`Review submitted: ${reviewDecision.replace('_', ' ')}`);
  };

  const handleExecuteMerge = async () => {
    if (!selectedPR) return;
    setIsMerging(true);

    const prNumber = (selectedPR as any).number || selectedPR.id;

    try {
      let merged = false;
      if (onMergePR) {
        // Parent owns the merge; a throw here means it failed.
        await onMergePR(prNumber, selectedMergeMethod);
        merged = true;
      } else {
        const res = await fetch(
          `/api/repos/${encodeURIComponent(repoId)}/pulls/${prNumber}/merge`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: selectedMergeMethod }),
          },
        );
        merged = res.ok;
      }

      if (merged) {
        setSelectedPR((prev) => (prev ? { ...prev, state: 'merged' } : null));
        setIsMergeConfirmOpen(false);
        showToast?.(`Pull request #${prNumber} merged successfully!`);
      } else {
        // Do not claim success when the merge did not happen.
        showToast?.(`Could not merge pull request #${prNumber}. Please try again.`);
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
          <div className="space-y-3 pb-4 border-b border-[#30363D]">
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
                  <strong className="text-emerald-400">+{selectedPR.additions ?? 24}</strong> /{' '}
                  <strong className="text-red-400">-{selectedPR.deletions ?? 5}</strong> lines
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
                      className="absolute right-0 top-full mt-2 w-80 bg-[#161B22] border border-[#30363D] rounded-xl p-4 shadow-2xl z-50 space-y-3 animate-in fade-in"
                    >
                      <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
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

                        <div className="pt-2 border-t border-[#30363D] flex justify-end">
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
                  <strong className="text-[#E6EDF3]">{selectedPR.author || currentUsername}</strong>{' '}
                  into{' '}
                  <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#58A6FF] font-mono">
                    {selectedPR.branchTarget || 'main'}
                  </span>{' '}
                  from{' '}
                  <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#58A6FF] font-mono">
                    {selectedPR.branchSource}
                  </span>
                </span>
              ) : (
                <span>
                  <strong className="text-[#E6EDF3]">{selectedPR.author}</strong> wants to merge
                  into{' '}
                  <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#58A6FF] font-mono">
                    {selectedPR.branchTarget || 'main'}
                  </span>{' '}
                  from{' '}
                  <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#58A6FF] font-mono">
                    {selectedPR.branchSource}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Reviews Status Bar */}
          <div className="rounded-xl bg-[#161B22] border border-[#30363D] p-3.5 space-y-2">
            <h4 className="font-bold text-xs text-[#E6EDF3] flex items-center justify-between">
              <span>Review decisions:</span>
              <span className="text-[#8D96A0] text-[11px] font-normal">
                {reviews.length} submitted
              </span>
            </h4>
            <div className="space-y-2">
              {reviews.map((rev) => (
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
              ))}
            </div>
          </div>

          {/* Automated Security & CI Status Check Box */}
          <div
            className="rounded-xl bg-[#161B22] border border-[#30363D] p-4 space-y-3"
            data-testid="security-ci-checks-box"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    allChecksPassed ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {allChecksPassed ? (
                    <QuantGitCheckCircleIcon size={20} />
                  ) : (
                    <QuantGitXCircleIcon size={20} />
                  )}
                </span>
                <span className="font-semibold text-xs text-[#E6EDF3]">
                  {allChecksPassed
                    ? 'All checks have passed (55/56 checks verified green)'
                    : 'Some checks have failed or are required before merging'}
                </span>
              </div>
              <button className="text-[#58A6FF] hover:underline text-[11px]">
                Show all checks
              </button>
            </div>

            <div
              className="divide-y divide-[#21262D] text-[11px] text-[#8D96A0] pt-1"
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

            {/* Merge Action Box */}
            <div className="pt-3 border-t border-[#30363D]" data-testid="merge-box-container">
              {selectedPR.state === 'open' ? (
                allChecksPassed ? (
                  <div className="space-y-3" data-testid="merge-enabled-box">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[#3FB950]">
                          <QuantGitCheckIcon size={14} />
                        </span>
                        <span className="text-[11px] text-[#8D96A0]">
                          This branch has no conflicts with the base branch.
                        </span>
                      </div>

                      {/* Merge strategy selector and button */}
                      <div className="flex items-center gap-1.5">
                        <select
                          value={selectedMergeMethod}
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
                            className="w-full bg-[#161B22] border border-[#30363D] focus:border-[#58A6FF] rounded px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#8D96A0] outline-none"
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
                    <div className="flex items-center gap-2 text-red-400">
                      <QuantGitXIcon size={14} />
                      <span className="font-semibold">
                        Merging is blocked. Required security & CI checks must pass before merging.
                      </span>
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
                    merged and closed. Merged by {selectedPR.author || currentUsername} into{' '}
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

          {/* Interactive Diff Viewer with Inline Comments */}
          <div className="space-y-4" data-testid="diff-viewer">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[#E6EDF3]">
                Files changed ({selectedPR?.changedFiles ?? 0})
              </span>

              <div className="flex items-center gap-1 bg-[#161B22] p-0.5 rounded border border-[#30363D]">
                <button
                  type="button"
                  onClick={() => setDiffViewMode('unified')}
                  data-testid="diff-mode-unified"
                  className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer ${
                    diffViewMode === 'unified' ? 'bg-[#21262D] text-[#E6EDF3]' : 'text-[#8D96A0]'
                  }`}
                >
                  Unified
                </button>
                <button
                  type="button"
                  onClick={() => setDiffViewMode('split')}
                  data-testid="diff-mode-split"
                  className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer ${
                    diffViewMode === 'split' ? 'bg-[#21262D] text-[#E6EDF3]' : 'text-[#8D96A0]'
                  }`}
                >
                  Split
                </button>
              </div>
            </div>

            {(selectedPR?.changedFiles ?? 0) > 0 ? (
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
            ) : (
              <div
                data-testid="diff-empty"
                className="rounded-xl bg-[#0D1117] border border-dashed border-[#30363D] p-8 text-center"
              >
                <p className="text-xs text-[#8D96A0]">No files changed in this pull request.</p>
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
                className="w-full bg-[#161B22] border border-[#30363D] focus:border-[#58A6FF] rounded-lg px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#8D96A0] outline-none"
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
            <div className="bg-[#161B22] border-b border-[#30363D] px-4 py-3 flex items-center justify-between font-semibold">
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

            <div className="divide-y divide-[#21262D]">
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
                    className="w-full p-4 hover:bg-[#161B22] transition-colors flex items-start justify-between gap-4 group text-left cursor-pointer"
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
                        <span className="px-1.5 py-0.2 rounded border border-[#238636] text-[#3FB950] text-[10px] font-semibold flex items-center gap-1">
                          <QuantGitCheckIcon size={10} /> 55/56 passed
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#8D96A0] text-[10px]">
                          Review required
                        </span>
                      </div>
                      <p className="text-xs text-[#8D96A0]">
                        #{pr.id} by {pr.author} was {pr.state} {pr.createdAt} · +
                        {pr.additions ?? 24} -{pr.deletions ?? 5}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[#8D96A0] shrink-0">
                      <QuantGitCommentIcon size={14} />
                      <span className="text-xs">{pr.commentsCount}</span>
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
