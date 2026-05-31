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
    return NextResponse.json(data, { status: res.status });
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
