import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTAI_BACKEND_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${BACKEND_URL}/orchestrate`, {
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
