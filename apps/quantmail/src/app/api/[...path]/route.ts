import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';
import { ALLOWED_BACKEND_ROUTES, matchRoute } from '../../../../backend/lib/routes-config';

export const dynamic = 'force-dynamic';

const handle = async (
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) => {
  const { path } = await params;
  const decodedPath = path.join('/');
  const match = matchRoute(decodedPath, request.method);

  if (!match.matched) {
    console.warn(`[API Proxy] Deny by default: no route matched for path "${decodedPath}"`);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'API_ROUTE_NOT_FOUND', message: 'API route not found.', statusCode: 404 },
      },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    );
  }

  if (!match.allowedMethods.includes(request.method)) {
    console.warn(
      `[API Proxy] Method ${request.method} not allowed for path "${decodedPath}". Allowed: ${match.allowedMethods.join(', ')}`,
    );
    return NextResponse.json(
      {
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.', statusCode: 405 },
      },
      {
        status: 405,
        headers: { 'cache-control': 'no-store', allow: match.allowedMethods.join(', ') },
      },
    );
  }

  const backendPath = `/${path.map((segment) => encodeURIComponent(segment)).join('/')}`;
  return proxyToBackend(request, backendPath);
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
