import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

/**
 * Phone-OTP verify proxy. Forwards the login page's `POST /api/auth/otp/verify`
 * to the backend `POST /auth/otp/verify` (public, pre-auth) and returns the
 * backend's `{ success, data }` envelope (containing the issued JWTs) unchanged.
 */
export async function POST(request: NextRequest) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty/invalid body — let the backend validation reject it
  }

  try {
    const res = await fetch(new URL('/auth/otp/verify', BACKEND_URL).toString(), {
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
