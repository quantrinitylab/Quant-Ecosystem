import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return proxyToBackend(request, `/events/${id}`);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return proxyToBackend(request, `/events/${id}`, { method: 'PATCH' });
}

// Backward compatibility for clients that still issue PUT: the Fastify backend
// receives PATCH while both verbs remain accepted during migration.
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return proxyToBackend(request, `/events/${id}`, { method: 'PATCH' });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return proxyToBackend(request, `/events/${id}`, { method: 'DELETE' });
}
