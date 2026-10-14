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

// GET /api/drive/folders — flat list of all non-deleted folders (every depth).
// Quanty's organize flow no longer resolves folder names client-side: the
// organize-suggest response carries the backend-resolved folderId (root-level,
// exact-case match — the same rule "Move here" uses). This route stays for
// the general Drive UI. Forwards to the backend's GET /drive/folders,
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
