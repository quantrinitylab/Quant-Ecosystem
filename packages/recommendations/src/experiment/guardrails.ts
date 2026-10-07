// ============================================================================
// Guardrail Evaluator - Predefined safety metrics for experiment rollback
// ============================================================================

import type { GuardrailMetric } from './experiment-service';

export interface GuardrailBreachDetail {
  name: string;
  value: number;
  threshold: number;
}

export interface GuardrailEvaluation {
  breached: boolean;
  breachedMetrics: GuardrailBreachDetail[];
}

export class GuardrailEvaluator {
  private static readonly DEFAULT_GUARDRAILS: GuardrailMetric[] = [
    { name: 'session_duration_drop', threshold: 0.2, direction: 'below' },
    { name: 'rage_quit_rate', threshold: 0.05, direction: 'above' },
    { name: 'report_rate', threshold: 0.01, direction: 'above' },
  ];

  getDefaultGuardrails(): GuardrailMetric[] {
    return [...GuardrailEvaluator.DEFAULT_GUARDRAILS];
  }

  evaluate(metrics: Record<string, number>, guardrails: GuardrailMetric[]): GuardrailEvaluation {
    const breachedMetrics: GuardrailBreachDetail[] = [];

    for (const guardrail of guardrails) {
      const value = metrics[guardrail.name];
      if (value === undefined) continue;

      let isBreach = false;
      if (guardrail.direction === 'above' && value > guardrail.threshold) {
        isBreach = true;
      } else if (guardrail.direction === 'below' && value < guardrail.threshold) {
        isBreach = true;
      }

      if (isBreach) {
        breachedMetrics.push({
          name: guardrail.name,
          value,
          threshold: guardrail.threshold,
        });
      }
    }

    return {
      breached: breachedMetrics.length > 0,
      breachedMetrics,
    };
  }

  shouldAutoRollback(breachedMetrics: GuardrailBreachDetail[]): boolean {
    // Auto-rollback if any hard guardrail is breached
    return breachedMetrics.length > 0;
  }
}
