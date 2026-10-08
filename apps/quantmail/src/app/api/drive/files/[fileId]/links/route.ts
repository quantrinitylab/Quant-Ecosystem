// List a file's share links (scope, audience, expiry) from the Drive backend.
// Owner-only upstream; the proxy forwards the caller's auth token so the
// backend can gate. Shared by QM-M39-005 (read-only access viewer) and
// QM-M39-006 (link-share dialog) — both read the same honest backend state.
import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../../../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../../../_lib/backend-url';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const res = await safeFetch(
    `${DRIVE_BACKEND_URL}/drive/files/${encodeURIComponent(fileId)}/links`,
    {
      headers: { Authorization: request.headers.get('Authorization') || '' },
    },
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
