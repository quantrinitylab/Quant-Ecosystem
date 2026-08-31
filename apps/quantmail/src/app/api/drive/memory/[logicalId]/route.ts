import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../../_lib/backend-url';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ logicalId: string }> },
) {
  const { logicalId } = await params;
  const res = await safeFetch(
    `${DRIVE_BACKEND_URL}/drive/memory/${encodeURIComponent(logicalId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: request.headers.get('Authorization') || '' },
    },
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
