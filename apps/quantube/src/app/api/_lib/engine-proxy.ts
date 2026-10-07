// ============================================================================
// quantube — engine surface proxy helper (Layer 4 of the integration seam)
// ============================================================================
//
// Thin wrapper around `@quant/api-client`'s `proxyToBackend` (the canonical
// Layer-4 utility) used by the quantube `app/api/{feed,media,cross-publish,
// creator}/*` route handlers wired in Task 13.1. It pins the single source of
// truth for the quantube backend URL so each route handler stays one line.
//
// `proxyToBackend` already forwards the inbound `Authorization` bearer and
// propagates `x-request-id` (minting one when absent) for cross-seam
// correlation, so per-feature handlers only choose the backend path +
// (optional) body / query string.
//
// This module lives under `app/api/**`, so it is exempt from the inline-fetch
// guard (Requirement 1.4): backend fetches are allowed in proxy route handlers,
// never in UI surfaces. The `_lib` folder is underscore-prefixed and therefore
// ignored by Next.js App Router (it never becomes a route). It is intentionally
// separate from the legacy `./proxy.ts` helper so these new seams use the
// canonical `@quant/api-client` proxy.

import type { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client';

/**
 * The quantube backend origin. Defaults to the backend's `PORT` (3006, see
 * `apps/quantube/backend/app.ts` `getConfig()`), overridable via a single env
 * var so the proxy and backend share one source of truth (Requirement 1.6).
 */
export const QUANTUBE_BACKEND_URL =
  process.env.NEXT_PUBLIC_QUANTUBE_BACKEND_URL ?? 'http://localhost:3006';

interface EngineProxyOptions {
  /** Parsed request body to forward (mutations only). */
  body?: unknown;
  /** Query string to forward to the backend (GET filters / pagination). */
  searchParams?: URLSearchParams;
  /** HTTP verb override when it differs from the inbound request. */
  method?: string;
}

// `proxyToBackend` is typed against the `next` instance `@quant/api-client`
// resolves (React 19 peer). quantube pins React 18, so pnpm gives it a SEPARATE
// `next` instance whose `NextRequest`/`NextResponse` are structurally identical
// but nominally distinct. We keep this helper's public signature on quantube's
// OWN `NextRequest` (so route handlers pass their request directly) and bridge
// the known dual-package-instance artifact at the single call boundary below.
// The widened `Response` return is always a valid App Router route result.
type ProxyRequestArg = Parameters<typeof proxyToBackend>[0];

/**
 * Forward a quantube frontend request to the matching backend engine route,
 * propagating the bearer token + `x-request-id` and relaying status/body.
 */
export function proxyEngineRequest(
  request: NextRequest,
  path: string,
  options?: EngineProxyOptions,
): Promise<Response> {
  return proxyToBackend(request as unknown as ProxyRequestArg, {
    backendUrl: QUANTUBE_BACKEND_URL,
    path,
    method: options?.method,
    body: options?.body,
    searchParams: options?.searchParams,
  }) as unknown as Promise<Response>;
}
