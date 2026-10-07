import { describe, it, expect } from 'vitest';
import { AICostRouter } from '../ai-cost-router.js';

describe('AICostRouter', () => {
  it('routes simple prompts to small model', () => {
    const router = new AICostRouter();
    const decision = router.routeRequest('Hello, how are you?', {
      userFacing: false,
    });

    expect(decision.model.tier).toBe('small');
    expect(decision.complexity).toBe('simple');
    expect(decision.streaming).toBe(false);
  });

  it('routes complex prompts to large model', () => {
    const router = new AICostRouter();
    const longPrompt = 'x'.repeat(1000); // >200 tokens

    const decision = router.routeRequest(longPrompt, {
      userFacing: false,
    });

    expect(decision.model.tier).toBe('large');
    expect(decision.complexity).toBe('complex');
  });

  it('enables streaming for user-facing requests', () => {
    const router = new AICostRouter();
    const decision = router.routeRequest('Tell me a story', {
      userFacing: true,
    });

    expect(decision.streaming).toBe(true);
  });

  it('respects cost budget constraints', () => {
    const router = new AICostRouter();
    const longPrompt = 'x'.repeat(1000);

    const decision = router.routeRequest(longPrompt, {
      userFacing: false,
      costBudget: 0.005,
    });

    expect(decision.model.tier).toBe('small');
  });

  it('respects latency constraints', () => {
    const router = new AICostRouter();
    const moderatePrompt = 'x'.repeat(400); // moderate complexity

    const decision = router.routeRequest(moderatePrompt, {
      userFacing: false,
      maxLatencyMs: 300,
    });

    expect(decision.model.tier).toBe('small');
  });

  it('provides cost estimation', () => {
    const router = new AICostRouter();
    const decision = router.routeRequest('Hello world', {
      userFacing: false,
    });

    expect(decision.estimatedCost).toBeGreaterThan(0);
    expect(decision.estimatedLatencyMs).toBeGreaterThan(0);
  });

  it('tracks routing statistics', () => {
    const router = new AICostRouter();
    router.routeRequest('Request 1', { userFacing: false });
    router.routeRequest('Request 2', { userFacing: true });

    const stats = router.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.totalCost).toBeGreaterThan(0);
    expect(stats.avgCostPerRequest).toBeGreaterThan(0);
  });

  it('allows registering custom models', () => {
    const router = new AICostRouter();
    router.registerModel({
      id: 'custom-model',
      tier: 'medium',
      costPer1kTokens: 0.003,
      maxTokens: 32000,
      avgLatencyMs: 500,
      capabilities: ['text', 'code'],
    });

    const models = router.getModels();
    expect(models.find((m) => m.id === 'custom-model')).toBeDefined();
  });

  it('includes reason in routing decision', () => {
    const router = new AICostRouter();
    const decision = router.routeRequest('Hello', {
      userFacing: true,
      costBudget: 0.1,
      maxLatencyMs: 1000,
    });

    expect(decision.reason).toContain('Complexity');
    expect(decision.reason).toContain('Streaming enabled');
  });

  it('validates routing context with zod', () => {
    const router = new AICostRouter();
    expect(() => router.routeRequest('Hello', { userFacing: 'not-a-boolean' } as never)).toThrow();
  });
});
