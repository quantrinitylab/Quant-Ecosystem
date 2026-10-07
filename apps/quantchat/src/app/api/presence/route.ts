import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

/**
 * Presence snapshot proxy (Requirement 11.2). Forwards to the backend
 * `GET /ws/presence` endpoint (which returns `{ online: string[] }`) and
 * normalizes the body into the standard ApiResponse envelope the frontend
 * api-client expects. Query params (e.g. `userIds`) are forwarded unchanged.
 */
export async function GET(request: NextRequest) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;

  const url = new URL('/ws/presence', BACKEND_URL);
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  try {
    const res = await fetch(url.toString(), { method: 'GET', headers });
    const data = (await res.json()) as { online?: unknown } & Record<string, unknown>;

    // Backend returns a raw `{ online: string[] }` body — wrap it so the client
    // can use the same `{ success, data }` convention as every other endpoint.
    if (data && Array.isArray(data.online)) {
      return NextResponse.json(
        { success: true, data: { online: data.online as string[] } },
        { status: res.status },
      );
    }

    // Already enveloped (or an error body) — pass through unchanged.
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Presence request failed', statusCode: 0 },
      },
      { status: 502 },
    );
  }
}
