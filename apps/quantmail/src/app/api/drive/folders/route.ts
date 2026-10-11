import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../_lib/backend-url';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/folders`, {
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

// GET /api/drive/folders — Quanty's organize flow resolves a suggested
// category name to a folder id via GET here (QuantyFileWorkspace
// resolveFolderId). Previously this route exported POST only, so every GET
// 405'd and the lookup silently fell back to null. Forwards to the backend's
// GET /drive/folders (flat list of all non-deleted folders, every depth),
// keeping the caller's `{ folders }` contract.
export async function GET(request: NextRequest) {
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/folders`, {
    method: 'GET',
    headers: {
      Authorization: request.headers.get('Authorization') || '',
    },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
