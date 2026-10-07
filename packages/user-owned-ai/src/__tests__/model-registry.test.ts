import { describe, expect, it } from 'vitest';
import { ModelRegistry } from '../model-registry.js';
import type { ModelRegistryEntry } from '../types.js';

describe('ModelRegistry', () => {
  it('lists all models with at least 10 entries', () => {
    const registry = new ModelRegistry();
    const models = registry.listModels();

    expect(models.length).toBeGreaterThanOrEqual(10);
  });

  it('filters models by provider (openai)', () => {
    const registry = new ModelRegistry();
    const openaiModels = registry.listModels({ provider: 'openai' });

    expect(openaiModels.length).toBeGreaterThan(0);
    for (const model of openaiModels) {
      expect(model.provider).toBe('openai');
    }
  });

  it('filters models by provider (anthropic)', () => {
    const registry = new ModelRegistry();
    const anthropicModels = registry.listModels({ provider: 'anthropic' });

    expect(anthropicModels.length).toBeGreaterThan(0);
    for (const model of anthropicModels) {
      expect(model.provider).toBe('anthropic');
    }
  });

  it('filters models by capability (functionCalling)', () => {
    const registry = new ModelRegistry();
    const models = registry.getModelsByCapability('functionCalling');

    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(model.capabilities.functionCalling).toBe(true);
    }
  });

  it('filters models by capability (codeGeneration)', () => {
    const registry = new ModelRegistry();
    const models = registry.getModelsByCapability('codeGeneration');

    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(model.capabilities.codeGeneration).toBe(true);
    }
  });

  it('gets pricing info for a valid model', () => {
    const registry = new ModelRegistry();
    const pricing = registry.getModelPricing('openai-gpt-4o');

    expect(pricing).not.toBeNull();
    expect(pricing!.inputPer1kTokens).toBeGreaterThan(0);
    expect(pricing!.outputPer1kTokens).toBeGreaterThan(0);
    expect(pricing!.currency).toBe('USD');
  });

  it('returns null pricing for unknown model', () => {
    const registry = new ModelRegistry();
    const pricing = registry.getModelPricing('nonexistent-model');

    expect(pricing).toBeNull();
  });

  it('compares models side-by-side', () => {
    const registry = new ModelRegistry();
    const comparison = registry.compareModels(['openai-gpt-4o', 'anthropic-claude-3-5-sonnet']);

    expect(comparison).toHaveLength(2);
    expect(comparison[0]!.id).toBe('openai-gpt-4o');
    expect(comparison[1]!.id).toBe('anthropic-claude-3-5-sonnet');
  });

  it('registers a custom model', () => {
    const registry = new ModelRegistry();
    const customModel: ModelRegistryEntry = {
      id: 'custom-my-model',
      provider: 'custom',
      modelId: 'my-finetuned-v1',
      displayName: 'My Custom Model',
      capabilities: {
        chat: true,
        completion: true,
        embedding: false,
        imageGeneration: false,
        codeGeneration: false,
        functionCalling: false,
        maxContextLength: 4096,
        streaming: true,
      },
      pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.002, currency: 'USD' },
      latencyProfile: 'balanced',
      localCompatible: false,
      maxContextLength: 4096,
      tags: ['custom'],
    };

    registry.registerCustomModel(customModel);
    const retrieved = registry.getModel('custom-my-model');

    expect(retrieved).not.toBeNull();
    expect(retrieved!.displayName).toBe('My Custom Model');
  });

  it('filters local compatible models', () => {
    const registry = new ModelRegistry();
    const localModels = registry.listModels({ local: true });

    expect(localModels.length).toBeGreaterThan(0);
    for (const model of localModels) {
      expect(model.localCompatible).toBe(true);
      expect(model.pricing.inputPer1kTokens).toBe(0);
    }
  });

  it('filters by price range', () => {
    const registry = new ModelRegistry();
    const cheapModels = registry.listModels({ priceRange: { max: 0.001 } });

    expect(cheapModels.length).toBeGreaterThan(0);
    for (const model of cheapModels) {
      expect(model.pricing.inputPer1kTokens).toBeLessThanOrEqual(0.001);
    }
  });

  it('returns null for unknown model via getModel', () => {
    const registry = new ModelRegistry();
    expect(registry.getModel('does-not-exist')).toBeNull();
  });
});
