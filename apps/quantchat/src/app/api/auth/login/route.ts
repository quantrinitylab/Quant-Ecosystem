import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

/**
 * Direct Email/Password login proxy. Forwards `POST /api/auth/login`
 * to the backend `POST /auth/login` and returns session tokens.
 */
export async function POST(request: NextRequest) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty/invalid body — let the backend validation reject it
  }

  try {
    const res = await fetch(new URL('/auth/login', BACKEND_URL).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (data && typeof data === 'object' && 'success' in data) {
      return NextResponse.json(data, { status: res.status });
    }
    return NextResponse.json({ success: res.ok, data }, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'Auth service unavailable',
          statusCode: 502,
        },
      },
      { status: 502 },
    );
  }
}
