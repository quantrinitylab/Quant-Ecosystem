import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../_lib/safe-fetch';

const BACKEND_URL = process.env.QUANTDRIVE_BACKEND_URL || 'http://localhost:3012';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await safeFetch(`${BACKEND_URL}/drive/folders`, {
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
