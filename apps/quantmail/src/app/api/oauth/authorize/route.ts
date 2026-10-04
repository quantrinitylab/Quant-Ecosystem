import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Next.js proxy for backend GET /oauth/authorize.
//
// JUSTIFIED DEVIATION from proxyToBackend (apps/quantmail/src/app/api/_lib/proxy.ts):
// this endpoint is redirect-based. The backend answers 302
// (Location: <redirect_uri>?code=<ac_code> or ?error=...) when consent already exists,
// or 200 with an HTML consent screen otherwise. proxyToBackend unconditionally calls
// `await res.json()`, so a 302 or an HTML body would throw and be turned into
// 502 { code: 'INVALID_RESPONSE' }, and the Location header would never reach the
// browser — breaking the OAuth flow entirely. This route follows the helper's
// conventions (forwarded headers, base URL, no-store, BACKEND_UNAVAILABLE shape)
// but passes 3xx responses (status + Location + Set-Cookie) and non-JSON bodies
// (the HTML consent screen) through verbatim.

export async function GET(request: NextRequest) {
  const base = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';
  const url = new URL('/oauth/authorize', base);
  // Forward query params (response_type, client_id, redirect_uri, scope, state,
  // code_challenge, code_challenge_method, nonce)
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const headers: Record<string, string> = {};
  // Spec: "Requires Authorization: Bearer <access_token> (cookie is NOT enough)"
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;
  // Forward Origin for trusted-origin validation
  const originHeader = request.headers.get('Origin');
  if (originHeader) headers['Origin'] = originHeader;
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) headers['Cookie'] = cookieHeader;

  let res: Response;
  try {
    // redirect: 'manual' so the backend's 302 reaches us intact instead of being
    // followed by the server-side fetch (the Location must reach the browser).
    res = await fetch(url.toString(), {
      method: 'GET',
      headers,
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

  const contentType = res.headers.get('content-type') || '';
  // Non-JSON body (e.g. 200 HTML consent screen): pass through verbatim with the
  // backend's content-type preserved
  if (!contentType.includes('application/json')) {
    const body = await res.text();
    const htmlResponse = new NextResponse(body, {
      status: res.status,
      headers: { 'cache-control': 'no-store', 'content-type': contentType },
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) htmlResponse.headers.set('Set-Cookie', setCookie);
    return htmlResponse;
  }

  // JSON responses (400 invalid_request, 401 missing/invalid Bearer): pass through
  const data = await res.json();
  const jsonResponse = NextResponse.json(data, {
    status: res.status,
    headers: { 'cache-control': 'no-store' },
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) jsonResponse.headers.set('Set-Cookie', setCookie);
  return jsonResponse;
}
