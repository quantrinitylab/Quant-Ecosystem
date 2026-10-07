// Toggle prompt favorite proxy (Layer 4):
//   POST /api/prompts/:id/favorite -> backend POST /prompts/:id/favorite
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAgentRequest(request, `/prompts/${encodeURIComponent(id)}/favorite`, { body: {} });
}
