import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Next.js proxy for backend GET /contacts/export/vcard.
//
// JUSTIFIED DEVIATION from proxyToBackend (apps/quantmail/src/app/api/_lib/proxy.ts):
// the backend answers with `text/vcard` (verified: backend/routes/contacts.ts
// line 221 — `reply.type('text/vcard').send(vcard)`), not JSON. proxyToBackend
// unconditionally calls `await res.json()`, so the vCard body would throw and be
// turned into 502 { code: 'INVALID_RESPONSE' } — every export would fail.
// This route follows the helper's conventions (forwarded headers, base URL,
// no-store, BACKEND_UNAVAILABLE shape) but passes the text body through
// verbatim with the backend's content-type preserved. Modeled on the
// staged `get-oauth-authorize/route.ts` fetch pattern.

export async function GET(request: NextRequest) {
  const base = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';
  const url = new URL('/contacts/export/vcard', base);

  const headers: Record<string, string> = {};
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;
  // Forward Origin for trusted-origin validation
  const originHeader = request.headers.get('Origin');
  if (originHeader) headers['Origin'] = originHeader;
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) headers['Cookie'] = cookieHeader;

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      headers,
      cache: 'no-store',
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

  // Non-JSON body (the vCard export): pass through verbatim with the backend's
  // content-type preserved
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const body = await res.text();
    const passthrough = new NextResponse(body, {
      status: res.status,
      headers: { 'cache-control': 'no-store', 'content-type': contentType },
    });
    const contentDisposition = res.headers.get('content-disposition');
    if (contentDisposition) passthrough.headers.set('Content-Disposition', contentDisposition);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) passthrough.headers.set('Set-Cookie', setCookie);
    return passthrough;
  }

  // JSON responses (400, 401, etc.): pass through
  const data = await res.json();
  const jsonResponse = NextResponse.json(data, {
    status: res.status,
    headers: { 'cache-control': 'no-store' },
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) jsonResponse.headers.set('Set-Cookie', setCookie);
  return jsonResponse;
}
