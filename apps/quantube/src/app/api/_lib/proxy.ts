import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTUBE_BACKEND_URL || 'http://localhost:3006';

export async function proxyToBackend(
  request: NextRequest,
  backendPath: string,
  options?: { method?: string; body?: unknown; stream?: boolean },
) {
  const method = options?.method || request.method;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;
  const url = new URL(backendPath, BACKEND_URL);
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

  // Stream binary/SSE responses directly
  const contentType = res.headers.get('content-type') || '';
  if (
    options?.stream ||
    contentType.includes('stream') ||
    contentType.includes('octet') ||
    contentType.includes('video') ||
    contentType.includes('audio') ||
    contentType.includes('pdf')
  ) {
    return new NextResponse(res.body, {
      status: res.status,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': res.headers.get('content-disposition') || '',
        'Cache-Control': res.headers.get('cache-control') || 'no-cache',
      },
    });
  }

  // Default: JSON response
  const data = await res.json().catch(() => ({ error: 'Invalid response' }));
  return NextResponse.json(data, { status: res.status });
}
