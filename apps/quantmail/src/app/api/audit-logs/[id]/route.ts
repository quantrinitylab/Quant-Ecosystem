import { NextRequest } from 'next/server';

import { proxyToBackend } from '../../_lib/proxy';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/audit-logs/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/audit-logs/${encodeURIComponent(id)}`, { method: 'PATCH' });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/audit-logs/${encodeURIComponent(id)}`, { method: 'PUT' });
}
