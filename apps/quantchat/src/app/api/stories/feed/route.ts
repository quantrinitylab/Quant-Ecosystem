import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTCHAT_BACKEND_URL || 'http://localhost:3002';

export async function GET(request: NextRequest) {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/stories/feed`, {
      headers: { Authorization: request.headers.get('Authorization') || '' },
    });
  } catch {
    return NextResponse.json(
      { groups: [], error: 'Stories service unreachable' },
      { status: 503 },
    );
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json(
      { groups: [], error: 'Stories service returned an invalid response' },
      { status: 502 },
    );
  }
  return NextResponse.json(data, { status: res.status });
}
