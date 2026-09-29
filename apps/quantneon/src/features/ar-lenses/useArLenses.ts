// ============================================================================
// quantneon — ar-lenses api-client hooks (Layer 5)
// ============================================================================
//
// The ONLY sanctioned call path from a quantneon UI surface to the ar-lenses
// engine: typed react-query hooks over the same-origin Next proxy paths under
// `/api/ar-lenses/*` (never inline fetch — Requirement 1.4). The proxy forwards
// the bearer + x-request-id to the backend (Layer 4), which reaches the
// decorated `@quant/ar-lenses` engine (Layer 2/3).
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type {
  ArCapabilitiesResponse,
  ArCrossAppTarget,
  GenerateLensInput,
  GenerateLensResponse,
  GrantConsentInput,
  GrantConsentResponse,
  ListConsentResponse,
  RevokeConsentResponse,
} from './types';

/** GET /api/ar-lenses/capabilities?target= — per-app AR capability matrix. */
export function useArCapabilities(
  target: ArCrossAppTarget | undefined,
  options?: UseApiQueryOptions,
) {
  return useApiQuery<ArCapabilitiesResponse>('/api/ar-lenses/capabilities', {
    ...options,
    params: target ? { target } : undefined,
    enabled: (options?.enabled ?? true) && Boolean(target),
  });
}

/** POST /api/ar-lenses/lenses/generate — author a try-on lens from a prompt. */
export function useGenerateLens() {
  return useApiMutation<GenerateLensInput, GenerateLensResponse>('/api/ar-lenses/lenses/generate');
}

/** GET /api/ar-lenses/consent — list the current user's active AR consents. */
export function useArConsents(options?: UseApiQueryOptions) {
  return useApiQuery<ListConsentResponse>('/api/ar-lenses/consent', options);
}

/** POST /api/ar-lenses/consent — grant AR face-tracking consent. */
export function useGrantArConsent() {
  return useApiMutation<GrantConsentInput, GrantConsentResponse>('/api/ar-lenses/consent');
}

/** DELETE /api/ar-lenses/consent/:id — revoke a previously granted consent. */
export function useRevokeArConsent() {
  return useApiMutation<string, RevokeConsentResponse>('/api/ar-lenses/consent', {
    method: 'DELETE',
    path: (id) => `/api/ar-lenses/consent/${encodeURIComponent(id)}`,
  });
}
