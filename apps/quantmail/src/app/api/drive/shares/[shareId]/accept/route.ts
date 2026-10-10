// QM-SCREEN-010 proxy-gap fix — accepting an incoming share calls
// POST /api/drive/shares/:id/accept (useDrive.acceptShare). No Next proxy route
// existed for it, so every call 404'd before reaching the backend. This is a
// faithful pass-through to the backend's POST /drive/shares/:id/accept: it
// forwards the caller's auth token and returns an honest 502
// (UPSTREAM_UNAVAILABLE) if the backend is unreachable.
//
// NOTE: the static /api/drive/shares/link route takes precedence over this
// dynamic segment at the same level, so share-link management is unaffected.
import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../../../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../../../_lib/backend-url';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;
  const res = await safeFetch(
    `${DRIVE_BACKEND_URL}/drive/shares/${encodeURIComponent(shareId)}/accept`,
    {
      method: 'POST',
      headers: { Authorization: request.headers.get('Authorization') || '' },
    },
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
