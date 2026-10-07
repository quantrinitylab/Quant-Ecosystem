// ============================================================================
// quantchat — encrypted-search surface proxy helper (Layer 4 of the seam, W5)
// ============================================================================
//
// Thin wrapper around `@quant/api-client`'s `proxyToBackend` for the quantchat
// `app/api/search*` route handlers. It pins the single source of truth for the
// quantchat backend URL (shared with the e2ee proxy) and forwards the inbound
// `Authorization` bearer + `x-request-id` (minting one when absent) to the
// backend `/search` and `/search/index` routes.
//
// SECURITY NOTE (Req 14.2, 15.6, 16.1): only OPAQUE HMAC token hashes (+ message
// / conversation ids) ever transit these proxy routes. The Search_Key, message
// plaintext, and tokens are produced/consumed CLIENT-SIDE by
// `src/features/encryption/searchClient.ts` and are never sent through this
// proxy. This module lives under `app/api/**`, so it is exempt from the
// inline-fetch guard (Requirement 1.4); the `_lib` folder is underscore-prefixed
// and therefore never becomes a Next.js route.

import type { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client';
import { QUANTCHAT_BACKEND_URL } from './encryption-proxy';

interface ProxySearchOptions {
  /** Parsed request body to forward (token hashes / query string only). */
  body?: unknown;
  /** Query string to forward to the backend. */
  searchParams?: URLSearchParams;
}

/**
 * Forward a quantchat frontend request to the matching backend `/search` route,
 * propagating the bearer token + `x-request-id` and relaying status/body.
 */
export function proxySearchRequest(
  request: NextRequest,
  path: string,
  options?: ProxySearchOptions,
) {
  return proxyToBackend(request, {
    backendUrl: QUANTCHAT_BACKEND_URL,
    path,
    body: options?.body,
    searchParams: options?.searchParams,
  });
}
