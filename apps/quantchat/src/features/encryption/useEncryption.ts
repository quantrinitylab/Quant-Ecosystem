// ============================================================================
// quantchat — encryption (E2EE) api-client hooks (Layer 5)
// ============================================================================
//
// The ONLY sanctioned call path from a quantchat UI surface to the encryption
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
import { apiFetch } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type {
  PublishKeyBundleInput,
  PublishKeyBundleResponse,
  PeerKeyBundlesResponse,
  RelayMessageInput,
  RelayMessageResponse,
  InboxResponse,
  ReplenishOneTimePreKeysInput,
  OneTimePreKeyCountResponse,
} from './types';
import type { OneTimePreKeyReplenishmentTransport } from './e2eeClient';

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

/**
 * GET /api/e2ee/prekeys/count — read my remaining unclaimed one-time prekey
 * count, which drives replenishment (Req 2.7, 2.8).
 */
export function useOneTimePreKeyCount(options?: UseApiQueryOptions) {
  return useApiQuery<OneTimePreKeyCountResponse>('/api/e2ee/prekeys/count', options);
}

/**
 * POST /api/e2ee/prekeys — upload a batch of PUBLIC one-time prekeys to top up
 * my pool (client replenishment, Req 2.8). Public material only.
 */
export function useUploadOneTimePreKeys() {
  return useApiMutation<ReplenishOneTimePreKeysInput, { message: string }>('/api/e2ee/prekeys');
}

/**
 * Default replenishment transport over the same-origin `/api/e2ee/prekeys*`
 * proxy (Requirement 1.4: api-client only, no inline backend fetch). Injected
 * into `replenishOneTimePreKeys` from `e2eeClient.ts` so the replenishment
 * policy stays decoupled from the network. Carries PUBLIC one-time prekeys only
 * — key material is generated and held client-side (Req 2.8, 16.1).
 *
 * @param token Optional bearer token (same-origin cookies also authenticate).
 */
export function createOneTimePreKeyTransport(token?: string): OneTimePreKeyReplenishmentTransport {
  return {
    async getRemainingCount(): Promise<number> {
      const response = await apiFetch<OneTimePreKeyCountResponse>('/api/e2ee/prekeys/count', {
        method: 'GET',
        token,
      });
      if (!response.success || !response.data) {
        throw new Error(response.error?.message ?? 'Failed to read one-time prekey count');
      }
      return response.data.remaining;
    },
    async uploadOneTimePreKeys(oneTimePreKeys: string[]): Promise<void> {
      const body: ReplenishOneTimePreKeysInput = { oneTimePreKeys };
      const response = await apiFetch('/api/e2ee/prekeys', {
        method: 'POST',
        body,
        token,
      });
      if (!response.success) {
        throw new Error(response.error?.message ?? 'Failed to upload one-time prekeys');
      }
    },
  };
}
