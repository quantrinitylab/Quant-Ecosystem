// ============================================================================
// quantneon — feed surface proxy helper (Layer 4 of the integration seam)
// ============================================================================
//
// Thin wrapper around `@quant/api-client`'s `proxyToBackend` (the canonical
// Layer-4 utility) used by every quantneon feed `app/api/feed/*` route handler.
// It pins the single source of truth for the quantneon backend URL so each
// route handler stays one line.
//
// `proxyToBackend` already forwards the inbound `Authorization` bearer and
// propagates `x-request-id` (minting one when absent) for cross-seam
// correlation, so per-feature handlers only choose the backend path +
// (optional) body / query string.
//
// This module lives under `app/api/**`, so it is exempt from the inline-fetch
// guard (Requirement 1.4): backend fetches are allowed in proxy route handlers,
// never in UI surfaces. The `_lib` folder is underscore-prefixed and therefore
// ignored by Next.js App Router (it never becomes a route).

import type { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client';

/**
 * The quantneon backend origin. Defaults to the backend's `PORT` (3012, see
 * `apps/quantneon/backend/app.ts` `getConfig()`), overridable via a single env
 * var so the proxy and backend share one source of truth (Requirement 1.6).
 */
export const QUANTNEON_BACKEND_URL =
  process.env.NEXT_PUBLIC_QUANTNEON_BACKEND_URL ?? 'http://localhost:3012';

interface ProxyFeedOptions {
  /** Parsed request body to forward (mutations only). */
  body?: unknown;
  /** Query string to forward to the backend (GET filters / pagination). */
  searchParams?: URLSearchParams;
  /** HTTP verb override when it differs from the inbound request. */
  method?: string;
}

/**
 * Forward a quantneon frontend request to the matching backend feed route,
 * propagating the bearer token + `x-request-id` and relaying status/body.
 */
export function proxyFeedRequest(request: NextRequest, path: string, options?: ProxyFeedOptions) {
  return proxyToBackend(request, {
    backendUrl: QUANTNEON_BACKEND_URL,
    path,
    method: options?.method,
    body: options?.body,
    searchParams: options?.searchParams,
  });
}
