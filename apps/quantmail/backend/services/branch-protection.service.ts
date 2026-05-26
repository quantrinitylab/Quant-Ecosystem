import type { PrismaClient, BranchProtection } from '@prisma/client';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

export const CreateProtectionRuleInputSchema = z.object({
  repoId: z.string(),
  branchPattern: z.string().min(1),
  requiredApprovals: z.number().int().min(0).max(10).default(1),
  requireStatusChecks: z.boolean().default(false),
});

export const UpdateProtectionRuleInputSchema = z.object({
  branchPattern: z.string().min(1).optional(),
  requiredApprovals: z.number().int().min(0).max(10).optional(),
  requireStatusChecks: z.boolean().optional(),
});

export type CreateProtectionRuleInput = z.infer<typeof CreateProtectionRuleInputSchema>;
export type UpdateProtectionRuleInput = z.infer<typeof UpdateProtectionRuleInputSchema>;

export interface EnforceResult {
  allowed: boolean;
  reason?: string;
}

export class BranchProtectionService {
  constructor(private readonly prisma: PrismaClient) {}

  async createRule(input: CreateProtectionRuleInput): Promise<BranchProtection> {
    const validated = CreateProtectionRuleInputSchema.parse(input);

    return this.prisma.branchProtection.create({
      data: {
        repoId: validated.repoId,
        branchPattern: validated.branchPattern,
        requiredApprovals: validated.requiredApprovals,
        requireStatusChecks: validated.requireStatusChecks,
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

  async enforceOnPush(repoId: string, branch: string, prId?: string): Promise<EnforceResult> {
    const rules = await this.prisma.branchProtection.findMany({
      where: { repoId },
    });

    const matchingRule = rules.find((rule) => this.branchMatches(branch, rule.branchPattern));

    if (!matchingRule) {
      return { allowed: true };
    }

    if (!prId) {
      return { allowed: false, reason: 'Direct push to protected branch is not allowed' };
    }

    if (matchingRule.requiredApprovals > 0) {
      const approvals = await this.prisma.review.count({
        where: {
          prId,
          status: 'APPROVED',
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
