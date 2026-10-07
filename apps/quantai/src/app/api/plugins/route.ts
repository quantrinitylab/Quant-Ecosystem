import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTAI_BACKEND_URL || 'http://localhost:3020';

export async function GET(request: NextRequest) {
  const res = await fetch(`${BACKEND_URL}/plugins`, {
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
