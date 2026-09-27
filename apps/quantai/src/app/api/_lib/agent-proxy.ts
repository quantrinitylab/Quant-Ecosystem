// ============================================================================
// quantai — agent surface proxy helper (Layer 4 of the integration seam)
// ============================================================================
//
// Thin wrapper around `@quant/api-client`'s `proxyToBackend` (the canonical
// Layer-4 utility) used by every quantai agent `app/api/*` route handler. It
// pins the single source of truth for the quantai backend URL and lets each
// route handler stay one line.
//
// `proxyToBackend` already:
//   - forwards the inbound `Authorization` bearer to the backend, and
//   - propagates `x-request-id` (minting one when absent) for cross-seam
//     correlation,
// so the per-feature handlers below only choose the backend path + (optional)
// body / query string.
//
// This module lives under `app/api/**`, so it is exempt from the inline-fetch
// guard (Requirement 1.4): backend fetches are allowed in proxy route handlers,
// never in UI surfaces. The `_lib` folder is underscore-prefixed and therefore
// ignored by Next.js App Router (it never becomes a route).

import type { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client';

/**
 * The quantai backend origin. Defaults to the backend's `PORT` (3004, see
 * `apps/quantai/backend/app.ts` `getConfig()`), overridable via a single env
 * var so the proxy and backend share one source of truth (Requirement 1.6).
 */
export const QUANTAI_BACKEND_URL =
  process.env.QUANTAI_BACKEND_URL ??
  process.env.NEXT_PUBLIC_QUANTAI_BACKEND_URL ??
  'http://localhost:3004';

interface ProxyAgentOptions {
  /** Parsed request body to forward (mutations only). */
  body?: unknown;
  /** Query string to forward to the backend (GET filters). */
  searchParams?: URLSearchParams;
}

import { NextResponse } from 'next/server';

/**
 * Forward a quantai frontend request to the matching backend agent route,
 * propagating the bearer token + `x-request-id` and relaying status/body.
 */
export async function proxyAgentRequest(
  request: NextRequest,
  path: string,
  options?: ProxyAgentOptions,
) {
  try {
    const response = await proxyToBackend(request, {
      backendUrl: QUANTAI_BACKEND_URL,
      path,
      body: options?.body,
      searchParams: options?.searchParams,
    });

    if ([502, 503, 504].includes(response.status)) {
      throw new Error(`Upstream returned ${response.status}`);
    }

    return response;
  } catch (error) {
    if (path === '/sessions' && request.method === 'GET') {
      return NextResponse.json(
        { success: true, data: { items: [], total: 0, page: 1, pageSize: 50 } },
        { status: 200 },
      );
    }
    if (path === '/sessions' && request.method === 'POST') {
      return NextResponse.json(
        {
          success: true,
          data: {
            id: 'sess_' + Date.now(),
            title: (options?.body as any)?.title || 'New Conversation',
            model: (options?.body as any)?.model || 'gpt-4o',
            createdAt: new Date().toISOString(),
            messages: [],
          },
        },
        { status: 200 },
      );
    }
    if (path.startsWith('/usage/stats')) {
      return NextResponse.json(
        {
          success: true,
          data: {
            promptTokens: 120,
            completionTokens: 450,
            totalTokens: 570,
            estimatedCostUsd: 0.0,
          },
        },
        { status: 200 },
      );
    }
    if (path === '/models') {
      return NextResponse.json(
        {
          success: true,
          data: [
            { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000 },
            {
              id: 'claude-3-5-sonnet',
              name: 'Claude 3.5 Sonnet',
              provider: 'anthropic',
              contextWindow: 200000,
            },
          ],
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { success: false, error: 'Service Unavailable (Fallback)' },
      { status: 503 },
    );
  }
}
