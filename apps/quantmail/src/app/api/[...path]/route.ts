import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';
import { ALLOWED_BACKEND_ROUTES } from '../../../../backend/lib/routes-config';

export const dynamic = 'force-dynamic';

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
      { status: 404, headers: { 'cache-control': 'no-store' } },
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
