import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { MessageRequestInboxView } from '../types';

/**
 * QC-F-321: pending first-contact message requests addressed to the
 * current user (GET /message-requests/inbox), on the useConversations
 * pattern. A failed load THROWS — callers render an honest error state,
 * never a fabricated empty inbox.
 */
export function useMessageRequests() {
  const query = useQuery<MessageRequestInboxView[], Error>({
    queryKey: ['chat-message-requests'],
    queryFn: async () => {
      const response = await apiClient.getMessageRequestsInbox();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load message requests');
      }
      const raw = response.data;
      if (Array.isArray(raw)) return raw;
      if (
        raw &&
        typeof raw === 'object' &&
        Array.isArray((raw as unknown as { data?: MessageRequestInboxView[] }).data)
      ) {
        return (raw as unknown as { data: MessageRequestInboxView[] }).data;
      }
      return [];
    },
  });

  return {
    requests: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isError: query.isError,
  };
}

export default useMessageRequests;
