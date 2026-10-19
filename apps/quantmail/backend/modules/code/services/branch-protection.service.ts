import type { PrismaClient, BranchProtection } from '@prisma/client';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

export const CreateProtectionRuleInputSchema = z.object({
  repoId: z.string(),
  branchPattern: z.string().min(1),
  requiredApprovals: z.number().int().min(0).max(10).default(1),
  requireStatusChecks: z.boolean().default(false),
  dismissStaleApprovals: z.boolean().default(false),
});

export const UpdateProtectionRuleInputSchema = z.object({
  branchPattern: z.string().min(1).optional(),
  requiredApprovals: z.number().int().min(0).max(10).optional(),
  requireStatusChecks: z.boolean().optional(),
  dismissStaleApprovals: z.boolean().optional(),
});

export type CreateProtectionRuleInput = z.infer<typeof CreateProtectionRuleInputSchema>;
// Callers may omit defaulted fields (schema.parse fills them); the service
// accepts the zod input type so `dismissStaleApprovals: false` does not have
// to be passed explicitly at every call site.
export type CreateProtectionRule = z.input<typeof CreateProtectionRuleInputSchema>;
export type UpdateProtectionRuleInput = z.infer<typeof UpdateProtectionRuleInputSchema>;

export interface EnforceResult {
  allowed: boolean;
  reason?: string;
}

export class BranchProtectionService {
  constructor(private readonly prisma: PrismaClient) {}

  async createRule(input: CreateProtectionRule): Promise<BranchProtection> {
    const validated = CreateProtectionRuleInputSchema.parse(input);

    return this.prisma.branchProtection.create({
      data: {
        repoId: validated.repoId,
        branchPattern: validated.branchPattern,
        requiredApprovals: validated.requiredApprovals,
        requireStatusChecks: validated.requireStatusChecks,
        dismissStaleApprovals: validated.dismissStaleApprovals,
      },
    });
  }

  async updateRule(ruleId: string, updates: UpdateProtectionRuleInput): Promise<BranchProtection> {
    const validated = UpdateProtectionRuleInputSchema.parse(updates);

    const rule = await this.prisma.branchProtection.findUnique({
      where: { id: ruleId },
    });

    if (!rule) {
      throw createAppError('Branch protection rule not found', 404, 'RULE_NOT_FOUND');
    }

    return this.prisma.branchProtection.update({
      where: { id: ruleId },
      data: validated,
    });
  }

  async deleteRule(ruleId: string): Promise<BranchProtection> {
    const rule = await this.prisma.branchProtection.findUnique({
      where: { id: ruleId },
    });

    if (!rule) {
      throw createAppError('Branch protection rule not found', 404, 'RULE_NOT_FOUND');
    }

    return this.prisma.branchProtection.delete({
      where: { id: ruleId },
    });
  }

  async listRules(repoId: string): Promise<BranchProtection[]> {
    return this.prisma.branchProtection.findMany({
      where: { repoId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Resolve the single branch-protection rule whose `branchPattern` matches the
   * given branch, or `null` when the branch is unprotected. Exposed so other
   * QuantCode services (e.g. merge-eligibility evaluation) can read the active
   * rule without duplicating the glob-matching semantics used by `enforceOnPush`.
   */
  async getMatchingRule(repoId: string, branch: string): Promise<BranchProtection | null> {
    const rules = await this.prisma.branchProtection.findMany({
      where: { repoId },
    });

    return (
      rules.find((rule: BranchProtection) => this.branchMatches(branch, rule.branchPattern)) ?? null
    );
  }

  /**
   * Dismiss stale approvals after a push (GitHub parity: "Dismiss stale pull
   * request approvals when new commits are pushed").
   *
   * Called by every push path AFTER the branch head has advanced to `newSha`.
   * For each OPEN pull request whose source branch is `branch`, when the rule
   * guarding its target branch has `dismissStaleApprovals` enabled, every
   * APPROVED review whose `reviewedCommitSha` is not the new head is marked
   * `dismissed` — the PR cannot merge until it is re-reviewed. Reviews that
   * already reviewed exactly `newSha` stay valid; reviews recorded before
   * `reviewedCommitSha` existed (NULL) cannot prove they saw the new head, so
   * they are dismissed too — but only on a real push, never retroactively.
   *
   * Returns the number of reviews dismissed.
   */
  async dismissStaleApprovalsOnPush(
    repoId: string,
    branch: string,
    newSha: string,
  ): Promise<number> {
    const openPrs = await this.prisma.pullRequest.findMany({
      where: { repoId, sourceBranch: branch, status: 'OPEN' },
      select: { id: true, targetBranch: true },
    });
    if (openPrs.length === 0) return 0;

    let dismissed = 0;
    for (const pr of openPrs) {
      const rule = await this.getMatchingRule(repoId, pr.targetBranch);
      if (!rule?.dismissStaleApprovals) continue;

      const result = await this.prisma.review.updateMany({
        where: {
          prId: pr.id,
          status: 'APPROVED',
          dismissed: false,
          // `not: newSha` alone would skip NULLs in Postgres (NULL != x is
          // NULL, not true), so NULL reviewedCommitSha needs its own arm.
          OR: [{ reviewedCommitSha: { not: newSha } }, { reviewedCommitSha: null }],
        },
        data: { dismissed: true },
      });
      dismissed += result.count;
    }
    return dismissed;
  }

  async enforceOnPush(repoId: string, branch: string, prId?: string): Promise<EnforceResult> {
    const rules = await this.prisma.branchProtection.findMany({
      where: { repoId },
    });

    const matchingRule = rules.find((rule: BranchProtection) =>
      this.branchMatches(branch, rule.branchPattern),
    );

    if (!matchingRule) {
      return { allowed: true };
    }

    if (!prId) {
      return { allowed: false, reason: 'Direct push to protected branch is not allowed' };
    }

    if (matchingRule.requiredApprovals > 0) {
      // Dismissed (stale) approvals never count — an approval that was
      // revoked by a later push must be re-issued on the new head.
      const approvals = await this.prisma.review.count({
        where: {
          prId,
          status: 'APPROVED',
          dismissed: { not: true },
        },
      });

      if (approvals < matchingRule.requiredApprovals) {
        return {
          allowed: false,
          reason: `Requires ${matchingRule.requiredApprovals} approval(s), but only has ${approvals}`,
        };
      }
    }

    if (matchingRule.requireStatusChecks) {
      const latestRun = await this.prisma.ciRun.findFirst({
        where: { repoId, branch },
        orderBy: { createdAt: 'desc' },
      });

      if (!latestRun || latestRun.status !== 'SUCCESS') {
        return {
          allowed: false,
          reason: 'Required status checks have not passed',
        };
      }
    }

    return { allowed: true };
  }

  private branchMatches(branch: string, pattern: string): boolean {
    if (pattern === '*') {
      return true;
    }

    if (pattern.endsWith('*')) {
      return branch.startsWith(pattern.slice(0, -1));
    }

    return branch === pattern;
  }
}
