import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';
const FETCH_TIMEOUT_MS = 15000;

async function proxyReelAction(
  request: NextRequest,
  backendPath: string,
  body?: unknown,
): Promise<NextResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(new URL(backendPath, BACKEND_URL).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('Authorization') || '',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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

/**
 * POST /api/reels — create a reel (used by ReelUploader).
 * Body: { videoUrl, thumbnailUrl, caption, duration }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  return proxyReelAction(request, '/reels', body);
}
