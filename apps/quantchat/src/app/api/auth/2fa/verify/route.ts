import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

/**
 * QC-F-141: second-factor verification proxy. Forwards `POST /api/auth/2fa/verify`
 * to the backend `POST /auth/2fa/verify` ({ challenge, code }) and returns the
 * session tokens on success. Like the login proxy this sets NO cookies — the
 * tokens travel in the body and the web session layer persists them. A
 * challenge answer carries no session, so there is nothing to persist here.
 */
export async function POST(request: NextRequest) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty/invalid body — let the backend validation reject it
  }

  try {
    const res = await fetch(new URL('/auth/2fa/verify', BACKEND_URL).toString(), {
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
