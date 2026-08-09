import { NextRequest, NextResponse } from 'next/server';

export async function proxyToBackend(
  request: NextRequest,
  backendPath: string,
  options?: { method?: string; body?: unknown },
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

  const res = await fetch(url.toString(), fetchOptions);
  try {
    const data = await res.json();
    const response = NextResponse.json(data, { status: res.status });
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
      { status: 502 },
    );
  }
}
