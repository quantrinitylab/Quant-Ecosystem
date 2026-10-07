// ============================================================================
// quantchat — federation api-client hooks (Layer 5)
// ============================================================================
//
// The ONLY sanctioned call path from a quantchat UI surface to the federation
// engine: typed react-query hooks over the same-origin Next proxy paths under
// `/api/federation/*` (never inline fetch — Requirement 1.4). The proxy forwards
// the bearer + x-request-id to the backend (Layer 4), which reaches the
// decorated, SCOPED `@quant/federation` engine (Layer 2/3, Req 7.4).
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type {
  CreateFederationKeyInput,
  CreateFederationKeyResponse,
  FederationInstanceInput,
  FederationInstanceMutationResponse,
  FederationInstanceStatus,
  ListFederationKeysResponse,
  RevokeFederationKeyResponse,
} from './types';

/** GET /api/federation/instances/:domain — federation status of a remote host. */
export function useFederationInstance(domain: string | undefined, options?: UseApiQueryOptions) {
  return useApiQuery<FederationInstanceStatus>(
    `/api/federation/instances/${domain ? encodeURIComponent(domain) : ''}`,
    {
      ...options,
      enabled: (options?.enabled ?? true) && Boolean(domain),
    },
  );
}

/** POST /api/federation/instances/block — block a remote instance. */
export function useBlockInstance() {
  return useApiMutation<FederationInstanceInput, FederationInstanceMutationResponse>(
    '/api/federation/instances/block',
  );
}

/** DELETE /api/federation/instances/block/:domain — unblock a remote instance. */
export function useUnblockInstance() {
  return useApiMutation<string, FederationInstanceMutationResponse>(
    '/api/federation/instances/block',
    {
      method: 'DELETE',
      path: (domain) => `/api/federation/instances/block/${encodeURIComponent(domain)}`,
    },
  );
}

/** POST /api/federation/instances/allow — add a remote instance to the allowlist. */
export function useAllowInstance() {
  return useApiMutation<FederationInstanceInput, FederationInstanceMutationResponse>(
    '/api/federation/instances/allow',
  );
}

/** GET /api/federation/keys — list the current user's federation API keys. */
export function useFederationKeys(options?: UseApiQueryOptions) {
  return useApiQuery<ListFederationKeysResponse>('/api/federation/keys', options);
}

/** POST /api/federation/keys — mint a scoped federation API key. */
export function useCreateFederationKey() {
  return useApiMutation<CreateFederationKeyInput, CreateFederationKeyResponse>(
    '/api/federation/keys',
  );
}

/** DELETE /api/federation/keys/:id — revoke an API key the caller owns. */
export function useRevokeFederationKey() {
  return useApiMutation<string, RevokeFederationKeyResponse>('/api/federation/keys', {
    method: 'DELETE',
    path: (id) => `/api/federation/keys/${encodeURIComponent(id)}`,
  });
}
