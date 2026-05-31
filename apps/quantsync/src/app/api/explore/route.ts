import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTSYNC_BACKEND_URL || 'http://localhost:3003';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const res = await fetch(`${BACKEND_URL}/explore?${searchParams}`, {
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
