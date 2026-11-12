import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { Message } from '../types';

interface MessagesPage {
  messages: Message[];
  /**
   * QC-F-518: true when the backend bounded this caller's history at
   * their joinedAt (a group/channel whose history is hidden from new
   * members). The chat page uses it to say "earlier messages are
   * hidden" honestly instead of implying the conversation is empty.
   */
  historyHidden: boolean;
}

export function useMessages(conversationId: string) {
  const query = useQuery<MessagesPage, Error>({
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
      if (Array.isArray(raw)) return { messages: raw, historyHidden: false };
      if (
        raw &&
        typeof raw === 'object' &&
        Array.isArray((raw as unknown as { data?: unknown }).data)
      ) {
        const page = raw as unknown as { data: Message[]; historyHidden?: unknown };
        return {
          messages: page.data,
          historyHidden: page.historyHidden === true,
        };
      }
      return { messages: [], historyHidden: false };
    },
    enabled: !!conversationId,
  });

  return {
    ...query,
    data: query.data?.messages,
    historyHidden: query.data?.historyHidden ?? false,
  };
}

export default useMessages;
