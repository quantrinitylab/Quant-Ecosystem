import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

/**
 * POST /api/threads/:id/read — read-receipt pipeline.
 * Forwards to the backend `POST /threads/:id/read`, which stamps `readAt` on
 * the viewer's unread received messages and propagates it to the senders'
 * sent copies so their WhatsApp-style ticks flip to double-green.
 * This proxy was the missing link: the client called it but the route didn't
 * exist, so mark-as-read silently 404'd and ticks never advanced past "sent".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/threads/${encodeURIComponent(id)}/read`);
}
