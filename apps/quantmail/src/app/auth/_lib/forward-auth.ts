import { NextRequest, NextResponse } from 'next/server';

const AUTH_BACKEND_URL = process.env['QUANTMAIL_BACKEND_URL'] ?? 'http://localhost:3010';
const REFRESH_COOKIE_NAME = 'quantmail_refresh';

export const authErrorResponse = (statusCode: number, code: string, message: string) =>
  NextResponse.json(
    { success: false, error: { code, message, statusCode } },
    { status: statusCode, headers: { 'cache-control': 'no-store' } },
  );

/** Forward only the refresh credential; unrelated application cookies stay local. */
const refreshCookieFrom = (cookieHeader: string | null): string | null => {
  if (!cookieHeader) return null;
  const prefix = `${REFRESH_COOKIE_NAME}=`;
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ?? null;
};

/** Copy the small response contract the browser needs, including only our cookie. */
const copyBackendHeaders = (backendHeaders: Headers): Headers => {
  const headers = new Headers({ 'cache-control': 'no-store' });
  for (const name of ['content-type', 'retry-after', 'x-request-id']) {
    const value = backendHeaders.get(name);
    if (value) headers.set(name, value);
  }

  const headersWithCookies = backendHeaders as Headers & { getSetCookie?: () => string[] };
  const candidates =
    headersWithCookies.getSetCookie?.() ??
    (backendHeaders.get('set-cookie') ? [backendHeaders.get('set-cookie')!] : []);
  for (const cookie of candidates) {
    if (cookie.trimStart().startsWith(`${REFRESH_COOKIE_NAME}=`)) {
      headers.append('set-cookie', cookie);
    }
  }
  return headers;
};

/**
 * Forward one fixed auth POST to the server-only backend URL.
 *
 * Callers supply a literal path; there is no user-controlled catch-all. The
 * backend still enforces exact Origin membership. Non-JSON upstream responses
 * are refused so an HTML crash page never masquerades as bad credentials.
 */
export async function forwardAuthRequest(
  request: NextRequest,
  backendPath: string,
): Promise<Response> {
  try {
    const headers = new Headers();
    headers.set('content-type', request.headers.get('content-type') ?? 'application/json');

    const origin = request.headers.get('origin');
    if (origin) headers.set('origin', origin);

    const refreshCookie = refreshCookieFrom(request.headers.get('cookie'));
    if (refreshCookie) headers.set('cookie', refreshCookie);

    const body = await request.text();
    const backendResponse = await fetch(new URL(backendPath, AUTH_BACKEND_URL), {
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
      return authErrorResponse(
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
    return authErrorResponse(
      502,
      'AUTH_BACKEND_UNAVAILABLE',
      'The authentication service is temporarily unavailable.',
    );
  }
}
