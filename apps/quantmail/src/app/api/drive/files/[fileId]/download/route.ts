import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../../../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../../../_lib/backend-url';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/files/${fileId}/download`, {
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });

  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Disposition': res.headers.get('Content-Disposition') || '',
    },
  });
}
