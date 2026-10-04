import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/mail-filters/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/mail-filters/${encodeURIComponent(id)}`);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/mail-filters/${encodeURIComponent(id)}`, { method: 'PUT' });
}
