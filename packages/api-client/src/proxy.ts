// ============================================================================
// @quant/api-client - Shared Proxy Utility for Next.js API Routes
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export interface ProxyOptions {
  backendUrl: string;
  path: string;
  method?: string;
  body?: unknown;
  searchParams?: URLSearchParams;
  timeout?: number;
}

/**
 * Proxies a Next.js API route request to a backend service with proper error
 * handling, timeout support, content-type validation, and conditional auth.
 */
export async function proxyToBackend(
  request: NextRequest,
  options: ProxyOptions,
): Promise<NextResponse> {
  const { backendUrl, path, method, body, searchParams, timeout = 30000 } = options;

  const url = searchParams?.toString()
    ? `${backendUrl}${path}?${searchParams}`
    : `${backendUrl}${path}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = request.headers.get('Authorization');
  if (auth) headers['Authorization'] = auth;

  // Forward the inbound Cookie so cookie-based auth works across the seam: the
  // backend's /auth/refresh reads the HttpOnly refresh cookie, and logout reads
  // it to revoke. Without this the refresh credential never reaches the backend.
  const cookie = request.headers.get('cookie');
  if (cookie) headers['cookie'] = cookie;

  // Propagate a correlation id across the seam (frontend -> proxy -> route ->
  // engine) so observability / error-monitoring can stitch a request together.
  // Reuse the inbound id when present; otherwise mint one at the proxy hop.
  headers['x-request-id'] = request.headers.get('x-request-id') ?? crypto.randomUUID();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: method || request.method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_RESPONSE',
            message: 'Backend returned non-JSON response',
            statusCode: 502,
          },
        },
        { status: 502 },
      );
    }

    const data = await res.json();
    const response = NextResponse.json(data, { status: res.status });

    // Relay the backend's Set-Cookie(s) to the browser so login/refresh can
    // set and rotate the HttpOnly refresh cookie through the proxy. getSetCookie()
    // preserves multiple cookies individually (a combined get('set-cookie') would
    // fold them into one invalid header).
    const withCookies = res.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = withCookies.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      for (const c of setCookies) response.headers.append('set-cookie', c);
    } else {
      const single = res.headers.get('set-cookie');
      if (single) response.headers.set('set-cookie', single);
    }
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: 'Backend request timed out',
            statusCode: 504,
          },
        },
        { status: 504 },
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BACKEND_UNAVAILABLE',
          message: 'Backend service is unavailable',
          statusCode: 502,
        },
      },
      { status: 502 },
    );
  }
}
