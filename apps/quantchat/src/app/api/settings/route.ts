import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

/**
 * User settings proxy. Forwards to the backend `GET|PUT /settings` endpoints
 * (which persist privacy/notification/theme/language in User.preferences).
 * Previously no route existed here, so the settings page's PUT 404'd and the
 * save appeared to work while persisting nothing.
 */
function forwardHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;
  return headers;
}

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(new URL('/settings', BACKEND_URL).toString(), {
      method: 'GET',
      headers: forwardHeaders(request),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Settings request failed', statusCode: 0 },
      },
      { status: 502 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.text();
    const res = await fetch(new URL('/settings', BACKEND_URL).toString(), {
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
        error: { code: 'NETWORK_ERROR', message: 'Settings save failed', statusCode: 0 },
      },
      { status: 502 },
    );
  }
}
