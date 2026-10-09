import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';
const FETCH_TIMEOUT_MS = 15000;

/**
 * GET /api/calls/history?page=&pageSize=
 * Proxies to the QuantChat backend's real call-history store
 * (Fastify GET /calls/history, persisted via CallRecordService). Honest
 * 503 when the backend is unreachable — never fabricated call records.
 */
export async function GET(request: NextRequest) {
  const url = new URL('/calls/history', BACKEND_URL);
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Authorization: request.headers.get('Authorization') || '' },
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: timedOut ? 'CALLS_TIMEOUT' : 'CALLS_UNAVAILABLE',
          message: timedOut
            ? 'Call history timed out'
            : 'Call history is unreachable right now',
          statusCode: 503,
        },
      },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'CALLS_BAD_RESPONSE',
          message: 'Call history returned an invalid response',
          statusCode: 502,
        },
      },
      { status: 502 },
    );
  }
  return NextResponse.json(data, { status: res.status });
}
