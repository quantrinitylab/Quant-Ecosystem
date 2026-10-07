// ============================================================================
// Payments - Agent Spending Limit Service
// Per-agent budget enforcement with approval workflows
// ============================================================================

import { z } from 'zod';
import type { AgentBudget, AgentSpendApproval } from '../types';

export const CreateAgentBudgetSchema = z.object({
  agentId: z.string().min(1),
  userId: z.string().min(1),
  perTransactionLimit: z.number().positive(),
  hourlyLimit: z.number().positive(),
  dailyLimit: z.number().positive(),
  monthlyLimit: z.number().positive(),
  requiresApprovalAbove: z.number().nonnegative(),
});

export const RecordAgentSpendSchema = z.object({
  agentId: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().min(1),
});

/**
 * AgentSpendingLimitService - AI agent spending controls
 *
 * Enforces per-agent spending limits (per-transaction, hourly, daily, monthly).
 * Agents are AI actors that can spend on behalf of users.
 * Each agent has a configured budget and requires user approval above threshold.
 */
export class AgentSpendingLimitService {
  private readonly budgets: Map<string, AgentBudget> = new Map();
  private readonly approvals: Map<string, AgentSpendApproval> = new Map();

  /**
   * Create a budget for an AI agent
   */
  createBudget(params: {
    agentId: string;
    userId: string;
    perTransactionLimit: number;
    hourlyLimit: number;
    dailyLimit: number;
    monthlyLimit: number;
    requiresApprovalAbove: number;
  }): AgentBudget {
    const validated = CreateAgentBudgetSchema.parse(params);

    const budget: AgentBudget = {
      agentId: validated.agentId,
      userId: validated.userId,
      perTransactionLimit: validated.perTransactionLimit,
      hourlyLimit: validated.hourlyLimit,
      dailyLimit: validated.dailyLimit,
      monthlyLimit: validated.monthlyLimit,
      hourlySpent: 0,
      dailySpent: 0,
      monthlySpent: 0,
      requiresApprovalAbove: validated.requiresApprovalAbove,
      createdAt: Date.now(),
    };

    this.budgets.set(validated.agentId, budget);
    return { ...budget };
  }

  /**
   * Check if an agent can spend a given amount.
   * @deprecated Prefer {@link attemptSpend} for concurrent environments, as it atomically checks and records in a single call.
   */
  checkSpend(
    agentId: string,
    amount: number,
  ): { allowed: boolean; reason?: string; requiresApproval: boolean } {
    const budget = this.budgets.get(agentId);

    if (!budget) {
      return { allowed: false, reason: 'No budget configured for agent', requiresApproval: false };
    }

    if (amount > budget.perTransactionLimit) {
      return {
        allowed: false,
        reason: `Amount ${amount} exceeds per-transaction limit of ${budget.perTransactionLimit}`,
        requiresApproval: false,
      };
    }

    if (budget.hourlySpent + amount > budget.hourlyLimit) {
      return {
        allowed: false,
        reason: `Would exceed hourly limit of ${budget.hourlyLimit}`,
        requiresApproval: false,
      };
    }

    if (budget.dailySpent + amount > budget.dailyLimit) {
      return {
        allowed: false,
        reason: `Would exceed daily limit of ${budget.dailyLimit}`,
        requiresApproval: false,
      };
    }

    if (budget.monthlySpent + amount > budget.monthlyLimit) {
      return {
        allowed: false,
        reason: `Would exceed monthly limit of ${budget.monthlyLimit}`,
        requiresApproval: false,
      };
    }

    if (amount > budget.requiresApprovalAbove) {
      return { allowed: true, requiresApproval: true };
    }

    return { allowed: true, requiresApproval: false };
  }

  /**
   * Record a spend for an agent, updating counters.
   * @deprecated Prefer {@link attemptSpend} for concurrent environments, as it atomically checks and records in a single call.
   */
  recordSpend(agentId: string, amount: number, description: string): void {
    RecordAgentSpendSchema.parse({ agentId, amount, description });

    const budget = this.budgets.get(agentId);

    if (!budget) {
      throw new Error(`No budget configured for agent: ${agentId}`);
    }

    budget.hourlySpent += amount;
    budget.dailySpent += amount;
    budget.monthlySpent += amount;
  }

  /**
   * Atomically check limits and record spend in a single call.
   * Eliminates the TOCTOU gap between separate checkSpend/recordSpend calls.
   * Recommended over checkSpend+recordSpend for concurrent environments.
   */
  attemptSpend(
    agentId: string,
    amount: number,
    description: string,
  ): { success: boolean; reason?: string; requiresApproval: boolean } {
    RecordAgentSpendSchema.parse({ agentId, amount, description });

    const budget = this.budgets.get(agentId);

    if (!budget) {
      return { success: false, reason: 'No budget configured for agent', requiresApproval: false };
    }

    if (amount > budget.perTransactionLimit) {
      return {
        success: false,
        reason: `Amount ${amount} exceeds per-transaction limit of ${budget.perTransactionLimit}`,
        requiresApproval: false,
      };
    }

    if (budget.hourlySpent + amount > budget.hourlyLimit) {
      return {
        success: false,
        reason: `Would exceed hourly limit of ${budget.hourlyLimit}`,
        requiresApproval: false,
      };
    }

    if (budget.dailySpent + amount > budget.dailyLimit) {
      return {
        success: false,
        reason: `Would exceed daily limit of ${budget.dailyLimit}`,
        requiresApproval: false,
      };
    }

    if (budget.monthlySpent + amount > budget.monthlyLimit) {
      return {
        success: false,
        reason: `Would exceed monthly limit of ${budget.monthlyLimit}`,
        requiresApproval: false,
      };
    }

    const requiresApproval = amount > budget.requiresApprovalAbove;

    // Atomically record the spend
    budget.hourlySpent += amount;
    budget.dailySpent += amount;
    budget.monthlySpent += amount;

    return { success: true, requiresApproval };
  }

  /**
   * Request approval for a spend above the threshold
   */
  requestApproval(agentId: string, amount: number, description: string): AgentSpendApproval {
    const budget = this.budgets.get(agentId);

    if (!budget) {
      throw new Error(`No budget configured for agent: ${agentId}`);
    }

    const approval: AgentSpendApproval = {
      id: `appr_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      agentId,
      userId: budget.userId,
      amount,
      description,
      status: 'pending',
      requestedAt: Date.now(),
    };

    this.approvals.set(approval.id, approval);
    return { ...approval };
  }

  /**
   * Resolve an approval request
   */
  resolveApproval(approvalId: string, decision: 'approved' | 'denied'): AgentSpendApproval {
    const approval = this.approvals.get(approvalId);

    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }

    if (approval.status !== 'pending') {
      throw new Error(`Approval already resolved: ${approval.status}`);
    }

    approval.status = decision;
    approval.resolvedAt = Date.now();

    return { ...approval };
  }

  /**
   * Reset hourly spending counters
   */
  resetHourly(): void {
    for (const budget of this.budgets.values()) {
      budget.hourlySpent = 0;
    }
  }

  /**
   * Reset daily spending counters
   */
  resetDaily(): void {
    for (const budget of this.budgets.values()) {
      budget.dailySpent = 0;
    }
  }

  /**
   * Reset monthly spending counters
   */
  resetMonthly(): void {
    for (const budget of this.budgets.values()) {
      budget.monthlySpent = 0;
    }
  }
}
