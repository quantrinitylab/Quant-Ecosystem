import { NextRequest, NextResponse } from 'next/server';

import { QUANTAI_BACKEND_URL } from '../../_lib/agent-proxy';
function authHeaders(request: NextRequest): HeadersInit {
  return { Authorization: request.headers.get('Authorization') || '' };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await fetch(`${QUANTAI_BACKEND_URL}/quanty/ideas/${encodeURIComponent(id)}`, {
    headers: authHeaders(request),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const res = await fetch(`${QUANTAI_BACKEND_URL}/quanty/ideas/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(request) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await fetch(`${QUANTAI_BACKEND_URL}/quanty/ideas/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(request),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
