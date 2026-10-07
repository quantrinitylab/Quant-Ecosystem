// NOTE: This is an in-memory implementation for the foundation phase. All cost records are held
// in memory with no eviction or size limits. Persistence (database-backed storage) and eviction
// policies will be added when database integration is implemented.

import type { BudgetConfig, CostRecord } from './types.js';

const PERIOD_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export class CostTracker {
  private records: CostRecord[] = [];
  private budgets: Map<string, BudgetConfig> = new Map();

  recordCost(agentId: string, workflowId: string, amount: number, description: string): void {
    this.records.push({
      agentId,
      workflowId,
      amount,
      description,
      timestamp: Date.now(),
    });
  }

  getTotalCost(agentId: string, period?: 'hourly' | 'daily' | 'weekly' | 'monthly'): number {
    const now = Date.now();
    return this.records
      .filter((r) => {
        if (r.agentId !== agentId) return false;
        if (period) {
          const windowMs = PERIOD_MS[period] ?? 0;
          return now - r.timestamp <= windowMs;
        }
        return true;
      })
      .reduce((sum, r) => sum + r.amount, 0);
  }

  getWorkflowCost(workflowId: string): number {
    return this.records
      .filter((r) => r.workflowId === workflowId)
      .reduce((sum, r) => sum + r.amount, 0);
  }

  setBudget(config: BudgetConfig): void {
    this.budgets.set(config.agentId, config);
  }

  getBudget(agentId: string): BudgetConfig | undefined {
    return this.budgets.get(agentId);
  }

  isWithinBudget(agentId: string, estimatedCost: number): boolean {
    const budget = this.budgets.get(agentId);
    if (!budget) return true; // No budget set means unlimited

    const currentSpend = this.getTotalCost(agentId, budget.period);
    return currentSpend + estimatedCost <= budget.limit;
  }

  getSpendingHistory(agentId: string, limit?: number): CostRecord[] {
    const history = this.records
      .filter((r) => r.agentId === agentId)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (limit !== undefined) {
      return history.slice(0, limit);
    }
    return history;
  }
}
