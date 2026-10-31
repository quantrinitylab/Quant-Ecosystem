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
    /**
     * fix/qm-quantgit-ci-logs-stream: stream-through mode for SSE. The generic
     * path below does `await res.json()` + `NextResponse.json(data, ...)` for
     * every response, which either hangs the fetch until an SSE stream closes
     * or throws into a 502 INVALID_RESPONSE ("Backend returned non-JSON
     * response") — and NextResponse.json never sets the text/event-stream
     * Content-Type a browser EventSource requires. When set (or when the
     * backend itself answers with text/event-stream), the response body is
     * piped untouched with SSE headers: no JSON parsing, no buffering, no
     * caching. Any other non-JSON backend answer (binary downloads, CSV,
     * plain text) is likewise piped untouched by the content-type gate
     * below (fix/qm-drive-public-download-proxy); only JSON answers keep
     * the historic JSON-buffering behavior.
     */
    stream?: boolean;
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
  // WR-MAIL-104: forward the client's idempotency key. Active mail commands
  // REQUIRE a valid Idempotency-Key server-side; without this hop the proxy
  // would strip the key the web client minted and every mutation would 400.
  const idempotencyKey = request.headers.get('Idempotency-Key');
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

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

  // fix/qm-quantgit-ci-logs-stream: stream-through mode for SSE. The generic
  // path below does `await res.json()` + `NextResponse.json(data, ...)`, which
  // either hangs until the stream closes or throws into a 502
  // INVALID_RESPONSE on a text/event-stream response — and NextResponse.json
  // never sets the Content-Type a browser EventSource requires. Opt-in via
  // `options.stream`, or auto-detected when the backend answers with
  // text/event-stream: pipe the body untouched with SSE headers, never cached
  // or buffered. (An SSE answer that previously reached this point could only
  // end as a hung fetch or a 502, so auto-detect strictly repairs breakage.)
  const backendContentType = res.headers.get('content-type') ?? '';
  if (
    (options?.stream === true || backendContentType.startsWith('text/event-stream')) &&
    res.body
  ) {
    const streamHeaders = new Headers();
    streamHeaders.set('content-type', backendContentType || 'text/event-stream');
    streamHeaders.set('cache-control', 'no-cache');
    streamHeaders.set('x-accel-buffering', 'no');
    const connection = res.headers.get('connection');
    if (connection) streamHeaders.set('connection', connection);
    return new Response(res.body, { status: res.status, headers: streamHeaders });
  }

  // fix/qm-drive-public-download-proxy: non-JSON byte-stream passthrough.
  // The generic path below does `await res.json()` on every remaining
  // response, so a backend byte stream — a public-share file download
  // (GET /drive/public/share/:token/download answers with the file's mime
  // type + attachment disposition, backend/routes/drive.ts), a CSV export,
  // any binary/text body — threw into a 502 INVALID_RESPONSE and the file
  // could never download or preview through the catch-all proxy, even
  // though the dedicated /api/drive/files/[fileId]/download route already
  // streams `new NextResponse(res.body)` untouched. Gate on content-type,
  // not on the route: backend ERROR answers on these same routes are JSON
  // (Fastify error shape, application/json), so they still fall through to
  // the JSON path below with their honest status/code intact. The body is
  // piped as a stream, never buffered through text()/json() — decoding
  // would corrupt non-UTF-8 bytes. Content-Disposition and Content-Length
  // are forwarded so the browser downloads/previews exactly what the
  // backend sent; cache-control is the backend's own when set, else
  // no-store (shared-link bytes must never be cached as JSON either).
  if (res.body && !backendContentType.includes('json')) {
    const passthroughHeaders = new Headers();
    if (backendContentType) passthroughHeaders.set('content-type', backendContentType);
    const contentDisposition = res.headers.get('content-disposition');
    if (contentDisposition) passthroughHeaders.set('content-disposition', contentDisposition);
    const contentLength = res.headers.get('content-length');
    if (contentLength) passthroughHeaders.set('content-length', contentLength);
    passthroughHeaders.set(
      'cache-control',
      res.headers.get('cache-control') ?? 'no-store',
    );
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) passthroughHeaders.set('set-cookie', setCookie);
    return new Response(res.body, { status: res.status, headers: passthroughHeaders });
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
