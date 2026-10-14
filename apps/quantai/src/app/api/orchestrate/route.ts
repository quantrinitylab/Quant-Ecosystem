import { NextRequest, NextResponse } from 'next/server';
import { QUANTAI_BACKEND_URL } from '../_lib/agent-proxy';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${QUANTAI_BACKEND_URL}/orchestrate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
    body: JSON.stringify(body),
  });

  // Stream the response back
  if (res.body) {
    return new NextResponse(res.body, {
      status: res.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
