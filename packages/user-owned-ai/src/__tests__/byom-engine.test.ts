import { describe, expect, it } from 'vitest';
import { createBYOMEngine } from '../byom-engine.js';
import type { ModelProvider, ModelEndpoint } from '../types.js';

describe('BYOMEngine', () => {
  const mockProvider: ModelProvider = {
    id: 'ollama-local',
    name: 'Local Ollama',
    type: 'ollama',
    baseUrl: 'http://localhost:11434',
    capabilities: {
      chat: true,
      completion: true,
      embedding: true,
      imageGeneration: false,
      codeGeneration: true,
      functionCalling: false,
      maxContextLength: 8192,
      streaming: true,
    },
    rateLimit: { requestsPerMinute: 100, tokensPerMinute: 100000 },
  };

  const mockEndpoint: ModelEndpoint = {
    id: 'endpoint-1',
    providerId: 'ollama-local',
    modelId: 'llama3',
    url: 'http://localhost:11434/api/generate',
    active: true,
    priority: 1,
    capabilities: {
      chat: true,
      completion: true,
      embedding: false,
      imageGeneration: false,
      codeGeneration: true,
      functionCalling: false,
      maxContextLength: 8192,
      streaming: true,
    },
    costPerToken: { input: 0.0001, output: 0.0002, currency: 'USD' },
  };

  it('creates engine with user config', () => {
    const engine = createBYOMEngine({ userId: 'user-1' });
    const config = engine.getConfig();

    expect(config.userId).toBe('user-1');
    expect(config.costTracking).toBe(true);
    expect(config.localInferenceEnabled).toBe(false);
  });

  it('registers providers', () => {
    const engine = createBYOMEngine({ userId: 'user-1' });
    engine.registerProvider(mockProvider);

    expect(engine.getProvider('ollama-local')).not.toBeNull();
    expect(engine.getProviders()).toHaveLength(1);
    expect(engine.getConfig().defaultProvider).toBe('ollama-local');
  });

  it('removes providers', () => {
    const engine = createBYOMEngine({ userId: 'user-1' });
    engine.registerProvider(mockProvider);
    engine.removeProvider('ollama-local');

    expect(engine.getProvider('ollama-local')).toBeNull();
    expect(engine.getConfig().defaultProvider).toBeNull();
  });

  it('adds custom endpoints', () => {
    const engine = createBYOMEngine({ userId: 'user-1' });
    engine.addEndpoint(mockEndpoint);

    expect(engine.getEndpoint('endpoint-1')).not.toBeNull();
    expect(engine.getEndpoints()).toHaveLength(1);
  });

  it('filters active endpoints by priority', () => {
    const engine = createBYOMEngine({ userId: 'user-1' });
    engine.addEndpoint(mockEndpoint);
    engine.addEndpoint({
      ...mockEndpoint,
      id: 'endpoint-2',
      priority: 0,
      active: true,
    });
    engine.addEndpoint({
      ...mockEndpoint,
      id: 'endpoint-3',
      active: false,
    });

    const active = engine.getActiveEndpoints();
    expect(active).toHaveLength(2);
    expect(active[0]!.id).toBe('endpoint-2');
  });

  it('performs inference on custom endpoint', async () => {
    const engine = createBYOMEngine({ userId: 'user-1' });
    engine.addEndpoint(mockEndpoint);

    const result = await engine.infer('endpoint-1', 'What is TypeScript?');
    expect(result.text).toBeTruthy();
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.cost).toBeGreaterThan(0);
    expect(result.model).toBe('llama3');
  });

  it('throws when endpoint not found', async () => {
    const engine = createBYOMEngine({ userId: 'user-1' });
    await expect(engine.infer('nonexistent', 'test')).rejects.toThrow(
      'Endpoint nonexistent not found',
    );
  });

  it('throws when endpoint is inactive', async () => {
    const engine = createBYOMEngine({ userId: 'user-1' });
    engine.addEndpoint({ ...mockEndpoint, active: false });

    await expect(engine.infer('endpoint-1', 'test')).rejects.toThrow('not active');
  });

  it('tracks costs per user', async () => {
    const engine = createBYOMEngine({ userId: 'user-1' });
    engine.addEndpoint(mockEndpoint);

    await engine.infer('endpoint-1', 'Hello');
    await engine.infer('endpoint-1', 'World');

    const summary = engine.getCostSummary();
    expect(summary.userId).toBe('user-1');
    expect(summary.totalCost).toBeGreaterThan(0);
    expect(summary.requestCount).toBe(2);
  });

  it('enforces budget limits', async () => {
    const engine = createBYOMEngine({
      userId: 'user-1',
      maxMonthlyBudget: 10.0,
    });
    engine.addEndpoint(mockEndpoint);

    expect(engine.isWithinBudget()).toBe(true);
    expect(engine.getBudgetRemaining()).toBe(10.0);

    await engine.infer('endpoint-1', 'Test prompt');
    expect(engine.getBudgetRemaining()!).toBeLessThan(10.0);
  });

  it('detects model capabilities', () => {
    const engine = createBYOMEngine({ userId: 'user-1' });
    engine.addEndpoint(mockEndpoint);

    const capabilities = engine.detectCapabilities(mockEndpoint);
    expect(capabilities.chat).toBe(true);
    expect(capabilities.codeGeneration).toBe(true);
    expect(capabilities.imageGeneration).toBe(false);
  });

  it('manages local inference toggle', () => {
    const engine = createBYOMEngine({ userId: 'user-1' });
    expect(engine.isLocalInferenceEnabled()).toBe(false);

    engine.enableLocalInference();
    expect(engine.isLocalInferenceEnabled()).toBe(true);

    engine.disableLocalInference();
    expect(engine.isLocalInferenceEnabled()).toBe(false);
  });

  it('tracks request history', async () => {
    const engine = createBYOMEngine({ userId: 'user-1' });
    engine.addEndpoint(mockEndpoint);

    await engine.infer('endpoint-1', 'Request 1');
    await engine.infer('endpoint-1', 'Request 2');

    const history = engine.getRequestHistory();
    expect(history).toHaveLength(2);
    expect(history[0]!.status).toBe('completed');
  });
});
