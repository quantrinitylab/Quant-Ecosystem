// ============================================================================
// QuantAI - useModels Hook
// Fetches available models from /api/models with static fallback
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { AVAILABLE_MODELS } from '../types/models';
import type { AIModel } from '../types/models';
import { getAuthToken } from '../lib/auth';

interface UseModelsReturn {
  models: AIModel[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useModels(): UseModelsReturn {
  const [models, setModels] = useState<AIModel[]>(AVAILABLE_MODELS);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      const token = getAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch('/api/models', { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
      const data = await response.json();
      const fetched: AIModel[] = Array.isArray(data) ? data : data?.models || data?.data || [];
      if (fetched.length > 0) {
        setModels(fetched);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch models';
      setError(message);
      // Keep using static AVAILABLE_MODELS as fallback
      setModels(AVAILABLE_MODELS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  return { models, isLoading, error, refetch: fetchModels };
}

export default useModels;
