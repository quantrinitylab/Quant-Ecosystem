import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';
const FETCH_TIMEOUT_MS = 15000;

/**
 * GET /api/reels/feed?cursor=&limit=
 * Proxies to the QuantChat backend's ranked reels feed. The backend route
 * exists (Fastify GET /reels/feed) — the missing piece was this Next.js
 * proxy, which is why the feed spun forever on a 404. Failures are honest:
 * 503 when the backend is unreachable, never fabricated reels.
 */
export async function GET(request: NextRequest) {
  const url = new URL('/reels/feed', BACKEND_URL);
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
          code: timedOut ? 'REELS_TIMEOUT' : 'REELS_UNAVAILABLE',
          message: timedOut
            ? 'Reels service timed out'
            : 'Reels service is unreachable right now',
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
          code: 'REELS_BAD_RESPONSE',
          message: 'Reels service returned an invalid response',
          statusCode: 502,
        },
      },
      { status: 502 },
    );
  }
  return NextResponse.json(data, { status: res.status });
}
