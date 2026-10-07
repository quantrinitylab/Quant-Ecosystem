// Single prompt template proxy (Layer 4):
//   PUT    /api/prompts/:id -> backend PUT    /prompts/:id  (update)
//   DELETE /api/prompts/:id -> backend DELETE /prompts/:id  (delete)
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyAgentRequest(request, `/prompts/${encodeURIComponent(id)}`, { body });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyAgentRequest(request, `/prompts/${encodeURIComponent(id)}`);
}
