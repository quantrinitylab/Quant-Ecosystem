import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const res = await fetch(`${BACKEND_URL}/drive/files/${fileId}/versions`, {
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
