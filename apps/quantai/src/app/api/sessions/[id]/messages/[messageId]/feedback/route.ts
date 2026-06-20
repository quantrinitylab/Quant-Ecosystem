// Message feedback proxy (Layer 4):
// POST /api/sessions/:id/messages/:messageId/feedback
// -> backend POST /sessions/:id/messages/:messageId/feedback.
// Forwards the bearer token and the { feedback } body.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../../../_lib/agent-proxy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { id, messageId } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyAgentRequest(
    request,
    `/sessions/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/feedback`,
    { body },
  );
}
