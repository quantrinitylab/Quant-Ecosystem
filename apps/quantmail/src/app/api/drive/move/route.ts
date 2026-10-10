// QM-SCREEN-010 proxy-gap fix — moving files calls POST /api/drive/move
// (useDrive.moveFiles with { fileIds, targetFolderId }), but the only Next
// proxy route that existed was /api/drive/files/move, so every move 404'd.
// This adds the missing /api/drive/move pass-through to the backend's
// POST /drive/move (which shares the same handler as /drive/files/move on the
// backend). The existing /api/drive/files/move route is untouched and keeps
// working. Forwards the caller's auth token; honest 502 (UPSTREAM_UNAVAILABLE)
// if the backend is unreachable.
import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../_lib/backend-url';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/move`, {
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
