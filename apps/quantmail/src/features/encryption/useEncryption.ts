// ============================================================================
// quantmail — encryption (E2EE) api-client hooks (Layer 5)
// ============================================================================
//
// The ONLY sanctioned call path from a quantmail UI surface to the encryption
// seam: typed react-query hooks over the same-origin Next proxy paths under
// `/api/e2ee/*` (never inline fetch — Requirement 1.4). The proxy forwards the
// bearer + x-request-id to the backend (Layer 4), which reaches the zero-
// knowledge relay (Layer 2/3).
//
// SECURITY CONTRACT (Req 7.5): these hooks only ever carry CIPHERTEXT envelopes
// and PUBLIC key bundles. Plaintext and key material are produced/consumed
// client-side by the `@quant/encryption` engine via `e2eeClient.ts` — they are
// never passed to a hook and never reach the proxy/backend.
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type {
  PublishKeyBundleInput,
  PublishKeyBundleResponse,
  PeerKeyBundlesResponse,
  RelayMessageInput,
  RelayMessageResponse,
  InboxResponse,
} from './types';

/** POST /api/e2ee/keys — publish my device's PUBLIC pre-key bundle. */
export function usePublishKeyBundle() {
  return useApiMutation<PublishKeyBundleInput, PublishKeyBundleResponse>('/api/e2ee/keys');
}

/** GET /api/e2ee/keys/:userId — fetch a peer's published PUBLIC bundles. */
export function usePeerKeyBundles(userId: string | undefined, options?: UseApiQueryOptions) {
  return useApiQuery<PeerKeyBundlesResponse>(`/api/e2ee/keys/${userId ?? ''}`, {
    ...options,
    enabled: (options?.enabled ?? true) && Boolean(userId),
  });
}

/** POST /api/e2ee/messages — relay an opaque CIPHERTEXT envelope to a peer. */
export function useRelayEncryptedMessage() {
  return useApiMutation<RelayMessageInput, RelayMessageResponse>('/api/e2ee/messages');
}

/** GET /api/e2ee/messages — drain my inbox of relayed CIPHERTEXT envelopes. */
export function useEncryptedInbox(options?: UseApiQueryOptions) {
  return useApiQuery<InboxResponse>('/api/e2ee/messages', options);
}
