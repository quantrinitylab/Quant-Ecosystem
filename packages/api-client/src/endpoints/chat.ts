// ============================================================================
// API Client SDK - QuantChat Endpoints
// ============================================================================

import { createQueryHook } from '../hooks/useQuery';
import { createMutationHook } from '../hooks/useMutation';
import { createInfiniteQueryHook } from '../hooks/useInfiniteQuery';
import type { HttpClient } from '../core/http-client';

/** Conversation type */
export interface Conversation {
  id: string;
  name: string;
  lastMessage: string;
  updatedAt: string;
  unreadCount: number;
}

/** Message type */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
}

/** Send message params */
export interface SendMessageParams {
  conversationId: string;
  content: string;
}

/** Create chat endpoint hooks */
export function createChatHooks(client: HttpClient) {
  const useConversations = createQueryHook<Record<string, string>, Conversation[]>(
    client,
    '/api/chat/conversations',
    { staleTime: 10000 },
  );

  const useMessages = createInfiniteQueryHook<{ conversationId: string }, Message>(
    client,
    (params) => `/api/chat/conversations/${params.conversationId}/messages`,
  );

  const useSendMessage = createMutationHook<SendMessageParams, Message>(
    client,
    '/api/chat/messages',
  );

  return { useConversations, useMessages, useSendMessage };
}
