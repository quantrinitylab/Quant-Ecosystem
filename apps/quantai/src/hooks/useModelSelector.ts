// ============================================================================
// QuantAI - useModelSelector Hook
// Model selection state with localStorage persistence
// ============================================================================

import { useState, useCallback, useMemo } from 'react';
import { AVAILABLE_MODELS } from '../types/models';
import type { AIModel } from '../types/models';

const STORAGE_KEY = 'quantai-model';

function getDefaultModelId(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && AVAILABLE_MODELS.some((m) => m.id === stored)) {
      return stored;
    }
  }
  const defaultModel = AVAILABLE_MODELS.find((m) => m.isDefault);
  return defaultModel?.id || 'gpt-4o';
}

export function useModelSelector() {
  const [selectedModelId, setSelectedModelId] = useState<string>(getDefaultModelId);

  const switchModel = useCallback((id: string) => {
    setSelectedModelId(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const getModel = useCallback((id: string): AIModel | undefined => {
    return AVAILABLE_MODELS.find((m) => m.id === id);
  }, []);

  const currentModel = useMemo(() => {
    return AVAILABLE_MODELS.find((m) => m.id === selectedModelId) || AVAILABLE_MODELS[0];
  }, [selectedModelId]);

  return {
    models: AVAILABLE_MODELS,
    currentModel,
    switchModel,
    selectedModelId,
    getModel,
  };
}

export default useModelSelector;
