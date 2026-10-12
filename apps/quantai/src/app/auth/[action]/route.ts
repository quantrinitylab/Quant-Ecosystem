import { NextRequest, NextResponse } from 'next/server';

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

// The refresh cookie the identity service issues. A missing cookie on /refresh is
// an expected unauthenticated state, not an error.
const REFRESH_COOKIE = 'quantmail_refresh';

// Actions that legitimately need the browser's refresh cookie server-side.
const COOKIE_FORWARD_ACTIONS = new Set(['refresh', 'logout']);

/**
 * Parse a Cookie header and return a new header value containing ONLY the
 * identity refresh cookie. Returns null when the refresh cookie is absent or
 * has no usable value, so callers can omit the Cookie header entirely.
 *
 * Deliberately strict: malformed pairs (no '='), empty values, and
 * case-variant lookalikes (quantmail_Refresh) are dropped rather than guessed.
 */
export const buildForwardedCookieHeader = (
  cookieHeader: string | null,
): string | null => {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name === REFRESH_COOKIE && value.length > 0) {
      return `${REFRESH_COOKIE}=${value}`;
    }
  }
  return null;
};

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
      console.warn(`[auth-proxy] action=${action} backend returned non-JSON response`);
      return errorResponse(
        502,
        'AUTH_BACKEND_INVALID_RESPONSE',
        'The authentication service returned an invalid response.',
      );
    }

    if (backendResponse.status >= 500) {
      console.warn(
        `[auth-proxy] action=${action} backend error status=${backendResponse.status}`,
      );
    }

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: copyBackendHeaders(backendResponse.headers),
    });
  } catch {
    console.warn(`[auth-proxy] action=${action} identity service unreachable`);
    return errorResponse(
      502,
      'AUTH_BACKEND_UNAVAILABLE',
      'The authentication service is temporarily unavailable.',
    );
  }
}
