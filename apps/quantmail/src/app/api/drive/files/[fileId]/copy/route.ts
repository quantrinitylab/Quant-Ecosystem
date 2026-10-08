import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../../../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../../../_lib/backend-url';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  let targetFolderId: string | null = null;
  try {
    const body = await request.json();
    targetFolderId = typeof body?.targetFolderId === 'string' ? body.targetFolderId : null;
  } catch {
    // No body — copy into the file's current folder (backend default).
  }
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/files/${fileId}/copy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
    body: JSON.stringify({ targetFolderId }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
