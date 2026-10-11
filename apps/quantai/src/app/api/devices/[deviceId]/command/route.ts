import { NextRequest, NextResponse } from 'next/server';

import { QUANTAI_BACKEND_URL } from '../../../_lib/agent-proxy';
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  const body = await request.json();
  const res = await fetch(`${QUANTAI_BACKEND_URL}/devices/${deviceId}/command`, {
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
