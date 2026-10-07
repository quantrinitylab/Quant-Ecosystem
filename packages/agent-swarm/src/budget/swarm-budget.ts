import type { BudgetConfig } from '../types.js';

type U = { tokens: number; cost: number; time: number };
const Z: U = { tokens: 0, cost: 0, time: 0 };

interface BudgetHistoryEntry {
  id: string;
  action: 'track' | 'transfer' | 'reset' | 'allocate';
  timestamp: number;
  detail: string;
}

type AlertCallback = (id: string, usage: U, threshold: number) => void;

export class SwarmBudget {
  private usage = new Map<string, U>();
  private budgets = new Map<string, BudgetConfig>();
  private allocations = new Map<string, Map<string, BudgetConfig>>();
  private history: BudgetHistoryEntry[] = [];
  private alertCallbacks: AlertCallback[] = [];
  private alertThresholds: number[] = [0.8, 0.9, 1.0];
  private firedAlerts = new Map<string, Set<number>>();

  setBudget(id: string, c: BudgetConfig): void {
    this.budgets.set(id, c);
  }

  onAlert(cb: AlertCallback): void {
    this.alertCallbacks.push(cb);
  }

  setAlertThresholds(thresholds: number[]): void {
    this.alertThresholds = thresholds;
  }

  track(id: string, tokens: number, cost: number, time: number): void {
    const u = this.usage.get(id) ?? { ...Z };
    u.tokens += tokens;
    u.cost += cost;
    u.time += time;
    this.usage.set(id, u);
    this.history.push({
      id: crypto.randomUUID(),
      action: 'track',
      timestamp: Date.now(),
      detail: `${id}: +${tokens}t +${cost}c +${time}ms`,
    });
    this.checkAlerts(id);
  }

  getUsage(id: string): U {
    return this.usage.get(id) ?? { ...Z };
  }

  isOverBudget(id: string): boolean {
    const b = this.budgets.get(id);
    if (!b) return false;
    const u = this.getUsage(id);
    return u.tokens > b.maxTokens || u.cost > b.maxCostCents || u.time > b.maxTimeMs;
  }

  shouldPause(id: string): boolean {
    const b = this.budgets.get(id);
    if (!b) return false;
    const u = this.getUsage(id);
    return (
      u.tokens >= b.maxTokens * 0.8 || u.cost >= b.maxCostCents * 0.8 || u.time >= b.maxTimeMs * 0.8
    );
  }

  reset(id: string): void {
    this.usage.set(id, { ...Z });
    this.firedAlerts.delete(id);
    this.history.push({
      id: crypto.randomUUID(),
      action: 'reset',
      timestamp: Date.now(),
      detail: `${id} reset`,
    });
  }

  allocateSubGoal(parentId: string, subGoalId: string, budget: BudgetConfig): void {
    if (!this.allocations.has(parentId)) this.allocations.set(parentId, new Map());
    this.allocations.get(parentId)!.set(subGoalId, budget);
    this.setBudget(subGoalId, budget);
    this.history.push({
      id: crypto.randomUUID(),
      action: 'allocate',
      timestamp: Date.now(),
      detail: `${subGoalId} allocated under ${parentId}`,
    });
  }

  getSubGoalBudget(parentId: string, subGoalId: string): BudgetConfig | null {
    return this.allocations.get(parentId)?.get(subGoalId) ?? null;
  }

  transfer(fromId: string, toId: string, tokens: number, cost: number, time: number): boolean {
    const fromBudget = this.budgets.get(fromId);
    const toBudget = this.budgets.get(toId);
    if (!fromBudget || !toBudget) return false;

    const fromUsage = this.getUsage(fromId);
    const remainingTokens = fromBudget.maxTokens - fromUsage.tokens;
    const remainingCost = fromBudget.maxCostCents - fromUsage.cost;
    const remainingTime = fromBudget.maxTimeMs - fromUsage.time;

    if (tokens > remainingTokens || cost > remainingCost || time > remainingTime) return false;

    fromBudget.maxTokens -= tokens;
    toBudget.maxTokens += tokens;
    fromBudget.maxCostCents -= cost;
    toBudget.maxCostCents += cost;
    fromBudget.maxTimeMs -= time;
    toBudget.maxTimeMs += time;

    this.history.push({
      id: crypto.randomUUID(),
      action: 'transfer',
      timestamp: Date.now(),
      detail: `${fromId} -> ${toId}: ${tokens}t ${cost}c ${time}ms`,
    });
    return true;
  }

  getHistory(): BudgetHistoryEntry[] {
    return [...this.history];
  }

  private checkAlerts(id: string): void {
    const b = this.budgets.get(id);
    if (!b) return;
    const u = this.getUsage(id);
    const ratio = Math.max(
      b.maxTokens > 0 ? u.tokens / b.maxTokens : 0,
      b.maxCostCents > 0 ? u.cost / b.maxCostCents : 0,
      b.maxTimeMs > 0 ? u.time / b.maxTimeMs : 0,
    );

    if (!this.firedAlerts.has(id)) this.firedAlerts.set(id, new Set());
    const fired = this.firedAlerts.get(id)!;

    for (const threshold of this.alertThresholds) {
      if (ratio >= threshold && !fired.has(threshold)) {
        fired.add(threshold);
        for (const cb of this.alertCallbacks) {
          cb(id, u, threshold);
        }
      }
    }
  }
}
