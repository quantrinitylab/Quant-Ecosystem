// QM-M39-008: proxy for the per-file activity/history view (M39 screen 25).
// Forwards to the drive backend's event log; events are written by the backend
// on real file actions only (upload, rename, move, share change, version
// restore) — nothing is fabricated or backfilled.
import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../../../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../../../_lib/backend-url';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/files/${fileId}/activity`, {
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
