import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';
import { BACKEND_URL } from '../../_lib/backend';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, { backendUrl: BACKEND_URL, path: `/posts/${id}` });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  return proxyToBackend(request, { backendUrl: BACKEND_URL, path: `/posts/${id}`, body });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    path: `/posts/${id}`,
    method: 'DELETE',
  });
}
