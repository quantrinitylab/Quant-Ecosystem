// ============================================================================
// QuantAI - useModels Hook
// Fetches available models from /api/models with static fallback
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { AVAILABLE_MODELS } from '../types/models';
import type { AIModel } from '../types/models';
import { getAuthToken } from '../lib/auth';
import { apiFetchRaw } from '@quant/api-client';

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

      const response = await apiFetchRaw('/api/models', { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
      const data = await response.json();
      const raw: unknown[] = Array.isArray(data) ? data : data?.models || data?.data || [];
      // Normalize BYOM registry entries (backend shape) to the AIModel shape.
      // Everything from the bring-your-own-model registry requires the user's
      // own provider key — mark it so the picker never implies it is served.
      const fetched: AIModel[] = (raw as Record<string, unknown>[]).map((entry) => {
        const caps = entry.capabilities as Record<string, unknown> | undefined;
        const provider = String(entry.provider || 'quant');
        return {
          id: String(entry.id || ''),
          name: String(entry.displayName || entry.name || entry.id || 'Model'),
          provider: (['openai', 'anthropic', 'meta', 'google', 'quant'].includes(provider)
            ? provider
            : 'quant') as AIModel['provider'],
          contextWindow: Number(entry.maxContextLength || entry.contextWindow || 4096),
          capabilities: caps
            ? Object.keys(caps).filter((k) => caps[k] === true)
            : ((entry.capabilities as string[]) || []),
          icon: String(entry.icon || '🤖'),
          description: String(
            entry.description || 'Bring your own API key to use this model.',
          ),
          requiresUserKey: provider !== 'quant',
        };
      });
      if (fetched.length > 0) {
        setModels(fetched);
      }
      // If the API returns an empty list, keep the static fallback —
      // never leave consumers with an empty models array.
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
