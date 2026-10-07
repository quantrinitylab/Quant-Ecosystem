import { describe, it, expect } from 'vitest';
import { GuardrailEvaluator } from '../experiment/guardrails';
import type { GuardrailMetric } from '../experiment/experiment-service';

describe('GuardrailEvaluator', () => {
  function createEvaluator(): GuardrailEvaluator {
    return new GuardrailEvaluator();
  }

  describe('getDefaultGuardrails', () => {
    it('should return predefined guardrail metrics', () => {
      const evaluator = createEvaluator();
      const defaults = evaluator.getDefaultGuardrails();

      expect(defaults).toHaveLength(3);
      expect(defaults.map((g) => g.name)).toEqual([
        'session_duration_drop',
        'rage_quit_rate',
        'report_rate',
      ]);
    });

    it('should have correct thresholds and directions', () => {
      const evaluator = createEvaluator();
      const defaults = evaluator.getDefaultGuardrails();

      const sessionDrop = defaults.find((g) => g.name === 'session_duration_drop')!;
      expect(sessionDrop.threshold).toBe(0.2);
      expect(sessionDrop.direction).toBe('below');

      const rageQuit = defaults.find((g) => g.name === 'rage_quit_rate')!;
      expect(rageQuit.threshold).toBe(0.05);
      expect(rageQuit.direction).toBe('above');

      const reportRate = defaults.find((g) => g.name === 'report_rate')!;
      expect(reportRate.threshold).toBe(0.01);
      expect(reportRate.direction).toBe('above');
    });
  });

  describe('evaluate', () => {
    it('should return no breach when all metrics are within thresholds', () => {
      const evaluator = createEvaluator();
      const guardrails: GuardrailMetric[] = [
        { name: 'rage_quit_rate', threshold: 0.05, direction: 'above' },
        { name: 'report_rate', threshold: 0.01, direction: 'above' },
      ];

      const result = evaluator.evaluate({ rage_quit_rate: 0.02, report_rate: 0.005 }, guardrails);

      expect(result.breached).toBe(false);
      expect(result.breachedMetrics).toHaveLength(0);
    });

    it('should detect breach when metric exceeds above threshold', () => {
      const evaluator = createEvaluator();
      const guardrails: GuardrailMetric[] = [
        { name: 'rage_quit_rate', threshold: 0.05, direction: 'above' },
      ];

      const result = evaluator.evaluate({ rage_quit_rate: 0.08 }, guardrails);

      expect(result.breached).toBe(true);
      expect(result.breachedMetrics).toHaveLength(1);
      expect(result.breachedMetrics[0]!.name).toBe('rage_quit_rate');
      expect(result.breachedMetrics[0]!.value).toBe(0.08);
      expect(result.breachedMetrics[0]!.threshold).toBe(0.05);
    });

    it('should detect breach when metric drops below threshold', () => {
      const evaluator = createEvaluator();
      const guardrails: GuardrailMetric[] = [
        { name: 'session_duration_drop', threshold: 0.2, direction: 'below' },
      ];

      const result = evaluator.evaluate({ session_duration_drop: 0.1 }, guardrails);

      expect(result.breached).toBe(true);
      expect(result.breachedMetrics[0]!.name).toBe('session_duration_drop');
      expect(result.breachedMetrics[0]!.value).toBe(0.1);
    });

    it('should detect multiple breaches', () => {
      const evaluator = createEvaluator();
      const guardrails: GuardrailMetric[] = [
        { name: 'rage_quit_rate', threshold: 0.05, direction: 'above' },
        { name: 'report_rate', threshold: 0.01, direction: 'above' },
      ];

      const result = evaluator.evaluate({ rage_quit_rate: 0.08, report_rate: 0.03 }, guardrails);

      expect(result.breached).toBe(true);
      expect(result.breachedMetrics).toHaveLength(2);
    });

    it('should ignore metrics not present in currentMetrics', () => {
      const evaluator = createEvaluator();
      const guardrails: GuardrailMetric[] = [
        { name: 'unknown_metric', threshold: 0.5, direction: 'above' },
      ];

      const result = evaluator.evaluate({}, guardrails);

      expect(result.breached).toBe(false);
      expect(result.breachedMetrics).toHaveLength(0);
    });
  });

  describe('shouldAutoRollback', () => {
    it('should return true when any guardrail is breached', () => {
      const evaluator = createEvaluator();

      expect(
        evaluator.shouldAutoRollback([{ name: 'rage_quit_rate', value: 0.08, threshold: 0.05 }]),
      ).toBe(true);
    });

    it('should return false when no guardrails are breached', () => {
      const evaluator = createEvaluator();

      expect(evaluator.shouldAutoRollback([])).toBe(false);
    });
  });
});
