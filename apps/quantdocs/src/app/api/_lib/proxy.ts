import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTDOCS_BACKEND_URL || 'http://localhost:3040';

export async function proxyToBackend(
  request: NextRequest,
  backendPath: string,
  options?: { method?: string; body?: unknown },
) {
  const method = options?.method || request.method;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;

  const url = new URL(backendPath, BACKEND_URL);
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
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
