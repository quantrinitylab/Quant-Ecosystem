import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';
import { ALLOWED_BACKEND_ROUTES } from '../../../../backend/lib/routes-config';

export const dynamic = 'force-dynamic';

/**
 * fix/qm-api-roundtrip-latency: public, unauthenticated read paths whose
 * honest 404s are stable — a booking slug that 404s now cannot resolve before
 * the TTL expires. Their misses get a short-lived cache so repeat hits (same
 * browser, bots, link checkers) skip the full ~1.2s proxy chain. Slot
 * availability itself (2xx) stays no-store: locks and bookings change it by
 * the second. Auth and mutation routes are never listed here.
 */
const NOT_FOUND_CACHE_PATHS: RegExp[] = [
  /^calendar\/booking\/[^/]+$/,
  /^calendar\/booking\/[^/]+\/slots$/,
  /^booking\/links\/[^/]+$/,
  /^booking\/links\/[^/]+\/slots$/,
];
const NOT_FOUND_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=60';

const handle = async (
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) => {
  const { path } = await params;
  const decodedPath = path.join('/');
  const route = ALLOWED_BACKEND_ROUTES.find(({ pattern }) => pattern.test(decodedPath));
  if (!route) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'API_ROUTE_NOT_FOUND', message: 'API route not found.', statusCode: 404 },
      },
      // fix/qm-api-roundtrip-latency: the allow-list is deployment-stable, so
      // an unknown API path 404s identically for a minute — let the browser
      // cache the miss instead of paying the chain on every retry.
      { status: 404, headers: { 'cache-control': 'public, max-age=60' } },
    );
  }
  if (!route.methods.includes(request.method)) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.', statusCode: 405 },
      },
      {
        status: 405,
        headers: { 'cache-control': 'no-store', allow: route.methods.join(', ') },
      },
    );
  }

  const backendPath = `/${path.map((segment) => encodeURIComponent(segment)).join('/')}`;
  const cacheNotFound =
    request.method === 'GET' && NOT_FOUND_CACHE_PATHS.some((pattern) => pattern.test(decodedPath))
      ? NOT_FOUND_CACHE_CONTROL
      : undefined;
  return proxyToBackend(
    request,
    backendPath,
    cacheNotFound ? { notFoundCacheControl: cacheNotFound } : undefined,
  );
};

// One handler, one export per method. The App Router 405s a method that has no
// export, *before* the allow-list above is consulted — so a `methods: ['PATCH']`
// entry without a `PATCH` export is a route that advertises itself and cannot be
// called. That is what shipped: `workspaces/:id`, its member rows, `threads`,
// `emails` and `labels` all listed PATCH while the Save button behind
// `updateWorkspace()` could only ever get a 405 back.
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
