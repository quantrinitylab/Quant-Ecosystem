// QM-SCREEN-010 proxy-gap fix — permanently deleting a trashed item calls
// DELETE /api/drive/files/:id/purge (useDrive.purgeFile). No Next proxy route
// existed for it, so every call 404'd before reaching the backend. This is a
// faithful pass-through to the backend's DELETE /drive/files/:id/purge: it
// forwards the caller's auth token and returns an honest 502
// (UPSTREAM_UNAVAILABLE) if the backend is unreachable.
import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../../../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../../../_lib/backend-url';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const res = await safeFetch(
    `${DRIVE_BACKEND_URL}/drive/files/${encodeURIComponent(fileId)}/purge`,
    {
      method: 'DELETE',
      headers: { Authorization: request.headers.get('Authorization') || '' },
    },
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
