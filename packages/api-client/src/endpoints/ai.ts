// ============================================================================
// API Client SDK - QuantAI Endpoints
// ============================================================================

import { createMutationHook } from '../hooks/useMutation';
import type { HttpClient } from '../core/http-client';

/** AI chat params */
export interface AIChatParams {
  message: string;
  context?: string[];
  model?: string;
}

/** AI chat response */
export interface AIChatResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/** AI stream params */
export interface AIStreamParams {
  message: string;
  model?: string;
}

/** AI stream response */
export interface AIStreamResponse {
  streamId: string;
  status: 'started';
}

/** Create AI endpoint hooks */
export function createAIHooks(client: HttpClient) {
  const useAIChat = createMutationHook<AIChatParams, AIChatResponse>(client, '/api/ai/chat');

  const useAIStream = createMutationHook<AIStreamParams, AIStreamResponse>(
    client,
    '/api/ai/stream',
  );

  return { useAIChat, useAIStream };
}
