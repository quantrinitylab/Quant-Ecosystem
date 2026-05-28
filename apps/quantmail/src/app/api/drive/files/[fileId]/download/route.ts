import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const res = await fetch(`${BACKEND_URL}/drive/files/${fileId}/download`, {
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
