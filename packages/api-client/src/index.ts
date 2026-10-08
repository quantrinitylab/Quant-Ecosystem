// ============================================================================
// @quant/api-client - Typed React Query API Client SDK
// ============================================================================

// Proxy utility for Next.js API routes
export { proxyToBackend } from './proxy';
export type { ProxyOptions } from './proxy';

// Core
export { HttpClient } from './core/http-client';
export { TokenManager } from './core/token-manager';
export type { TokenManagerConfig } from './core/token-manager';
export type { CreateApiClientConfig, ApiClientInstance } from './core/create-client';
export type {
  APIResponse,
  APIError,
  PaginatedResponse,
  RequestConfig,
  QueryOptions,
  RefreshConfig,
} from './core/types';

// Hooks (factory pattern — bind to an HttpClient instance)
export { useSubscription } from './hooks/useSubscription';
export type { SubscriptionOptions, SubscriptionState } from './hooks/useSubscription';

// Hooks (standalone — the canonical Layer-5 seam: UI -> same-origin Next proxy).
// These are the *only* sanctioned call path from a UI surface to an engine-backed
// endpoint (Requirement 1.4: "api-client only, no inline fetch to the backend").
export { useApiQuery } from './hooks/useApiQuery';
export type { UseApiQueryOptions } from './hooks/useApiQuery';
export { useApiMutation } from './hooks/useApiMutation';
export type { UseApiMutationOptions } from './hooks/useApiMutation';
export { apiFetch } from './core/api-fetch';
export type { ApiMethod, ApiFetchInit } from './core/api-fetch';
export { apiFetchRaw } from './core/api-fetch';
export type { ApiFetchRawInit } from './core/api-fetch';

// Endpoints
export type { Conversation, Message, SendMessageParams } from './endpoints/chat';
export type { Email, SendEmailParams, SearchEmailsParams } from './endpoints/mail';
export type {
  AIChatParams,
  AIChatResponse,
  AIStreamParams,
  AIStreamResponse,
} from './endpoints/ai';
