// ============================================================================
// QuantMail — AI Memory, as seen from Drive.
//
// The assistant has been learning things for months — a writing style from sent
// mail, a contact's context, a preferred send time — and the user had no way to
// see any of it, let alone remove one. That is the wrong side of a trust
// bargain: a product that remembers you has to be able to show you what it
// remembers.
//
// Drive is the right home for it because Drive already answers "what of mine is
// stored here". The rows come from `memory_records`, the single durable table
// every app writes through, so this list spans QuantMail, QuantChat and
// QuantTube without any app importing another.
// ============================================================================

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserApiRequest as apiRequest } from '../services/browser-api-request';
import { ApiRequestError } from '../lib/query-retry';

export interface AIMemoryItem {
  id: string;
  version: number;
  kind: string;
  level: string;
  content: string;
  /** Readable one-liner; equals `content` unless the raw shape needed unpacking. */
  summary: string;
  /** Slug: an app name, or `shared` for the deliberately cross-app channels. */
  sourceApp: string;
  sourceLabel: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MemoryResponse {
  memories: AIMemoryItem[];
  total: number;
  truncated: boolean;
}

async function fetchMemories(): Promise<MemoryResponse> {
  const response = await apiRequest('/api/drive/memory');
  if (!response.ok) {
    throw new ApiRequestError('Failed to load AI memory', response.status, 'MEMORY_FAILED');
  }
  const data = (await response.json()) as Partial<MemoryResponse>;
  if (!Array.isArray(data.memories)) {
    // Asking again cannot change a malformed body, so it is explicitly final.
    throw new ApiRequestError('AI memory response was malformed', 0, 'MALFORMED', false);
  }
  return {
    memories: data.memories,
    total: typeof data.total === 'number' ? data.total : data.memories.length,
    truncated: data.truncated === true,
  };
}

export function useAIMemory() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['drive-ai-memory'],
    queryFn: fetchMemories,
    staleTime: 60_000,
  });

  const forget = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest(`/api/drive/memory/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new ApiRequestError('Failed to forget memory', response.status, 'FORGET_FAILED');
      }
      return id;
    },
    // Optimistic: the row is gone from the list the instant it is tapped, and
    // comes back if the server disagrees. Forgetting is an archive on the
    // backend, so a rollback restores a row that was never really destroyed.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['drive-ai-memory'] });
      const previous = queryClient.getQueryData<MemoryResponse>(['drive-ai-memory']);
      if (previous) {
        queryClient.setQueryData<MemoryResponse>(['drive-ai-memory'], {
          ...previous,
          memories: previous.memories.filter((m) => m.id !== id),
          total: Math.max(0, previous.total - 1),
        });
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['drive-ai-memory'], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['drive-ai-memory'] });
    },
  });

  return {
    memories: query.data?.memories ?? [],
    total: query.data?.total ?? 0,
    truncated: query.data?.truncated ?? false,
    isLoading: query.isLoading,
    error: query.error,
    forget: forget.mutate,
    forgettingId: forget.isPending ? forget.variables : null,
  };
}
