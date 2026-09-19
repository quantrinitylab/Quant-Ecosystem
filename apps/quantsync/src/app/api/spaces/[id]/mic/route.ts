import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';
import { BACKEND_URL } from '../../../_lib/backend';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    path: `/spaces/${id}/mic`,
    body,
  });
}
