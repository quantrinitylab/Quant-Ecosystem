import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

export async function POST(request: NextRequest) {
  const body = await request.arrayBuffer();
  const res = await fetch(`${BACKEND_URL}/media/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': request.headers.get('Content-Type') || 'application/octet-stream',
      Authorization: request.headers.get('Authorization') || '',
    },
    body,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
