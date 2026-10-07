// Move-to-topic proxy (Layer 4):
//   POST /api/sessions/:id/topic -> backend POST /sessions/:id/topic
//   Body: { topic: string | null } — null/blank moves the conversation back to main chats
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyAgentRequest(request, `/sessions/${encodeURIComponent(id)}/topic`, { body });
}
