import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AUTH_ACTIONS = new Set(['login', 'register', 'refresh', 'logout']);
const AUTH_BACKEND_URL = process.env['QUANTMAIL_BACKEND_URL'] ?? 'http://localhost:3010';

const errorResponse = (statusCode: number, code: string, message: string) =>
  NextResponse.json(
    { success: false, error: { code, message, statusCode } },
    { status: statusCode, headers: { 'cache-control': 'no-store' } },
  );

const copyBackendHeaders = (backendHeaders: Headers): Headers => {
  const headers = new Headers({ 'cache-control': 'no-store' });
  for (const name of ['content-type', 'retry-after', 'x-request-id']) {
    const value = backendHeaders.get(name);
    if (value) headers.set(name, value);
  }

  const headersWithCookies = backendHeaders as Headers & { getSetCookie?: () => string[] };
  const setCookies = headersWithCookies.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) headers.append('set-cookie', cookie);
  } else {
    const setCookie = backendHeaders.get('set-cookie');
    if (setCookie) headers.set('set-cookie', setCookie);
  }

  return headers;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  if (!AUTH_ACTIONS.has(action)) {
    return errorResponse(404, 'AUTH_ACTION_NOT_FOUND', 'Authentication action not found.');
  }

  try {
    const headers = new Headers();
    headers.set('content-type', request.headers.get('content-type') ?? 'application/json');

    const origin = request.headers.get('origin');
    if (origin) headers.set('origin', origin);

    const cookie = request.headers.get('cookie');
    if (cookie) headers.set('cookie', cookie);

    const body = await request.text();
    const backendResponse = await fetch(new URL(`/auth/${action}`, AUTH_BACKEND_URL), {
      method: 'POST',
      headers,
      body: body.length > 0 ? body : undefined,
      cache: 'no-store',
      redirect: 'manual',
    });

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: copyBackendHeaders(backendResponse.headers),
    });
  } catch {
    return errorResponse(
      502,
      'AUTH_BACKEND_UNAVAILABLE',
      'The authentication service is temporarily unavailable.',
    );
  }
}
