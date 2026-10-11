import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTMAX_BACKEND_URL || 'http://localhost:3007';


/** Read one cookie value from a Cookie header. Never throws. */
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

export async function proxyToBackend(
  request: NextRequest,
  backendPath: string,
  options?: { method?: string; body?: unknown; stream?: boolean },
) {
  const method = options?.method || request.method;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    headers['Authorization'] = authHeader;
  } else {
    // SSO sessions keep the access token in the httpOnly `quant_sso_access`
    // cookie (never in JS), so the browser sends no Authorization header.
    // Promote it to a Bearer header for token-expecting backends — server-side
    // only, never logged or echoed.
    const bearer = readCookieValue(request.headers.get('cookie'), 'quant_sso_access');
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
  }
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
