// ============================================================================
// QuantAI - useModelSelector Hook
// Model selection state with localStorage persistence
// ============================================================================

import { useState, useCallback, useMemo } from 'react';
import { AVAILABLE_MODELS } from '../types/models';
import { useModels } from './useModels';
import type { AIModel } from '../types/models';

const STORAGE_KEY = 'quantai-model';

/**
 * Absolute last-resort model. `currentModel` must NEVER be undefined —
 * page.tsx dereferences `currentModel.id` during render, and an undefined
 * value throws a client-side exception that takes down the whole page
 * (this exact crash killed quantai.quantrinity.in in Sept 2026 when the
 * models API returned an empty list before #397).
 */
const FALLBACK_MODEL: AIModel = {
  id: 'quant-1',
  name: 'Quant-1',
  provider: 'quant',
  contextWindow: 256000,
  capabilities: ['ecosystem', 'automation', 'tools', 'cross-app'],
  icon: '🚀',
  description: 'Native Quant ecosystem model',
  isDefault: true,
};

/**
 * Pure fallback chain for resolving the current model. Exported for unit
 * testing — this is the exact logic that prevented the Sept 2026 P0 crash
 * ("Cannot read properties of undefined (reading 'id')" on page load when
 * the models API returned an empty list).
 */
export function resolveCurrentModel(models: AIModel[], selectedModelId: string): AIModel {
  return (
    models.find((m) => m.id === selectedModelId) ||
    models[0] ||
    AVAILABLE_MODELS.find((m) => m.id === selectedModelId) ||
    AVAILABLE_MODELS[0] ||
    FALLBACK_MODEL
  );
}

function getDefaultModelId(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && AVAILABLE_MODELS.some((m) => m.id === stored)) {
      return stored;
    }
  }
  const defaultModel = AVAILABLE_MODELS.find((m) => m.isDefault);
  return defaultModel?.id || 'quant-1';
}

export function useModelSelector() {
  const { models, isLoading: isLoadingModels } = useModels();
  const [selectedModelId, setSelectedModelId] = useState<string>(getDefaultModelId);

  const switchModel = useCallback((id: string) => {
    setSelectedModelId(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const getModel = useCallback(
    (id: string): AIModel | undefined => {
      return models.find((m) => m.id === id);
    },
    [models],
  );

  const currentModel: AIModel = useMemo(
    // Guaranteed non-undefined: fall back through fetched models, then the
    // static list, then a hardcoded fallback — so consumers can safely
    // dereference `currentModel.id` during render without a crash.
    () => resolveCurrentModel(models, selectedModelId),
    [models, selectedModelId],
  );

  return {
    models,
    currentModel,
    switchModel,
    selectedModelId,
    getModel,
    isLoadingModels,
  };
}

export default useModelSelector;
