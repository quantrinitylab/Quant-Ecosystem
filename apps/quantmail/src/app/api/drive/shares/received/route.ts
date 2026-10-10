// QM-SCREEN-010 proxy-gap fix — the "Shared with me" view calls
// GET /api/drive/shares/received (useDrive.fetchReceivedShares). No Next proxy
// route existed for it, so every call 404'd before reaching the backend. This
// is a faithful pass-through to the backend's GET /drive/shares/received: it
// forwards the caller's auth token and returns an honest 502
// (UPSTREAM_UNAVAILABLE) if the backend is unreachable.
import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../../_lib/backend-url';

export async function GET(request: NextRequest) {
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/shares/received`, {
    method: 'GET',
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
