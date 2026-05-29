import type { AutomationAction, ExecutionResult, FlowControlConfig } from '../types.js';
import { ActionExecutor } from './action-executor.js';

export class FlowController {
  private executor: ActionExecutor = new ActionExecutor();

  evaluateCondition(
    config: FlowControlConfig & { type: 'condition' },
    data: Record<string, unknown>,
  ): boolean {
    const fieldValue = data[config.field];
    const targetValue = config.value;

    switch (config.operator) {
      case 'eq':
        return fieldValue === targetValue;
      case 'neq':
        return fieldValue !== targetValue;
      case 'gt':
        return Number(fieldValue) > Number(targetValue);
      case 'lt':
        return Number(fieldValue) < Number(targetValue);
      case 'contains':
        return String(fieldValue ?? '').includes(String(targetValue));
    }
  }

  async executeLoop(
    actions: AutomationAction[],
    config: FlowControlConfig & { type: 'loop' },
    context: Record<string, unknown>,
  ): Promise<unknown[]> {
    const results: unknown[] = [];
    let iteration = 0;

    while (iteration < config.maxIterations) {
      for (const action of actions) {
        const result = await this.executor.execute(action, context);
        results.push(result);
      }
      iteration++;

      // Check until condition if provided
      if (config.untilCondition) {
        const conditionMet = this.evaluateSimpleCondition(config.untilCondition, context);
        if (conditionMet) break;
      }
    }

    return results;
  }

  executeBranch(
    config: FlowControlConfig & { type: 'branch' },
    context: Record<string, unknown>,
  ): string | null {
    for (const branch of config.branches) {
      if (this.evaluateSimpleCondition(branch.condition, context)) {
        return branch.actionId;
      }
    }
    return null;
  }

  async executeRetry(
    action: AutomationAction,
    config: FlowControlConfig & { type: 'retry' },
    context: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const retryAction: AutomationAction = {
      ...action,
      retryPolicy: {
        maxRetries: config.maxRetries,
        backoffMs: config.backoffMs,
        backoffMultiplier: 2,
      },
    };
    return this.executor.executeWithRetry(retryAction, context);
  }

  private evaluateSimpleCondition(condition: string, context: Record<string, unknown>): boolean {
    // Simple condition evaluation: "key == value" or "key > value"
    const match = condition.match(/^(\w+)\s*(==|!=|>|<)\s*(.+)$/);
    if (!match) return false;

    const [, key, operator, valueStr] = match;
    if (!key || !operator || !valueStr) return false;

    const contextValue = context[key];
    const targetValue = isNaN(Number(valueStr)) ? valueStr.replace(/["']/g, '') : Number(valueStr);

    switch (operator) {
      case '==':
        return contextValue === targetValue;
      case '!=':
        return contextValue !== targetValue;
      case '>':
        return Number(contextValue) > Number(targetValue);
      case '<':
        return Number(contextValue) < Number(targetValue);
      default:
        return false;
    }
  }
}
