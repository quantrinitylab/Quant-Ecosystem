import { NextRequest, NextResponse } from 'next/server';

import { QUANTAI_BACKEND_URL } from '../../_lib/agent-proxy';
export async function GET(request: NextRequest) {
  const res = await fetch(`${QUANTAI_BACKEND_URL}/ecosystem/apps`, {
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
