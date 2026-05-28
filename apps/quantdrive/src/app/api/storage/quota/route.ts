import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTDRIVE_BACKEND_URL || 'http://localhost:3106';

export async function GET(request: NextRequest) {
  const res = await fetch(`${BACKEND_URL}/storage/quota`, {
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
