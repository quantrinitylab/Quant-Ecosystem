import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

const BACKEND_URL = process.env.QUANTSYNC_BACKEND_URL || 'http://localhost:3003';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, { backendUrl: BACKEND_URL, path: `/users/${id}/follow` });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, { backendUrl: BACKEND_URL, path: `/users/${id}/follow` });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, { backendUrl: BACKEND_URL, path: `/users/${id}/follow` });
}
