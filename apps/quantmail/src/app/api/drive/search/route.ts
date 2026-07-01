import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../_lib/safe-fetch';

const BACKEND_URL = process.env.QUANTDRIVE_BACKEND_URL || 'http://localhost:3012';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const res = await safeFetch(`${BACKEND_URL}/drive/search?${searchParams}`, {
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
