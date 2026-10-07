// Conversation messages proxy (Layer 4):
//   GET  /api/sessions/:id/messages  -> backend GET  /sessions/:id/messages (history)
//   POST /api/sessions/:id/messages  -> backend POST /sessions/:id/messages (send + persist)
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAgentRequest(request, `/sessions/${encodeURIComponent(id)}/messages`, {
    searchParams: request.nextUrl.searchParams,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyAgentRequest(request, `/sessions/${encodeURIComponent(id)}/messages`, { body });
}
