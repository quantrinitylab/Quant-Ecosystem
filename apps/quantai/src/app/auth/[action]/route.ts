import { NextRequest, NextResponse } from 'next/server';
import { buildForwardedCookieHeader } from '../../../lib/auth-cookie-filter';

// QuantAI auth entry. QuantAI does not issue tokens — the ecosystem identity
// root does (QuantMail backend, JWT issuer https://quantrinity.in). This handler
// proxies POST /auth/{login,register,refresh,logout} to that identity service,
// forwarding the browser's Origin and relaying the Set-Cookie the identity
// sets, so the session cookie lands on this app's origin.
//
// Cookie privacy: the identity backend only ever reads the refresh cookie
// (quantmail_refresh) — for rotation on /refresh and revocation on /logout.
// Login/register read no cookies at all. So this proxy NEVER forwards the raw
// browser Cookie header: JS-set QuantAI cookies (e.g. quant_access_token)
// must not leak into a cross-service request. Only quantmail_refresh is
// forwarded, and only for refresh/logout.
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

// Actions that legitimately need the browser's refresh cookie server-side.
const COOKIE_FORWARD_ACTIONS = new Set(['refresh', 'logout']);

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

  // Only quantmail_refresh may cross into the identity service, and only for
  // the actions that need it. login/register send no Cookie header at all.
  const forwardedCookie = COOKIE_FORWARD_ACTIONS.has(action)
    ? buildForwardedCookieHeader(request.headers.get('cookie'))
    : null;

  if (action === 'refresh' && !forwardedCookie) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NO_SESSION', message: 'No active session.', statusCode: 200 },
      },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  }

  try {
    const headers = new Headers();
    headers.set('content-type', request.headers.get('content-type') ?? 'application/json');
    const origin = request.headers.get('origin');
    if (origin) headers.set('origin', origin);
    if (forwardedCookie) headers.set('cookie', forwardedCookie);

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
