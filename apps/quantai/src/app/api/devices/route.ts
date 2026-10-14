import { NextRequest, NextResponse } from 'next/server';

import { QUANTAI_BACKEND_URL } from '../_lib/agent-proxy';
export async function GET(request: NextRequest) {
  const res = await fetch(`${QUANTAI_BACKEND_URL}/devices`, {
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${QUANTAI_BACKEND_URL}/devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
