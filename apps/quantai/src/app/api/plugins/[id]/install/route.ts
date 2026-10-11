import { NextRequest, NextResponse } from 'next/server';

import { QUANTAI_BACKEND_URL } from '../../../_lib/agent-proxy';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${QUANTAI_BACKEND_URL}/plugins/${id}/install`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
