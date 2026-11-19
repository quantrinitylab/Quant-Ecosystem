import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookies } from '../../_lib/session-cookies';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

/**
 * Direct Email/Password login proxy. Forwards `POST /api/auth/login`
 * to the backend `POST /auth/login` and returns session tokens.
 *
 * QC-F-154 (Slice-1 / Release A): on success the issued tokens are ALSO set
 * as the canonical HttpOnly session cookies (the backend's Bearer contract
 * is unchanged — Flutter keeps working; the body still carries the tokens
 * for the old web client, which Release B stops reading).
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
    const resp =
      data && typeof data === 'object' && 'success' in data
        ? NextResponse.json(data, { status: res.status })
        : NextResponse.json({ success: res.ok, data }, { status: res.status });
    if (res.ok) {
      const issued = (data as { data?: { accessToken?: unknown; refreshToken?: unknown } } | null)?.data;
      const accessToken = issued?.accessToken;
      if (typeof accessToken === 'string' && accessToken) {
        const refreshToken = issued?.refreshToken;
        setSessionCookies(resp, {
          accessToken,
          refreshToken: typeof refreshToken === 'string' && refreshToken ? refreshToken : undefined,
        });
      }
    }
    return resp;
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
