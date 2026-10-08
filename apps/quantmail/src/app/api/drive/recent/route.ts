import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../_lib/backend-url';

// QM-M39-002 — Drive "Recent" view (M39 screen 6). Pass-through proxy: the
// recency ordering is computed server-side by GET /drive/recent; this route
// forwards query params (cursor, limit) and the caller's Authorization.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/recent?${searchParams}`, {
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
