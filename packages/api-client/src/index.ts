// ============================================================================
// @quant/api-client - Typed React Query API Client SDK
// ============================================================================

// Proxy utility for Next.js API routes
export { proxyToBackend } from './proxy';
export type { ProxyOptions } from './proxy';

// Core
export { HttpClient } from './core/http-client';
export type {
  APIResponse,
  APIError,
  PaginatedResponse,
  RequestConfig,
  QueryOptions,
} from './core/types';

// Hooks
export { createQueryHook } from './hooks/useQuery';
export { createMutationHook } from './hooks/useMutation';
export { createInfiniteQueryHook } from './hooks/useInfiniteQuery';
export { useSubscription } from './hooks/useSubscription';
export type { SubscriptionOptions, SubscriptionState } from './hooks/useSubscription';

// Endpoints
export { createChatHooks } from './endpoints/chat';
export type { Conversation, Message, SendMessageParams } from './endpoints/chat';
export { createMailHooks } from './endpoints/mail';
export type { Email, SendEmailParams, SearchEmailsParams } from './endpoints/mail';
export { createAIHooks } from './endpoints/ai';
export type {
  AIChatParams,
  AIChatResponse,
  AIStreamParams,
  AIStreamResponse,
} from './endpoints/ai';
