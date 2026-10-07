import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MergeEligibilityService } from '../modules/code/services/merge-eligibility.service';
import { BranchProtectionService } from '../modules/code/services/branch-protection.service';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function createMockPrisma() {
  return {
    pullRequest: {
      findUnique: vi.fn(),
    },
    branchProtection: {
      findMany: vi.fn(),
    },
    review: {
      findMany: vi.fn(),
    },
    ciRun: {
      findFirst: vi.fn(),
    },
  };
}

let reviewSeq = 0;
function review(reviewerId: string, status: string) {
  // createdAt descending order matters: newer entries get later timestamps.
  return {
    id: `rev-${reviewSeq}`,
    prId: 'pr-1',
    reviewerId,
    status,
    createdAt: new Date(2024, 0, 1, 0, 0, reviewSeq++),
  };
}

const OPEN_PR = { id: 'pr-1', repoId: 'repo-1', status: 'OPEN', targetBranch: 'main' };

describe('MergeEligibilityService.evaluateMergeEligibility', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: MergeEligibilityService;

  beforeEach(() => {
    reviewSeq = 0;
    prisma = createMockPrisma();
    service = new MergeEligibilityService(prisma as never, {
      branchProtection: new BranchProtectionService(prisma as never),
    });
    // Sensible defaults; individual tests override.
    prisma.branchProtection.findMany.mockResolvedValue([]);
    prisma.review.findMany.mockResolvedValue([]);
    prisma.ciRun.findFirst.mockResolvedValue(null);
  });

  it('is mergeable when open, has enough approvals, and CI is SUCCESS with required status checks', async () => {
    prisma.pullRequest.findUnique.mockResolvedValue(OPEN_PR);
    prisma.branchProtection.findMany.mockResolvedValue([
      { id: 'rule-1', branchPattern: 'main', requiredApprovals: 2, requireStatusChecks: true },
    ]);
    prisma.review.findMany.mockResolvedValue([review('r1', 'APPROVED'), review('r2', 'APPROVED')]);
    prisma.ciRun.findFirst.mockResolvedValue({ id: 'run-1', status: 'SUCCESS' });

    const decision = await service.evaluateMergeEligibility('pr-1');

    expect(decision.mergeable).toBe(true);
    expect(decision.reasons).toHaveLength(0);
    expect(decision.checks).toMatchObject({
      prOpen: true,
      requiredApprovals: 2,
      approvals: 2,
      changesRequested: false,
      requireStatusChecks: true,
      ciStatus: 'SUCCESS',
    });
  });

  it('is not mergeable when a reviewer has requested changes', async () => {
    prisma.pullRequest.findUnique.mockResolvedValue(OPEN_PR);
    prisma.branchProtection.findMany.mockResolvedValue([
      { id: 'rule-1', branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: false },
    ]);
    prisma.review.findMany.mockResolvedValue([
      review('r1', 'APPROVED'),
      review('r2', 'CHANGES_REQUESTED'),
    ]);

    const decision = await service.evaluateMergeEligibility('pr-1');

    expect(decision.mergeable).toBe(false);
    expect(decision.checks.changesRequested).toBe(true);
    expect(decision.reasons).toContain('A reviewer has requested changes');
  });

  it('is not mergeable when approvals are insufficient', async () => {
    prisma.pullRequest.findUnique.mockResolvedValue(OPEN_PR);
    prisma.branchProtection.findMany.mockResolvedValue([
      { id: 'rule-1', branchPattern: 'main', requiredApprovals: 2, requireStatusChecks: false },
    ]);
    prisma.review.findMany.mockResolvedValue([review('r1', 'APPROVED')]);

    const decision = await service.evaluateMergeEligibility('pr-1');

    expect(decision.mergeable).toBe(false);
    expect(decision.checks.approvals).toBe(1);
    expect(decision.checks.requiredApprovals).toBe(2);
    expect(decision.reasons).toContain('Requires 2 approval(s), but only has 1');
  });

  it('is not mergeable when status checks are required but CI is not SUCCESS', async () => {
    prisma.pullRequest.findUnique.mockResolvedValue(OPEN_PR);
    prisma.branchProtection.findMany.mockResolvedValue([
      { id: 'rule-1', branchPattern: 'main', requiredApprovals: 0, requireStatusChecks: true },
    ]);
    prisma.ciRun.findFirst.mockResolvedValue({ id: 'run-1', status: 'FAILED' });

    const decision = await service.evaluateMergeEligibility('pr-1');

    expect(decision.mergeable).toBe(false);
    expect(decision.checks.ciStatus).toBe('FAILED');
    expect(decision.reasons.some((r) => r.includes('status checks'))).toBe(true);
  });

  it('reports "have not run" when status checks are required but no CI run exists', async () => {
    prisma.pullRequest.findUnique.mockResolvedValue(OPEN_PR);
    prisma.branchProtection.findMany.mockResolvedValue([
      { id: 'rule-1', branchPattern: 'main', requiredApprovals: 0, requireStatusChecks: true },
    ]);
    prisma.ciRun.findFirst.mockResolvedValue(null);

    const decision = await service.evaluateMergeEligibility('pr-1');

    expect(decision.mergeable).toBe(false);
    expect(decision.checks.ciStatus).toBe('NONE');
    expect(decision.reasons).toContain('Required status checks have not run');
  });

  it('is not mergeable when the PR is not open (closed)', async () => {
    prisma.pullRequest.findUnique.mockResolvedValue({ ...OPEN_PR, status: 'CLOSED' });

    const decision = await service.evaluateMergeEligibility('pr-1');

    expect(decision.mergeable).toBe(false);
    expect(decision.checks.prOpen).toBe(false);
    expect(decision.reasons.some((r) => r.includes('closed'))).toBe(true);
  });

  it('collapses to the latest verdict per reviewer (CHANGES_REQUESTED later flipped to APPROVED)', async () => {
    prisma.pullRequest.findUnique.mockResolvedValue(OPEN_PR);
    prisma.branchProtection.findMany.mockResolvedValue([
      { id: 'rule-1', branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: false },
    ]);
    // Older CHANGES_REQUESTED, then a newer APPROVED from the same reviewer.
    // Service reads desc by createdAt, so newest must come first in the array.
    const older = review('r1', 'CHANGES_REQUESTED');
    const newer = review('r1', 'APPROVED');
    prisma.review.findMany.mockResolvedValue([newer, older]);

    const decision = await service.evaluateMergeEligibility('pr-1');

    expect(decision.checks.changesRequested).toBe(false);
    expect(decision.checks.approvals).toBe(1);
    expect(decision.mergeable).toBe(true);
  });

  it('throws 404 PR_NOT_FOUND when the PR does not exist', async () => {
    prisma.pullRequest.findUnique.mockResolvedValue(null);

    await expect(service.evaluateMergeEligibility('missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'PR_NOT_FOUND',
    });
  });
});
