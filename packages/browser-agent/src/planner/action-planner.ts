import type { BrowserAction, PageState, ActionSequence } from '../types.js';

export interface ReplanContext {
  failedAction: BrowserAction;
  error: string;
}

export interface ActionPlannerStrategy {
  generatePlan(
    goal: string,
    pageState: PageState,
    context?: ReplanContext,
  ): Promise<ActionSequence>;
}

export interface ActionPlannerConfig {
  maxActions: number;
  retryLimit: number;
}

export class ActionPlanner {
  private totalActionsExecuted = 0;
  constructor(
    private config: ActionPlannerConfig,
    private strategy: ActionPlannerStrategy,
  ) {}

  async plan(goal: string, pageState: PageState): Promise<ActionSequence> {
    if (this.totalActionsExecuted >= this.config.maxActions) {
      return { actions: [], estimatedCost: 0 };
    }
    const seq = await this.strategy.generatePlan(goal, pageState);
    const remaining = this.config.maxActions - this.totalActionsExecuted;
    const trimmed = seq.actions.slice(0, remaining);
    this.totalActionsExecuted += trimmed.length;
    return { actions: trimmed, estimatedCost: seq.estimatedCost };
  }

  async replan(
    goal: string,
    pageState: PageState,
    failedAction: BrowserAction,
    error: string,
  ): Promise<ActionSequence> {
    if (this.totalActionsExecuted >= this.config.maxActions) {
      return { actions: [], estimatedCost: 0 };
    }
    const seq = await this.strategy.generatePlan(goal, pageState, { failedAction, error });
    const remaining = this.config.maxActions - this.totalActionsExecuted;
    const trimmed = seq.actions.slice(0, remaining);
    this.totalActionsExecuted += trimmed.length;
    return { actions: trimmed, estimatedCost: seq.estimatedCost };
  }

  get executed(): number {
    return this.totalActionsExecuted;
  }
}
