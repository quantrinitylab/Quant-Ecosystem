// QM-M39-006: Drive share-link management proxies. POST creates a link;
// PATCH updates scope/role/expiry/password on an existing link (body carries
// the link id); DELETE revokes a link (?id=). All three forward the caller's
// auth token; the backend gates everything owner-only.
import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '../../_lib/safe-fetch';
import { DRIVE_BACKEND_URL } from '../../_lib/backend-url';

function authHeaders(request: NextRequest): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: request.headers.get('Authorization') || '',
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/shares/link`, {
    method: 'POST',
    headers: authHeaders(request),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = body?.id;
  if (!id || typeof id !== 'string') {
    return NextResponse.json(
      { success: false, message: 'Link id is required' },
      { status: 400 },
    );
  }
  const { id: _omit, ...updates } = body;
  void _omit;
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/shares/link/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(request),
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { success: false, message: 'Link id is required' },
      { status: 400 },
    );
  }
  const res = await safeFetch(`${DRIVE_BACKEND_URL}/drive/shares/link/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(request),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
