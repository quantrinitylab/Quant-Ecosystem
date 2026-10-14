import { NextRequest, NextResponse } from 'next/server';

import { QUANTAI_BACKEND_URL } from '../../_lib/agent-proxy';
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${QUANTAI_BACKEND_URL}/assistant/personality`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
