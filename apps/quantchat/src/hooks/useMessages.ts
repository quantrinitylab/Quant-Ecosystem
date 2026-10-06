import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { Message } from '../types';

export function useMessages(conversationId: string) {
  return useQuery<Message[], Error>({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const response = await apiClient.getMessages(conversationId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load messages');
      }
      // The backend returns a paginated envelope { data, total, page, ... }
      // inside the API response's `data` field — unwrap it so callers always
      // get a plain array. Without this, `.filter`/`.map` on the result
      // throws "e.filter is not a function" and the chat page crashes.
      const raw = response.data;
      if (Array.isArray(raw)) return raw;
      if (
        raw &&
        typeof raw === 'object' &&
        Array.isArray((raw as unknown as { data?: unknown }).data)
      ) {
        return (raw as unknown as { data: Message[] }).data;
      }
      return [];
    },
    enabled: !!conversationId,
  });
}

export default useMessages;
