// Feed discuss proxy (Layer 4):
//   POST /api/quanty/feed/:id/discuss -> backend POST /quanty/feed/:id/discuss
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAgentRequest(request, `/quanty/feed/${encodeURIComponent(id)}/discuss`);
}
