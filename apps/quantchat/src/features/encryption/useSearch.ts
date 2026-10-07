// ============================================================================
// quantchat — encrypted search api-client hooks (Layer 5, W5)
// ============================================================================
//
// The ONLY sanctioned call path from a quantchat UI surface to the encrypted-
// search seam: typed react-query hooks over the same-origin Next proxy paths
// under `/api/search*` (never inline fetch — Requirement 1.4). The proxy
// forwards the bearer + x-request-id to the backend (`/search`, `/search/index`),
// which reaches the zero-knowledge blind index.
//
// SECURITY CONTRACT (Req 14.2, 15.6, 16.1): these hooks only ever carry OPAQUE
// HMAC token hashes (+ message/conversation ids). The Search_Key, plaintext,
// and tokens are produced/consumed client-side by `searchClient.ts` and are
// never passed to a hook and never reach the proxy/backend.
import { useApiMutation } from '@quant/api-client';
import { apiFetch } from '@quant/api-client';
import type {
  BlindIndexUploadInput,
  BlindIndexUploadResponse,
  UnifiedSearchInput,
  UnifiedSearchResponse,
} from './types';
import type { BlindIndexTransport, EncryptedSearchCandidate } from './searchClient';

/**
 * POST /api/search/index — upload a message's blind-index token hashes
 * (client tokenize + HMAC on send, Req 14.1). Token hashes only; the owner is
 * derived server-side from the session.
 */
export function useUploadBlindIndex() {
  return useApiMutation<BlindIndexUploadInput, BlindIndexUploadResponse>('/api/search/index');
}

/**
 * POST /api/search — unified search. The blind-index path is driven by
 * `tokenHashes` (E2EE messages, Req 15.1); a plaintext `q` drives the legacy
 * ILIKE path (non-E2EE, Req 15.7).
 */
export function useUnifiedSearch() {
  return useApiMutation<UnifiedSearchInput, UnifiedSearchResponse>('/api/search');
}

/**
 * Default blind-index transport over the same-origin `/api/search*` proxy
 * (Requirement 1.4: api-client only, no inline backend fetch). Injected into
 * `indexMessageTokens` / `searchEncryptedMessages` from `searchClient.ts` so the
 * search policy stays decoupled from the network. Carries OPAQUE token hashes
 * and ids only — the Search_Key and plaintext are held client-side (Req 14.2,
 * 16.1).
 *
 * @param token Optional bearer token (same-origin cookies also authenticate).
 */
export function createBlindIndexTransport(token?: string): BlindIndexTransport {
  return {
    async uploadIndex(upload): Promise<void> {
      const body: BlindIndexUploadInput = {
        messageId: upload.messageId,
        conversationId: upload.conversationId,
        tokenHashes: upload.tokenHashes,
      };
      const response = await apiFetch('/api/search/index', {
        method: 'POST',
        body,
        token,
      });
      if (!response.success) {
        throw new Error(response.error?.message ?? 'Failed to upload blind-index entry');
      }
    },
    async search(tokenHashes: string[]): Promise<EncryptedSearchCandidate[]> {
      const body: UnifiedSearchInput = { tokenHashes };
      const response = await apiFetch<UnifiedSearchResponse>('/api/search', {
        method: 'POST',
        body,
        token,
      });
      if (!response.success || !response.data) {
        throw new Error(response.error?.message ?? 'Failed to run encrypted search');
      }
      return response.data.encrypted?.data ?? [];
    },
  };
}
