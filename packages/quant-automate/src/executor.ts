import type {
  AutomationStep,
  InputMapping,
  OnErrorMode,
  StepCondition,
  StepRunResult,
  ToolExecutor,
} from './types.js';

/**
 * Resolves template references in input mappings.
 * Template syntax: {{stepId.output.field}} or {{stepId.output.nested.field}}
 */
function resolveTemplate(template: string, stepResults: Map<string, StepRunResult>): unknown {
  const templateRegex = /^\{\{(.+)\}\}$/;
  const match = templateRegex.exec(template);
  if (!match) return template;

  const path = match[1]!.split('.');
  const stepId = path[0]!;
  const result = stepResults.get(stepId);
  if (!result || !result.output) return undefined;

  // Navigate the path: stepId.output.field1.field2...
  let current: unknown = result.output;
  // Skip 'output' segment since we already access the output
  const fieldPath = path.slice(1);
  if (fieldPath[0] === 'output') {
    fieldPath.shift();
  }

  for (const segment of fieldPath) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Resolves all template references in an input mapping object.
 */
function resolveInputMapping(
  mapping: InputMapping,
  stepResults: Map<string, StepRunResult>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (typeof value === 'string') {
      resolved[key] = resolveTemplate(value, stepResults);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      resolved[key] = resolveInputMapping(value as InputMapping, stepResults);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Evaluates a step condition against previous step results.
 */
function evaluateCondition(
  condition: StepCondition,
  stepResults: Map<string, StepRunResult>,
): boolean {
  // Resolve the field reference
  const fieldValue = resolveTemplate(`{{${condition.field}}}`, stepResults);

  switch (condition.operator) {
    case 'equals':
      return fieldValue === condition.value;
    case 'not_equals':
      return fieldValue !== condition.value;
    case 'contains':
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return fieldValue.includes(condition.value);
      }
      return false;
    case 'gt':
      return typeof fieldValue === 'number' && typeof condition.value === 'number'
        ? fieldValue > condition.value
        : false;
    case 'lt':
      return typeof fieldValue === 'number' && typeof condition.value === 'number'
        ? fieldValue < condition.value
        : false;
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;
  }
}

/**
 * Calculates delay with exponential backoff.
 */
function calculateBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs?: number,
  multiplier?: number,
): number {
  const factor = multiplier ?? 2;
  const delay = baseDelayMs * Math.pow(factor, attempt);
  if (maxDelayMs !== undefined) {
    return Math.min(delay, maxDelayMs);
  }
  return delay;
}

/**
 * Sleeps for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class StepExecutor {
  private toolExecutor: ToolExecutor;

  constructor(toolExecutor: ToolExecutor) {
    this.toolExecutor = toolExecutor;
  }

  async executeSteps(steps: AutomationStep[]): Promise<StepRunResult[]> {
    const stepResults = new Map<string, StepRunResult>();
    const results: StepRunResult[] = [];

    for (const step of steps) {
      const result = await this.executeStep(step, stepResults);
      stepResults.set(step.id, result);
      results.push(result);

      // Stop execution if step failed and onError is 'fail' (default)
      const onError: OnErrorMode = step.onError ?? 'fail';
      if (result.status === 'failed' && onError === 'fail') {
        break;
      }
    }

    return results;
  }

  private async executeStep(
    step: AutomationStep,
    stepResults: Map<string, StepRunResult>,
  ): Promise<StepRunResult> {
    const startedAt = Date.now();

    // Evaluate condition - skip if condition is false
    if (step.condition) {
      const conditionMet = evaluateCondition(step.condition, stepResults);
      if (!conditionMet) {
        return {
          stepId: step.id,
          status: 'skipped',
          startedAt,
          completedAt: Date.now(),
          retryCount: 0,
        };
      }
    }

    // Resolve input mapping
    let input: Record<string, unknown> = {};
    if (step.inputMapping) {
      input = resolveInputMapping(step.inputMapping, stepResults);
    }

    // Execute with retry
    const maxRetries = step.retryPolicy?.maxRetries ?? 0;
    const onError: OnErrorMode = step.onError ?? 'fail';
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.toolExecutor.execute(step.toolId, input);
        if (result.success) {
          return {
            stepId: step.id,
            status: 'completed',
            output: result.data,
            startedAt,
            completedAt: Date.now(),
            retryCount: attempt,
          };
        }
        lastError = result.error ?? 'Execution failed';
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }

      // Wait before retry (if not the last attempt)
      if (attempt < maxRetries && step.retryPolicy) {
        const delay = calculateBackoff(
          attempt,
          step.retryPolicy.baseDelayMs,
          step.retryPolicy.maxDelayMs,
          step.retryPolicy.backoffMultiplier,
        );
        await sleep(delay);
      }
    }

    // All retries exhausted
    if (onError === 'skip') {
      return {
        stepId: step.id,
        status: 'skipped',
        error: lastError,
        startedAt,
        completedAt: Date.now(),
        retryCount: maxRetries,
      };
    }

    return {
      stepId: step.id,
      status: 'failed',
      error: lastError,
      startedAt,
      completedAt: Date.now(),
      retryCount: maxRetries,
    };
  }
}
