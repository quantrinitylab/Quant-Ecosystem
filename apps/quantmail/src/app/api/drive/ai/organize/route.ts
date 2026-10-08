// POST /api/drive/ai/organize — proxy to the Drive backend's AI organize
// endpoint (QM-M39-011). Body: { fileId, apply? }. With apply=false the
// backend only suggests a destination; apply=true moves the file for real.
import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../../_lib/backend-url';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/ai/organize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('Authorization') || '',
      },
      body: JSON.stringify({ fileId: body?.fileId, apply: body?.apply === true }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to organize file' },
      { status: 500 },
    );
  }
}
