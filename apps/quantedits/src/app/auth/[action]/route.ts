import { NextRequest, NextResponse } from 'next/server';

// QuantCooks auth entry. QuantCooks does not issue tokens — the ecosystem identity
// root does (QuantMail backend, JWT issuer https://quantrinity.in). This handler
// proxies POST /auth/{login,register,refresh,logout} to that identity service,
// forwarding the browser's Origin + Cookie and relaying the Set-Cookie the
// identity sets, so the session cookie lands on this app's origin.
//
// QUANT_IDENTITY_URL is the single source of truth for where auth lives; it
// falls back to the in-cluster identity service and then to local dev.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AUTH_ACTIONS = new Set(['login', 'register', 'refresh', 'logout']);
const IDENTITY_URL =
  process.env['QUANT_IDENTITY_URL'] ??
  process.env['QUANTMAIL_BACKEND_URL'] ??
  'http://quant-quantmail-backend:3011';

// The refresh cookie the identity service issues. A missing cookie on /refresh is
// an expected unauthenticated state, not an error.
const REFRESH_COOKIE = 'quantmail_refresh';

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

  const withCookies = backendHeaders as Headers & { getSetCookie?: () => string[] };
  const setCookies = withCookies.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) headers.append('set-cookie', cookie);
  } else {
    const single = backendHeaders.get('set-cookie');
    if (single) headers.set('set-cookie', single);
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

  if (action === 'refresh') {
    const cookie = request.headers.get('cookie') ?? '';
    if (!cookie.includes(`${REFRESH_COOKIE}=`)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NO_SESSION', message: 'No active session.', statusCode: 200 },
        },
        { status: 200, headers: { 'cache-control': 'no-store' } },
      );
    }
  }

  try {
    const headers = new Headers();
    headers.set('content-type', request.headers.get('content-type') ?? 'application/json');
    const origin = request.headers.get('origin');
    if (origin) headers.set('origin', origin);
    const cookie = request.headers.get('cookie');
    if (cookie) headers.set('cookie', cookie);

    const body = await request.text();
    const backendResponse = await fetch(new URL(`/auth/${action}`, IDENTITY_URL), {
      method: 'POST',
      headers,
      body: body.length > 0 ? body : undefined,
      cache: 'no-store',
      redirect: 'manual',
    });

    const contentType = backendResponse.headers.get('content-type')?.toLowerCase() ?? '';
    const isJson = contentType.includes('application/json') || contentType.includes('+json');
    if (!isJson) {
      await backendResponse.body?.cancel();
      return errorResponse(
        502,
        'AUTH_BACKEND_INVALID_RESPONSE',
        'The authentication service returned an invalid response.',
      );
    }

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
