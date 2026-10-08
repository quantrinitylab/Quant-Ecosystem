import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../../../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../../../_lib/backend-url';

// QM-M39-002 — record an explicit file open for the Drive "Recent" view.
// Best-effort tracking: a failure here must never block the preview itself.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const res = await safeFetch(
    `${DRIVE_BACKEND_URL}/drive/files/${encodeURIComponent(fileId)}/open`,
    {
      method: 'POST',
      headers: { Authorization: request.headers.get('Authorization') || '' },
    },
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
