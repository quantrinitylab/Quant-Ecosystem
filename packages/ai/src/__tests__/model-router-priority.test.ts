// ============================================================================
// ModelRouter - admin provider priority/failover order
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModelRouter,
  orderModelsByProviderPriority,
} from '../core/model-router';
import type { AIModelConfig, AIProvider } from '../types';

function makeModel(id: string, provider: AIProvider): AIModelConfig {
  return {
    id,
    name: id,
    provider,
    capabilities: ['text_generation'],
    maxContextLength: 128000,
    maxOutputTokens: 4096,
    costPerInputToken: 0.000001,
    costPerOutputToken: 0.000002,
    latencyMs: 200,
    qualityScore: 0.9,
  };
}

function baseRequest() {
  return {
    prompt: 'Hello, world',
    userId: 'u1',
    app: 'quantai' as const,
    feature: 'test',
  };
}

describe('orderModelsByProviderPriority', () => {
  const getProvider = (id: string) =>
    ({ a: 'openai', b: 'meta', c: 'anthropic', d: 'unknown' })[id];

  it('orders by provider priority, stable within provider', () => {
    const out = orderModelsByProviderPriority(
      ['a', 'b', 'c', 'a2'],
      ['meta', 'openai', 'anthropic'],
      (id) => ({ ...{ a: 'openai', b: 'meta', c: 'anthropic', a2: 'openai' } })[id],
    );
    expect(out).toEqual(['b', 'a', 'a2', 'c']);
  });

  it('puts providers absent from the order last, preserving relative order', () => {
    const out = orderModelsByProviderPriority(['d', 'a', 'c'], ['openai'], getProvider);
    expect(out).toEqual(['a', 'd', 'c']);
  });

  it('is a no-op for an empty order', () => {
    const out = orderModelsByProviderPriority(['c', 'a', 'b'], [], getProvider);
    expect(out).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = ['c', 'a'];
    orderModelsByProviderPriority(input, ['openai'], getProvider);
    expect(input).toEqual(['c', 'a']);
  });
});

describe('ModelRouter.setProviderPriorityOrder', () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter();
  });

  it('stores a defensive copy and returns a copy', () => {
    const order = ['meta', 'openai'];
    router.setProviderPriorityOrder(order);
    order.push('anthropic');
    expect(router.getProviderPriorityOrder()).toEqual(['meta', 'openai']);
    router.getProviderPriorityOrder()!.push('google');
    expect(router.getProviderPriorityOrder()).toEqual(['meta', 'openai']);
  });

  it('treats null/empty as unset', () => {
    router.setProviderPriorityOrder(['meta']);
    router.setProviderPriorityOrder(null);
    expect(router.getProviderPriorityOrder()).toBeNull();
    router.setProviderPriorityOrder([]);
    expect(router.getProviderPriorityOrder()).toBeNull();
  });

  it('is null by default (compiled default order applies)', () => {
    expect(router.getProviderPriorityOrder()).toBeNull();
  });
});

describe('ModelRouter provider priority in selection', () => {
  // Hermetic providers ('togetherai'/'ollama' have no default models
  // registered) keep the router's ~40 default models out of the eligible set
  // via setAvailableProviders, so the two test models decide.
  function hermeticRouter(): ModelRouter {
    const router = new ModelRouter();
    router.registerModel(makeModel('model-alpha', 'togetherai'));
    router.registerModel(makeModel('model-beta', 'ollama'));
    router.setAvailableProviders(new Set(['togetherai', 'ollama']));
    return router;
  }

  it('prefers the earlier-listed provider when models are otherwise identical', () => {
    const router = hermeticRouter();

    // No order: stable sort keeps registration order ('model-alpha' first).
    expect(router.selectModel(baseRequest()).id).toBe('model-alpha');

    router.setProviderPriorityOrder(['ollama', 'togetherai']);
    expect(router.selectModel(baseRequest()).id).toBe('model-beta');
  });

  it('per-request providerPriorityOrder overrides the router-level order', () => {
    const router = hermeticRouter();
    router.setProviderPriorityOrder(['ollama', 'togetherai']);

    const selected = router.selectModel({
      ...baseRequest(),
      providerPriorityOrder: ['togetherai', 'ollama'],
    });
    expect(selected.id).toBe('model-alpha');
  });

  it('per-request order works without any router-level order', () => {
    const router = hermeticRouter();

    const selected = router.selectModel({
      ...baseRequest(),
      providerPriorityOrder: ['ollama', 'togetherai'],
    });
    expect(selected.id).toBe('model-beta');
  });

  it('does not change selection when no order is configured anywhere', () => {
    const router = hermeticRouter();
    expect(router.selectModel(baseRequest()).id).toBe('model-alpha');
  });
});
