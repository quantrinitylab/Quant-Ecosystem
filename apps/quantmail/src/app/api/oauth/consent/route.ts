import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Next.js proxy for backend POST /oauth/consent.
//
// JUSTIFIED DEVIATION from proxyToBackend (apps/quantmail/src/app/api/_lib/proxy.ts):
// this endpoint is redirect-based. The backend answers 302
// (Location: <redirect_uri>?code=<ac_code> on approve, or ?error=access_denied on
// deny). proxyToBackend unconditionally calls `await res.json()`, so a 302 would
// throw and be turned into 502 { code: 'INVALID_RESPONSE' }, and the Location
// header would never reach the browser — breaking the consent flow entirely. This
// route follows the helper's conventions (forwarded headers, JSON body, base URL,
// no-store, BACKEND_UNAVAILABLE shape) but passes 3xx responses (status +
// Location + Set-Cookie) through verbatim.

export async function POST(request: NextRequest) {
  const base = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';
  const url = new URL('/oauth/consent', base);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Spec: protected endpoint, Bearer required
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;
  // Forward Origin for trusted-origin validation
  const originHeader = request.headers.get('Origin');
  if (originHeader) headers['Origin'] = originHeader;
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) headers['Cookie'] = cookieHeader;

  // Forward JSON body: action* (approve|deny), client_id*, redirect_uri*, user_id
  // (must match Bearer user), scope, state, code_challenge, code_challenge_method, nonce
  const fetchOptions: RequestInit = { method: 'POST', headers };
  try {
    const body = await request.json();
    fetchOptions.body = JSON.stringify(body);
  } catch {
    /* no body — backend will answer 400 invalid_request */
  }

  let res: Response;
  try {
    // redirect: 'manual' so the backend's 302 reaches the proxy intact instead of
    // being followed server-side (the Location must reach the browser).
    res = await fetch(url.toString(), {
      ...fetchOptions,
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BACKEND_UNAVAILABLE',
          message: 'The requested service is temporarily unavailable.',
          statusCode: 502,
        },
      },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }

  // 3xx: pass status + Location (+ Set-Cookie) through to the browser
  if (res.status >= 300 && res.status < 400) {
    const redirectResponse = new NextResponse(null, {
      status: res.status,
      headers: { 'cache-control': 'no-store' },
    });
    const location = res.headers.get('location');
    if (location) redirectResponse.headers.set('Location', location);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) redirectResponse.headers.set('Set-Cookie', setCookie);
    return redirectResponse;
  }

  // JSON responses (400 invalid_request, 401 unauthorized, 403 user_id mismatch):
  // same passthrough as the helper
  const data = await res.json();
  const jsonResponse = NextResponse.json(data, {
    status: res.status,
    headers: { 'cache-control': 'no-store' },
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) jsonResponse.headers.set('Set-Cookie', setCookie);
  return jsonResponse;
}
