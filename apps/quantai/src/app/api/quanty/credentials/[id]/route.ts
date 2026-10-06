// Layer 4 proxy: DELETE /api/quanty/credentials/:id -> backend revoke.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAgentRequest(request, `/quanty/credentials/${id}`);
}
