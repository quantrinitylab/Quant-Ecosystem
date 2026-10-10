// ============================================================================
// QuantAI — P0 crash regression test (Sept 2026).
//
// Root cause: `useModelSelector` could return `currentModel === undefined`
// when the models API returned an empty list. `page.tsx` dereferenced
// `currentModel.id` during render → "Cannot read properties of undefined
// (reading 'id')" → client-side exception → "Application error" on
// quantai.quantrinity.in while /login kept working.
//
// These tests pin the fallback chain: resolveCurrentModel must NEVER return
// undefined, no matter what the API returns.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { resolveCurrentModel } from '../hooks/useModelSelector';
import { AVAILABLE_MODELS } from '../types/models';
import type { AIModel } from '../types/models';

const makeModel = (id: string): AIModel => ({
  id,
  name: id,
  provider: 'quant',
  contextWindow: 8000,
  capabilities: ['reasoning'],
  icon: '⭐',
  description: 'test model',
});

describe('resolveCurrentModel — P0 crash regression', () => {
  it('returns the selected model when present', () => {
    const models = [makeModel('a'), makeModel('b')];
    const resolved = resolveCurrentModel(models, 'b');
    expect(resolved).toBeDefined();
    expect(resolved.id).toBe('b');
  });

  it('falls back to models[0] when selection is missing', () => {
    const models = [makeModel('a'), makeModel('b')];
    const resolved = resolveCurrentModel(models, 'nope');
    expect(resolved).toBeDefined();
    expect(resolved.id).toBe('a');
  });

  it('NEVER returns undefined when the API returns an empty list (the P0)', () => {
    const resolved = resolveCurrentModel([], 'quant-1');
    expect(resolved).toBeDefined();
    expect(typeof resolved.id).toBe('string');
    expect(resolved.id.length).toBeGreaterThan(0);
  });

  it('NEVER returns undefined when the API returns empty AND selection is bogus', () => {
    const resolved = resolveCurrentModel([], 'does-not-exist');
    expect(resolved).toBeDefined();
    expect(typeof resolved.id).toBe('string');
  });

  it('resolves a static-list model when fetched list is empty', () => {
    const resolved = resolveCurrentModel([], 'quant-1');
    const staticIds = AVAILABLE_MODELS.map((m) => m.id);
    // Either the static match or the hardcoded fallback — both are safe.
    expect(['quant-1', ...staticIds].includes(resolved.id)).toBe(true);
  });

  it('page.tsx can safely dereference .id on every fallback path', () => {
    const cases: Array<[AIModel[], string]> = [
      [[], 'quant-1'],
      [[], 'bogus'],
      [[makeModel('x')], 'bogus'],
      [[makeModel('x')], 'x'],
    ];
    for (const [models, selected] of cases) {
      const resolved = resolveCurrentModel(models, selected);
      // This is the exact dereference that crashed the live site:
      expect(() => resolved.id).not.toThrow();
      expect(resolved.id).toBeTruthy();
    }
  });
});
