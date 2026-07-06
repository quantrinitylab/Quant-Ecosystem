// ============================================================================
// quantchat — ar-lenses surface proxy helper (Layer 4 of the integration seam)
// ============================================================================
//
// Thin wrapper around `@quant/api-client`'s `proxyToBackend` (the canonical
// Layer-4 utility) used by every quantchat ar-lenses `app/api/ar-lenses/*` route
// handler wired in Task 14.2. It pins the single source of truth for the
// quantchat backend URL so each route handler stays one line.
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
//
// NOTE: this is the ar-lenses-specific app config (per the SHARED DECORATOR
// resolution of design.md Open Question 2). The reusable seam logic lives in
// the backend (`backend/routes/ar-lenses.ts`, mirrored from quantneon); only the
// backend URL/port below is app-specific.

import type { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client';

/**
 * The quantchat backend origin. Defaults to the backend's `PORT` (3002, see
 * `apps/quantchat/backend/app.ts` `getConfig()`), overridable via a single env
 * var so the proxy and backend share one source of truth (Requirement 1.6).
 */
export const QUANTCHAT_BACKEND_URL =
  process.env.QUANTCHAT_BACKEND_URL ??
  process.env.NEXT_PUBLIC_QUANTCHAT_BACKEND_URL ??
  'http://localhost:3002';

interface ProxyArLensesOptions {
  /** Parsed request body to forward (mutations only). */
  body?: unknown;
  /** Query string to forward to the backend (GET filters). */
  searchParams?: URLSearchParams;
  /** HTTP verb override when it differs from the inbound request. */
  method?: string;
}

/**
 * Forward a quantchat frontend request to the matching backend ar-lenses route,
 * propagating the bearer token + `x-request-id` and relaying status/body.
 */
export function proxyArLensesRequest(
  request: NextRequest,
  path: string,
  options?: ProxyArLensesOptions,
) {
  return proxyToBackend(request, {
    backendUrl: QUANTCHAT_BACKEND_URL,
    path,
    method: options?.method,
    body: options?.body,
    searchParams: options?.searchParams,
  });
}
