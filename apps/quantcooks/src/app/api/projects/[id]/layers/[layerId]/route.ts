import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../_lib/proxy';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; layerId: string }> },
) {
  const { id, layerId } = await params;
  return proxyToBackend(request, `/projects/${id}/layers/${layerId}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; layerId: string }> },
) {
  const { id, layerId } = await params;
  return proxyToBackend(request, `/projects/${id}/layers/${layerId}`);
}
