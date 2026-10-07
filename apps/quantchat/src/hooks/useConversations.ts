import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { Conversation } from '../types';

/**
 * Real conversation list from the backend conversations API (Requirement 12.1).
 *
 * Returns the design-aligned `{ conversations, isLoading, error }` shape so the
 * conversation-list view can render real loading (12.2), error (12.3), and
 * empty (12.4) states instead of fixture data. The query result is also
 * passed through (`data`, `refetch`, `isError`) for backward compatibility with
 * existing callers until Task 21.1 swaps them onto the new shape.
 */
export function useConversations() {
  const query = useQuery<Conversation[], Error>({
    queryKey: ['chat-conversations'],
    queryFn: async () => {
      const response = await apiClient.getConversations();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load conversations');
      }
      const raw = response.data;
      if (Array.isArray(raw)) return raw;
      if (
        raw &&
        typeof raw === 'object' &&
        Array.isArray((raw as unknown as { data?: Conversation[] }).data)
      ) {
        return (raw as unknown as { data: Conversation[] }).data;
      }
      return [];
    },
  });

  return {
    // Design-aligned shape (Requirements 12.1–12.4).
    conversations: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    // Backward-compatible passthrough (consumed by src/app/page.tsx today;
    // removed in Task 21.1 once views move onto `conversations`).
    data: query.data,
    refetch: query.refetch,
    isError: query.isError,
  };
}

export default useConversations;
