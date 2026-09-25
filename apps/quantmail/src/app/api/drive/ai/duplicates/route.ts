import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../../_lib/backend-url';

export async function POST(request: NextRequest) {
  try {
    const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/ai/duplicates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('Authorization') || '',
      },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to scan duplicate files' },
      { status: 500 },
    );
  }
}
