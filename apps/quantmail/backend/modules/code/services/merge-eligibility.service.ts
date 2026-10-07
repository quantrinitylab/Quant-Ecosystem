// ============================================================================
// QuantCode module — Merge-eligibility evaluation (Pillar 2)
// quantmail-superhub · Task 10.2 (Requirement 6.4)
// ============================================================================
//
// PURPOSE
//   Implements the `evaluateMergeEligibility` function from the QuantCodeModule
//   interface (design §"INTERFACE QuantCodeModule"):
//
//       FUNCTION evaluateMergeEligibility(prId) RETURNS MergeDecision
//         // checks CI + protection + reviews
//
//   The decision is a pure, read-only aggregation of three independent gates
//   (Requirement 6.4) and never mutates PR/CI/review state:
//
//     1. PR STATE         — the PR must be OPEN. A merged/closed/draft PR is not
//                           mergeable.
//     2. REVIEW VERDICTS  — the effective (latest-per-reviewer) verdicts must
//                           satisfy the target branch's `requiredApprovals` and
//                           contain no outstanding CHANGES_REQUESTED.
//     3. CI STATUS        — when the target branch's protection rule requires
//                           status checks, the PR's latest CI run must be
//                           SUCCESS.
//
//   Each unmet gate contributes a human-readable entry to `reasons`; the PR is
//   `mergeable` only when every gate passes (`reasons.length === 0`). Callers
//   (the merge endpoint, the Agent pillar, the Company OS approval flow) consult
//   this before allowing a merge.

import type { PrismaClient, Review } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { BranchProtectionService } from './branch-protection.service';

/** The aggregated, read-only merge decision returned to callers. */
export interface MergeDecision {
  prId: string;
  /** True only when every gate (state + reviews + CI) passes. */
  mergeable: boolean;
  /** Human-readable blocking reasons; empty when `mergeable` is true. */
  reasons: string[];
  /** Structured breakdown of each gate for programmatic consumers/UI. */
  checks: {
    prOpen: boolean;
    requiredApprovals: number;
    approvals: number;
    changesRequested: boolean;
    requireStatusChecks: boolean;
    /** Status of the PR's latest CI run, or `NONE` when no run exists. */
    ciStatus: string;
  };
}

export interface MergeEligibilityOptions {
  branchProtection?: BranchProtectionService;
}

export class MergeEligibilityService {
  private readonly branchProtection: BranchProtectionService;

  constructor(
    private readonly prisma: PrismaClient,
    options: MergeEligibilityOptions = {},
  ) {
    this.branchProtection = options.branchProtection ?? new BranchProtectionService(prisma);
  }

  /**
   * Evaluate whether a pull request may be merged.
   *
   * @throws 404 when the PR does not exist.
   *
   * Pure read: aggregates PR state, the target branch's protection rule,
   * the effective review verdicts, and the latest CI run into a `MergeDecision`.
   */
  async evaluateMergeEligibility(prId: string): Promise<MergeDecision> {
    const pr = await this.prisma.pullRequest.findUnique({ where: { id: prId } });
    if (!pr) {
      throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');
    }

    const reasons: string[] = [];

    // ----- 1. PR STATE -----------------------------------------------------
    const prOpen = pr.status === 'OPEN';
    if (!prOpen) {
      reasons.push(`Pull request is ${pr.status.toLowerCase()}, not open`);
    }

    // Resolve the protection rule guarding the branch this PR merges into.
    const rule = await this.branchProtection.getMatchingRule(pr.repoId, pr.targetBranch);
    const requiredApprovals = rule?.requiredApprovals ?? 0;
    const requireStatusChecks = rule?.requireStatusChecks ?? false;

    // ----- 2. REVIEW VERDICTS ---------------------------------------------
    // Collapse to the latest verdict per reviewer (GitHub semantics): an old
    // CHANGES_REQUESTED that a reviewer later turned into APPROVED no longer
    // blocks, and a single reviewer's repeated approvals count once.
    const reviews = await this.prisma.review.findMany({
      where: { prId },
      orderBy: { createdAt: 'desc' },
    });

    const latestByReviewer = new Map<string, Review>();
    for (const review of reviews) {
      if (!latestByReviewer.has(review.reviewerId)) {
        latestByReviewer.set(review.reviewerId, review);
      }
    }
    const effectiveReviews = [...latestByReviewer.values()];

    const approvals = effectiveReviews.filter((r) => r.status === 'APPROVED').length;
    const changesRequested = effectiveReviews.some((r) => r.status === 'CHANGES_REQUESTED');

    if (changesRequested) {
      reasons.push('A reviewer has requested changes');
    }
    if (approvals < requiredApprovals) {
      reasons.push(`Requires ${requiredApprovals} approval(s), but only has ${approvals}`);
    }

    // ----- 3. CI STATUS ----------------------------------------------------
    const latestRun = await this.prisma.ciRun.findFirst({
      where: { prId },
      orderBy: { createdAt: 'desc' },
    });
    const ciStatus: string = latestRun?.status ?? 'NONE';

    if (requireStatusChecks && ciStatus !== 'SUCCESS') {
      reasons.push(
        ciStatus === 'NONE'
          ? 'Required status checks have not run'
          : `Required status checks have not passed (latest run is ${ciStatus})`,
      );
    }

    return {
      prId,
      mergeable: reasons.length === 0,
      reasons,
      checks: {
        prOpen,
        requiredApprovals,
        approvals,
        changesRequested,
        requireStatusChecks,
        ciStatus,
      },
    };
  }
}
