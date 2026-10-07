import { describe, it, expect } from 'vitest';
import { PolicyEngine } from './policy-engine';
import type { ModerationResult, PolicyConfig } from '../types';

function createModerationResult(overrides: Partial<ModerationResult> = {}): ModerationResult {
  return {
    id: 'mod_test_1',
    contentId: 'content-1',
    contentType: 'text',
    categories: [
      { category: 'hate_speech', score: 0.85, confidence: 0.9, detected: true },
      { category: 'harassment', score: 0.3, confidence: 0.8, detected: false },
      { category: 'violence', score: 0.1, confidence: 0.9, detected: false },
      { category: 'nsfw', score: 0.05, confidence: 0.95, detected: false },
      { category: 'self_harm', score: 0.0, confidence: 0.95, detected: false },
    ],
    overallScore: 0.85,
    action: 'flag',
    confidence: 0.9,
    automated: true,
    flags: ['hate_speech'],
    metadata: {},
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('PolicyEngine', () => {
  it('should apply per-app thresholds correctly', () => {
    const policies: PolicyConfig[] = [
      {
        appId: 'app-strict',
        rules: [
          { category: 'hate_speech', threshold: 0.5, action: 'remove', severity: 'critical' },
          { category: 'violence', threshold: 0.3, action: 'flag', severity: 'high' },
        ],
      },
    ];

    const engine = new PolicyEngine(policies);
    const result = createModerationResult();
    const decision = engine.evaluate(result, 'app-strict');

    expect(decision.action).toBe('remove');
    expect(decision.severity).toBe('critical');
    expect(decision.matchedRules).toHaveLength(1);
    expect(decision.matchedRules[0]?.category).toBe('hate_speech');
  });

  it('should return approve when no rules match', () => {
    const policies: PolicyConfig[] = [
      {
        appId: 'app-lenient',
        rules: [
          { category: 'hate_speech', threshold: 0.99, action: 'remove', severity: 'critical' },
        ],
      },
    ];

    const engine = new PolicyEngine(policies);
    const result = createModerationResult();
    const decision = engine.evaluate(result, 'app-lenient');

    expect(decision.action).toBe('approve');
    expect(decision.severity).toBe('none');
    expect(decision.matchedRules).toHaveLength(0);
  });

  it('should fall back to classification result when no policy exists for app', () => {
    const engine = new PolicyEngine([]);
    const result = createModerationResult();
    const decision = engine.evaluate(result, 'unknown-app');

    expect(decision.action).toBe('flag'); // from the ModerationResult
    expect(decision.matchedRules).toHaveLength(0);
  });

  it('should add and remove policies', () => {
    const engine = new PolicyEngine([]);

    engine.addPolicy({
      appId: 'new-app',
      rules: [{ category: 'nsfw', threshold: 0.5, action: 'remove', severity: 'high' }],
    });

    expect(engine.getPolicy('new-app')).toBeDefined();
    expect(engine.getPolicy('new-app')?.rules).toHaveLength(1);

    const removed = engine.removePolicy('new-app');
    expect(removed).toBe(true);
    expect(engine.getPolicy('new-app')).toBeUndefined();
  });

  it('should select the highest severity action when multiple rules match', () => {
    const policies: PolicyConfig[] = [
      {
        appId: 'multi-rule',
        rules: [
          { category: 'hate_speech', threshold: 0.5, action: 'flag', severity: 'medium' },
          { category: 'hate_speech', threshold: 0.8, action: 'remove', severity: 'critical' },
        ],
      },
    ];

    const engine = new PolicyEngine(policies);
    const result = createModerationResult();
    const decision = engine.evaluate(result, 'multi-rule');

    expect(decision.action).toBe('remove');
    expect(decision.severity).toBe('critical');
    expect(decision.matchedRules).toHaveLength(2);
  });

  it('should validate policy schema on construction', () => {
    expect(() => new PolicyEngine([{ appId: '', rules: [] }])).toThrow();
  });
});
