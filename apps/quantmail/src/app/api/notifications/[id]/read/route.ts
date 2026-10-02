import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/notifications/${id}/read`, { method: 'PATCH' });
}
