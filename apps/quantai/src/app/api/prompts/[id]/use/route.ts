// Record prompt usage proxy (Layer 4):
//   POST /api/prompts/:id/use -> backend POST /prompts/:id/use
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAgentRequest(request, `/prompts/${encodeURIComponent(id)}/use`, { body: {} });
}
