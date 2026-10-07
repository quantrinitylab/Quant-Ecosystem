// ============================================================================
// QuantAI - usePromptLibrary Hook
// Server-persisted prompt templates via /api/prompts. Templates survive
// reloads and sync across devices (backed by AiPromptTemplate rows), replacing
// the previous in-memory-only prompt store.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../lib/auth';

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  isFavorite: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromptInput {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
}

export interface UpdatePromptInput {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  isFavorite?: boolean;
}

interface UsePromptLibraryReturn {
  prompts: PromptTemplate[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
  createPrompt: (input: CreatePromptInput) => Promise<PromptTemplate | null>;
  updatePrompt: (id: string, input: UpdatePromptInput) => Promise<PromptTemplate | null>;
  deletePrompt: (id: string) => Promise<boolean>;
  toggleFavorite: (id: string) => Promise<void>;
  recordUsage: (id: string) => Promise<void>;
}

const API_BASE = '/api/prompts';

function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export function usePromptLibrary(): UsePromptLibraryReturn {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(API_BASE, { headers: authHeaders() });
      if (!res.ok) {
        if (res.status === 401) {
          setPrompts([]);
          return;
        }
        throw new Error(`Failed to load prompts: ${res.status}`);
      }
      const json = (await res.json()) as { data?: PromptTemplate[] };
      setPrompts(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompts');
      setPrompts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createPrompt = useCallback(
    async (input: CreatePromptInput): Promise<PromptTemplate | null> => {
      try {
        const res = await fetch(API_BASE, {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(`Failed to create prompt: ${res.status}`);
        const json = (await res.json()) as { data?: PromptTemplate };
        if (!json.data) return null;
        setPrompts((prev) => [json.data as PromptTemplate, ...prev]);
        return json.data;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create prompt');
        return null;
      }
    },
    [],
  );

  const updatePrompt = useCallback(
    async (id: string, input: UpdatePromptInput): Promise<PromptTemplate | null> => {
      try {
        const res = await fetch(`${API_BASE}/${id}`, {
          method: 'PUT',
          headers: authHeaders(true),
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(`Failed to update prompt: ${res.status}`);
        const json = (await res.json()) as { data?: PromptTemplate };
        if (!json.data) return null;
        setPrompts((prev) => prev.map((p) => (p.id === id ? (json.data as PromptTemplate) : p)));
        return json.data;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update prompt');
        return null;
      }
    },
    [],
  );

  const deletePrompt = useCallback(async (id: string): Promise<boolean> => {
    // Optimistic removal with rollback on failure.
    let removed: PromptTemplate | undefined;
    setPrompts((prev) => {
      removed = prev.find((p) => p.id === id);
      return prev.filter((p) => p.id !== id);
    });
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error(`Failed to delete prompt: ${res.status}`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete prompt');
      if (removed) setPrompts((prev) => [removed as PromptTemplate, ...prev]);
      return false;
    }
  }, []);

  const toggleFavorite = useCallback(async (id: string): Promise<void> => {
    // Optimistic toggle.
    setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, isFavorite: !p.isFavorite } : p)));
    try {
      const res = await fetch(`${API_BASE}/${id}/favorite`, {
        method: 'POST',
        headers: authHeaders(true),
      });
      if (!res.ok) throw new Error('toggle failed');
      const json = (await res.json()) as { data?: PromptTemplate };
      if (json.data) {
        setPrompts((prev) => prev.map((p) => (p.id === id ? (json.data as PromptTemplate) : p)));
      }
    } catch {
      // Roll back on failure.
      setPrompts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, isFavorite: !p.isFavorite } : p)),
      );
    }
  }, []);

  const recordUsage = useCallback(async (id: string): Promise<void> => {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, usageCount: p.usageCount + 1 } : p)),
    );
    try {
      await fetch(`${API_BASE}/${id}/use`, { method: 'POST', headers: authHeaders(true) });
    } catch {
      // best-effort; the optimistic increment is acceptable if the call fails
    }
  }, []);

  return {
    prompts,
    isLoading,
    error,
    reload: () => void load(),
    createPrompt,
    updatePrompt,
    deletePrompt,
    toggleFavorite,
    recordUsage,
  };
}

export default usePromptLibrary;
