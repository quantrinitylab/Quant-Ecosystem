import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';
import { BACKEND_URL } from '../../../_lib/backend';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, { backendUrl: BACKEND_URL, path: `/spaces/${id}/raise-hand` });
}

/** Lowering a hand is the same resource, removed. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    method: 'DELETE',
    path: `/spaces/${id}/raise-hand`,
  });
}
