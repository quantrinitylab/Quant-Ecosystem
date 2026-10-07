// ============================================================================
// quantchat — encryption (E2EE) surface proxy helper (Layer 4 of the seam)
// ============================================================================
//
// Thin wrapper around `@quant/api-client`'s `proxyToBackend` for the quantchat
// `app/api/e2ee/*` route handlers. It pins the single source of truth for the
// quantchat backend URL and forwards the inbound `Authorization` bearer +
// `x-request-id` (minting one when absent) to the backend `/e2ee/*` routes.
//
// SECURITY NOTE (Req 7.5): only CIPHERTEXT envelopes and PUBLIC key bundles ever
// transit these proxy routes. Key material (private keys, session/ratchet
// secrets) and plaintext are produced/consumed CLIENT-SIDE by the
// `@quant/encryption` engine (see `src/features/encryption/`) and are never sent
// through this proxy. This module lives under `app/api/**`, so it is exempt from
// the inline-fetch guard (Requirement 1.4); the `_lib` folder is
// underscore-prefixed and therefore never becomes a Next.js route.

import type { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client';

/**
 * The quantchat backend origin. Defaults to the backend's `PORT` (3002, see
 * `apps/quantchat/backend/app.ts` `getConfig()`), overridable via the single
 * env var shared with every other quantchat proxy (Requirement 1.6).
 */
export const QUANTCHAT_BACKEND_URL =
  process.env.QUANTCHAT_BACKEND_URL ??
  process.env.NEXT_PUBLIC_QUANTCHAT_BACKEND_URL ??
  'http://localhost:3002';

interface ProxyEncryptionOptions {
  /** Parsed request body to forward (mutations only) — ciphertext/public only. */
  body?: unknown;
  /** Query string to forward to the backend (e.g. inbox `limit`). */
  searchParams?: URLSearchParams;
}

/**
 * Forward a quantchat frontend request to the matching backend `/e2ee` route,
 * propagating the bearer token + `x-request-id` and relaying status/body.
 */
export function proxyEncryptionRequest(
  request: NextRequest,
  path: string,
  options?: ProxyEncryptionOptions,
) {
  return proxyToBackend(request, {
    backendUrl: QUANTCHAT_BACKEND_URL,
    path,
    body: options?.body,
    searchParams: options?.searchParams,
  });
}
