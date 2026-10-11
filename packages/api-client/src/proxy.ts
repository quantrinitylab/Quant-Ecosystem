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
  /**
   * When set and the inbound request carries no Authorization header, read
   * this httpOnly cookie from the inbound Cookie header and forward it as
   * `Authorization: Bearer <value>` to the backend. This is how SSO sessions
   * (tokens live only in httpOnly cookies, never in JS) keep working against
   * token-expecting backends. Never logs or echoes the value.
   *
   * Defaults to the ecosystem SSO access cookie. The cookie only exists on
   * origins whose login flow mints it, so the default is a no-op elsewhere.
   */
  authCookieName?: string;
}

/**
 * Read one cookie value from a Cookie header without pulling in a dependency.
 * Returns the decoded value or null. Never throws.
 */
function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    if (part.slice(0, idx).trim() === name) {
      const raw = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

/**
 * Proxies a Next.js API route request to a backend service with proper error
 * handling, timeout support, content-type validation, and conditional auth.
 */
export async function proxyToBackend(
  request: NextRequest,
  options: ProxyOptions,
): Promise<NextResponse> {
  const {
    backendUrl,
    path,
    method,
    body,
    searchParams,
    timeout = 30000,
    authCookieName = 'quant_sso_access',
  } = options;

  const url = searchParams?.toString()
    ? `${backendUrl}${path}?${searchParams}`
    : `${backendUrl}${path}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = request.headers.get('Authorization');
  if (auth) {
    headers['Authorization'] = auth;
  } else if (authCookieName) {
    // SSO sessions keep tokens in httpOnly cookies (never in JS), so the
    // browser sends no Authorization header. Promote the session cookie to a
    // Bearer header for token-expecting backends — server-side only.
    const bearer = readCookieValue(request.headers.get('cookie'), authCookieName);
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
  }

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
