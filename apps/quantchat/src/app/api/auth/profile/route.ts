import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.QUANTCHAT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:3002';

/**
 * Profile update proxy — forwards GET|PUT `/api/auth/profile` to the backend
 * `/auth/profile` endpoints. Previously no proxy existed, so the frontend's
 * updateProfile() call 404'd and profile edits silently failed.
 */
function forwardHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;
  return headers;
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.text();
    const res = await fetch(new URL('/auth/profile', BACKEND_URL).toString(), {
      method: 'PUT',
      headers: forwardHeaders(request),
      body,
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Profile update failed', statusCode: 0 },
      },
      { status: 502 },
    );
  }
}
