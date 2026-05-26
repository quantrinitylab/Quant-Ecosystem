import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRouter } from '../core/model-router';
import { CircuitBreakerRegistry } from '../core/circuit-breaker';
import { RoutingTable } from '../core/routing-table';
import { ProviderHealthMonitor } from '../core/provider-health';
import type { AIInferenceRequest } from '../types';

describe('ModelRouter', () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter();
  });

  describe('selectModel', () => {
    it('selects a specific model when requested', () => {
      const request: AIInferenceRequest = {
        prompt: 'Hello world',
        model: 'gpt-4o-mini',
        userId: 'user1',
        app: 'quantchat',
        feature: 'test',
      };
      const model = router.selectModel(request);
      expect(model.id).toBe('gpt-4o-mini');
    });

    it('routes code tasks to code-capable models', () => {
      const request: AIInferenceRequest = {
        prompt: 'Write a function to sort an array',
        userId: 'user1',
        app: 'quantchat',
        feature: 'code',
      };
      const model = router.selectModel(request);
      expect(model.capabilities).toContain('code_generation');
    });

    it('routes summarization tasks appropriately', () => {
      const request: AIInferenceRequest = {
        prompt: 'Summarize this document',
        userId: 'user1',
        app: 'quantmail',
        feature: 'summary',
      };
      const model = router.selectModel(request);
      expect(model.capabilities).toContain('text_summarization');
    });

    it('routes general text tasks', () => {
      const request: AIInferenceRequest = {
        prompt: 'Hello, how are you?',
        userId: 'user1',
        app: 'quantchat',
        feature: 'chat',
      };
      const model = router.selectModel(request);
      expect(model.capabilities).toContain('text_generation');
    });

    it('falls back to default when model not found', () => {
      const request: AIInferenceRequest = {
        prompt: 'test',
        model: 'nonexistent-model',
        userId: 'user1',
        app: 'quantchat',
        feature: 'test',
      };
      const model = router.selectModel(request);
      expect(model).toBeDefined();
      expect(model.id).toBeDefined();
    });
  });

  describe('model registration', () => {
    it('registers default models', () => {
      const models = router.getModels();
      expect(models.length).toBeGreaterThanOrEqual(25);
      const ids = models.map((m) => m.id);
      expect(ids).toContain('gpt-4o');
      expect(ids).toContain('gpt-4o-mini');
      expect(ids).toContain('claude-sonnet-4');
      expect(ids).toContain('claude-haiku-4');
    });

    it('allows registering custom models', () => {
      router.registerModel({
        id: 'custom-model',
        name: 'Custom Model',
        provider: 'openai',
        capabilities: ['text_generation'],
        maxContextLength: 4000,
        maxOutputTokens: 1000,
        costPerInputToken: 0.001,
        costPerOutputToken: 0.002,
        latencyMs: 100,
        qualityScore: 0.5,
      });
      const models = router.getModels();
      expect(models.find((m) => m.id === 'custom-model')).toBeDefined();
    });
  });

  describe('getModelsByCapability', () => {
    it('returns models with text generation', () => {
      const models = router.getModelsByCapability('text_generation');
      expect(models.length).toBeGreaterThanOrEqual(4);
    });

    it('returns models with code generation', () => {
      const models = router.getModelsByCapability('code_generation');
      expect(models.length).toBeGreaterThanOrEqual(2);
    });

    it('returns models with image generation', () => {
      const models = router.getModelsByCapability('image_generation');
      expect(models.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('fallback chain', () => {
    it('returns default fallback chain for text generation', () => {
      const chain = router.getFallbackChain('text_generation');
      expect(chain).toEqual(['gpt-4o', 'gpt-4o-mini', 'claude-haiku-4']);
    });

    it('returns code fallback chain', () => {
      const chain = router.getFallbackChain('code_generation');
      expect(chain).toEqual(['gpt-4o', 'claude-sonnet-4', 'gpt-4o-mini']);
    });

    it('returns default chain for unknown capabilities', () => {
      const chain = router.getFallbackChain('embedding');
      expect(chain).toEqual(['gpt-4o', 'gpt-4o-mini', 'claude-haiku-4']);
    });
  });

  describe('circuit breaker integration', () => {
    it('skips unavailable models when circuit breaker is open', async () => {
      const registry = new CircuitBreakerRegistry({ failureThreshold: 1 });
      const routerWithCb = new ModelRouter(registry);

      // Trip the openai breaker
      const breaker = registry.getBreaker('openai');
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        /* expected */
      }

      const request: AIInferenceRequest = {
        prompt: 'test prompt',
        userId: 'user1',
        app: 'quantchat',
        feature: 'test',
      };

      const model = routerWithCb.selectModel(request);
      // Should select a non-openai model since openai is down
      expect(model.provider).not.toBe('openai');
    });
  });

  describe('selectForTask', () => {
    it('selects llama-3.1-8b-instant for autocomplete (paid tier)', () => {
      const table = new RoutingTable();
      const routerWithTable = new ModelRouter(undefined, table);
      const model = routerWithTable.selectForTask('autocomplete', 'paid');
      expect(model.id).toBe('llama-3.1-8b-instant');
    });

    it('selects deepseek-coder-v3 for code_generation (paid tier)', () => {
      const table = new RoutingTable();
      const routerWithTable = new ModelRouter(undefined, table);
      const model = routerWithTable.selectForTask('code_generation', 'paid');
      expect(model.id).toBe('deepseek-coder-v3');
    });

    it('selects claude-sonnet-4 for complex_reasoning (paid tier)', () => {
      const table = new RoutingTable();
      const routerWithTable = new ModelRouter(undefined, table);
      const model = routerWithTable.selectForTask('complex_reasoning', 'paid');
      expect(model.id).toBe('claude-sonnet-4');
    });

    it('falls back when primary provider is unhealthy', () => {
      const table = new RoutingTable();
      const health = new ProviderHealthMonitor();

      // Make groq unhealthy (primary for autocomplete is llama-3.1-8b-instant on groq)
      for (let i = 0; i < 10; i++) {
        health.recordError('groq');
      }

      const routerWithHealth = new ModelRouter(undefined, table, health);
      const model = routerWithHealth.selectForTask('autocomplete', 'paid');
      // Should fall back to gpt-4o-mini or claude-haiku-4
      expect(model.provider).not.toBe('groq');
    });

    it('free tier selects cheapest model from candidates', () => {
      const table = new RoutingTable();
      const routerWithTable = new ModelRouter(undefined, table);
      const model = routerWithTable.selectForTask('complex_reasoning', 'free');
      // claude-sonnet-4 costs 0.000003, gpt-4o costs 0.000005, deepseek-r1 costs 0.00000055
      // cheapest is deepseek-r1
      expect(model.id).toBe('deepseek-r1');
    });

    it('enterprise tier selects highest quality model from candidates', () => {
      const table = new RoutingTable();
      const routerWithTable = new ModelRouter(undefined, table);
      const model = routerWithTable.selectForTask('complex_reasoning', 'enterprise');
      // claude-sonnet-4 quality 0.97, gpt-4o quality 0.95, deepseek-r1 quality 0.91
      expect(model.id).toBe('claude-sonnet-4');
    });

    it('throws when no healthy models available', () => {
      const table = new RoutingTable();
      const health = new ProviderHealthMonitor();

      // Make openai unhealthy (for dall-e-3 which is the only image_generation model)
      for (let i = 0; i < 10; i++) {
        health.recordError('openai');
      }

      const routerWithHealth = new ModelRouter(undefined, table, health);
      expect(() => routerWithHealth.selectForTask('image_generation', 'paid')).toThrow(
        'No healthy models available for task: image_generation',
      );
    });
  });
});
