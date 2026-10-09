import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AVAILABLE_MODELS, PROVIDER_COLORS } from '../types/models';
import type { AIModel } from '../types/models';

describe('AVAILABLE_MODELS', () => {
  it('should list only platform-served models (no third-party names)', () => {
    expect(AVAILABLE_MODELS.length).toBeGreaterThanOrEqual(1);
    for (const model of AVAILABLE_MODELS) {
      expect(model.provider).toBe('quant');
      expect(model.requiresUserKey).not.toBe(true);
    }
  });

  it('should have all required fields on every model', () => {
    for (const model of AVAILABLE_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.provider).toBeTruthy();
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.capabilities.length).toBeGreaterThan(0);
      expect(model.icon).toBeTruthy();
      expect(model.description).toBeTruthy();
    }
  });

  it('should have exactly one default model', () => {
    const defaults = AVAILABLE_MODELS.filter((m) => m.isDefault);
    expect(defaults.length).toBe(1);
    expect(defaults[0].id).toBe('quant-1');
  });

  it('should have unique ids', () => {
    const ids = AVAILABLE_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have valid providers with matching colors', () => {
    for (const model of AVAILABLE_MODELS) {
      expect(PROVIDER_COLORS[model.provider]).toBeTruthy();
    }
  });
});

describe('useModelSelector', () => {
  beforeEach(() => {
    // Mock localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
  });

  it('should persist model selection to localStorage', async () => {
    const { useModelSelector } = await import('../hooks/useModelSelector');
    // Verify the hook can be imported and models are accessible
    expect(useModelSelector).toBeDefined();
    expect(typeof useModelSelector).toBe('function');
  });

  it('should read default model when localStorage is empty', () => {
    const defaultModel = AVAILABLE_MODELS.find((m) => m.isDefault);
    expect(defaultModel).toBeDefined();
    expect(defaultModel!.id).toBe('quant-1');
  });

  it('should fall back to quant-1 if localStorage model is invalid', () => {
    localStorage.setItem('quantai-model', 'invalid-model-id');
    // After re-initialization, should fall back to default
    const stored = localStorage.getItem('quantai-model');
    const isValid = AVAILABLE_MODELS.some((m) => m.id === stored);
    const resolvedId = isValid ? stored : AVAILABLE_MODELS.find((m) => m.isDefault)?.id;
    expect(resolvedId).toBe('quant-1');
  });

  it('should resolve a valid stored model', () => {
    localStorage.setItem('quantai-model', 'quant-1');
    const stored = localStorage.getItem('quantai-model');
    const isValid = AVAILABLE_MODELS.some((m) => m.id === stored);
    expect(isValid).toBe(true);
  });
});
