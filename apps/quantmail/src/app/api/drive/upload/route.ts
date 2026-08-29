import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../_lib/backend-url';

// 25 MB plaintext ceiling, mirroring DRIVE_MAX_FILE_BYTES on the backend.
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');

  if (!form || !(file instanceof File)) {
    return NextResponse.json(
      { error: { message: 'No file provided', code: 'VALIDATION_ERROR' } },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: { message: 'File is larger than the 25 MB upload limit', code: 'FILE_TOO_LARGE' } },
      { status: 413 },
    );
  }

  const folderIdRaw = form.get('folderId');
  const bytes = Buffer.from(await file.arrayBuffer());

  // The backend has no multipart parser, so the form is normalised to JSON here.
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
    body: JSON.stringify({
      name: file.name || 'untitled',
      mimeType: file.type || 'application/octet-stream',
      folderId: typeof folderIdRaw === 'string' && folderIdRaw ? folderIdRaw : null,
      contentBase64: bytes.toString('base64'),
    }),
  });

  // Backend may answer with a non-JSON error body (e.g. a proxy-level 413).
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return NextResponse.json(
      { error: { message: text || 'Upload failed', code: 'UPLOAD_FAILED' } },
      { status: res.status || 502 },
    );
  }
}
