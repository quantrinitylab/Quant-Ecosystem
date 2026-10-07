import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../../../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../../../_lib/backend-url';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const body = await request.json();
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/files/${fileId}/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const body = await request.json();
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/files/${fileId}/share`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
