import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../_lib/backend-url';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/search?${searchParams}`, {
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
