// Single-session proxy (Layer 4):
//   GET    /api/sessions/:id  -> backend GET    /sessions/:id  (with messages)
//   PUT    /api/sessions/:id  -> backend PUT    /sessions/:id  (rename/update)
//   DELETE /api/sessions/:id  -> backend DELETE /sessions/:id  (soft delete)
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAgentRequest(request, `/sessions/${encodeURIComponent(id)}`);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyAgentRequest(request, `/sessions/${encodeURIComponent(id)}`, { body });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyAgentRequest(request, `/sessions/${encodeURIComponent(id)}`);
}
