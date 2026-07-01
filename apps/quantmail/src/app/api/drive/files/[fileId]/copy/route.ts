import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.QUANTDRIVE_BACKEND_URL || 'http://localhost:3012';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const res = await fetch(`${BACKEND_URL}/drive/files/${fileId}/copy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
