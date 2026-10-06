// Feed reaction proxy (Layer 4):
//   POST /api/quanty/feed/:id/react -> backend POST /quanty/feed/:id/react
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyAgentRequest(request, `/quanty/feed/${encodeURIComponent(id)}/react`, { body });
}
