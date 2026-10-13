import { NextRequest, NextResponse } from 'next/server';

export async function proxyToBackend(
  request: NextRequest,
  backendPath: string,
  options?: {
    method?: string;
    body?: unknown;
    /**
     * fix/qm-api-roundtrip-latency: short-lived `Cache-Control` applied to
     * honest backend 404s (e.g. public booking-slug lookups that 404: one
     * indexed findUnique, but every miss pays the full ~1.2s proxy chain).
     * Only applied when the backend did not set its own Cache-Control —
     * never on 2xx/4xx-with-meaning, never on auth endpoints. The 404 body is
     * stable for the TTL window (a slug that 404s now cannot resolve before
     * it expires), so repeat hits — same browser, bots, link checkers — skip
     * the chain via the browser HTTP cache.
     */
    notFoundCacheControl?: string;
  },
  backendUrl?: string,
) {
  const base = backendUrl || process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';
  const method = options?.method || request.method;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;
  // Forward Origin header for auth routes that require trusted origin validation
  const originHeader = request.headers.get('Origin');
  if (originHeader) headers['Origin'] = originHeader;
  // Forward cookies for refresh token
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) headers['Cookie'] = cookieHeader;

  const url = new URL(backendPath, base);
  // Forward search params for GET requests
  if (method === 'GET') {
    request.nextUrl.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }

  const fetchOptions: RequestInit = { method, headers };
  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  } else if (method !== 'GET' && method !== 'HEAD') {
    try {
      const body = await request.json();
      fetchOptions.body = JSON.stringify(body);
    } catch {
      /* no body */
    }
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), { ...fetchOptions, cache: 'no-store' });
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

  try {
    const data = await res.json();
    // fix/qm-api-roundtrip-latency: the backend is authoritative on freshness.
    // An explicit backend Cache-Control is forwarded untouched; otherwise the
    // historic no-store default holds — except honest 404s on call sites that
    // opted into `notFoundCacheControl`.
    const backendCacheControl = res.headers.get('cache-control');
    const cacheControl =
      backendCacheControl ??
      (res.status === 404 && options?.notFoundCacheControl
        ? options.notFoundCacheControl
        : 'no-store');
    const response = NextResponse.json(data, {
      status: res.status,
      headers: { 'cache-control': cacheControl },
    });
    // Forward Set-Cookie headers from backend (for auth refresh tokens)
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      response.headers.set('Set-Cookie', setCookie);
    }
    return response;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'Backend returned non-JSON response',
          statusCode: 502,
        },
      },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }
}
