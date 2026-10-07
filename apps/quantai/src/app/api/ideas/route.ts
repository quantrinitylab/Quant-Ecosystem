import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTAI_BACKEND_URL || 'http://localhost:3020';

function authHeaders(request: NextRequest): HeadersInit {
  return { Authorization: request.headers.get('Authorization') || '' };
}

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status');
  const url = status
    ? `${BACKEND_URL}/quanty/ideas?status=${encodeURIComponent(status)}`
    : `${BACKEND_URL}/quanty/ideas`;
  const res = await fetch(url, { headers: authHeaders(request) });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${BACKEND_URL}/quanty/ideas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(request) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
