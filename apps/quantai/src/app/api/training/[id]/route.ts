import { NextRequest, NextResponse } from 'next/server';

import { QUANTAI_BACKEND_URL } from '../../_lib/agent-proxy';
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await fetch(`${QUANTAI_BACKEND_URL}/training/${id}`, {
    method: 'DELETE',
    headers: { Authorization: request.headers.get('Authorization') || '' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
