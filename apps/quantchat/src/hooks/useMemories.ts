// ============================================================================
// QuantChat - useMemories Hook (Tasks 13.1, 13.2, 13.3, 13.4)
//
// Drives the Memories vault:
//   - memories            newest-first list (server-ordered, Task 13.1)
//   - filters / setFilters date-range / location / caption search (Task 13.3)
//   - saveMemory          persist a snap/story/reel into the vault (Task 13.2)
//   - deleteMemory        soft-delete; returns the id so the UI can offer undo
//   - restoreMemory       undo a delete within the 5-second window (Task 13.4)
//
// All requests go through the Next.js `/api/memories` proxy with auth headers.
// ============================================================================
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getAuthHeaders, getAuthHeadersWithContent } from '../lib/auth';

export type MemoryMediaType = 'PHOTO' | 'VIDEO';

export interface Memory {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: MemoryMediaType;
  caption: string | null;
  location: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface MemoryFilters {
  from?: string;
  to?: string;
  location?: string;
  q?: string;
}

export interface SaveMemoryInput {
  mediaUrl: string;
  mediaType: MemoryMediaType;
  caption?: string;
  location?: string;
}

/** Undo window (ms) the UI should display after a delete (matches backend). */
export const MEMORY_UNDO_WINDOW_MS = 5000;

interface MemoriesResponse {
  success: boolean;
  data: { memories: Memory[]; total: number };
}

function buildQueryString(filters: MemoryFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.location) params.set('location', filters.location);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function fetchMemories(filters: MemoryFilters): Promise<Memory[]> {
  const res = await fetch(`/api/memories${buildQueryString(filters)}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to load memories: ${res.statusText}`);
  const json: MemoriesResponse = await res.json();
  return json.data?.memories ?? [];
}

export interface UseMemoriesReturn {
  memories: Memory[];
  isLoading: boolean;
  isError: boolean;
  filters: MemoryFilters;
  setFilters: (filters: MemoryFilters) => void;
  clearFilters: () => void;
  saveMemory: (input: SaveMemoryInput) => Promise<Memory | null>;
  deleteMemory: (id: string) => Promise<string | null>;
  restoreMemory: (id: string) => Promise<Memory | null>;
  refetch: () => void;
}

export function useMemories(initialFilters: MemoryFilters = {}): UseMemoriesReturn {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<MemoryFilters>(initialFilters);

  const queryKey = useMemo(() => ['memories', filters] as const, [filters]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchMemories(filters),
    placeholderData: keepPreviousData,
  });

  const saveMutation = useMutation({
    mutationFn: async (input: SaveMemoryInput) => {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { ...getAuthHeadersWithContent() },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to save memory');
      const json: { data: Memory } = await res.json();
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/memories/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Failed to delete memory');
      return id;
    },
    onMutate: async (id: string) => {
      // Optimistically drop the deleted memory from every cached list.
      await queryClient.cancelQueries({ queryKey: ['memories'] });
      const snapshots = queryClient.getQueriesData<Memory[]>({ queryKey: ['memories'] });
      snapshots.forEach(([key, value]) => {
        if (value) {
          queryClient.setQueryData(
            key,
            value.filter((m) => m.id !== id),
          );
        }
      });
      return { snapshots };
    },
    onError: (_err, _id, context) => {
      context?.snapshots.forEach(([key, value]) => queryClient.setQueryData(key, value));
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/memories/${id}/restore`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Failed to restore memory');
      const json: { data: Memory } = await res.json();
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
  });

  const saveMemory = useCallback(
    async (input: SaveMemoryInput) => {
      try {
        return await saveMutation.mutateAsync(input);
      } catch {
        return null;
      }
    },
    [saveMutation],
  );

  const deleteMemory = useCallback(
    async (id: string) => {
      try {
        return await deleteMutation.mutateAsync(id);
      } catch {
        return null;
      }
    },
    [deleteMutation],
  );

  const restoreMemory = useCallback(
    async (id: string) => {
      try {
        return await restoreMutation.mutateAsync(id);
      } catch {
        return null;
      }
    },
    [restoreMutation],
  );

  const clearFilters = useCallback(() => setFilters({}), []);

  return {
    memories: data ?? [],
    isLoading,
    isError,
    filters,
    setFilters,
    clearFilters,
    saveMemory,
    deleteMemory,
    restoreMemory,
    refetch,
  };
}

export default useMemories;
