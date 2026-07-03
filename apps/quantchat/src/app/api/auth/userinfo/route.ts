import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

/**
 * OIDC-style userinfo proxy. Forwards the shared `useAuth` hook's
 * `GET /api/auth/userinfo` (with the caller's `Authorization: Bearer <jwt>`) to
 * the backend `GET /auth/me`, which VERIFIES the token server-side and returns
 * the durable identity. The JWT secret never touches the client. Fail-closed:
 * a missing token yields the backend's 401; an unreachable backend yields 502
 * (never a fabricated user).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  try {
    const res = await fetch(new URL('/auth/me', BACKEND_URL).toString(), {
      method: 'GET',
      headers: authHeader ? { Authorization: authHeader } : {},
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
