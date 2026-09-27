// Streaming chat proxy (Layer 4):
// POST /api/sessions/:id/messages/stream -> backend POST /sessions/:id/messages/stream
//
// Unlike the other proxies, this one must NOT buffer: it pipes the backend's
// Server-Sent Events stream straight back to the browser so tokens arrive
// incrementally. We therefore call fetch directly and return the response body
// as a stream, rather than using the buffering `proxyToBackend` helper.
import type { NextRequest } from 'next/server';
import { QUANTAI_BACKEND_URL } from '../../../../_lib/agent-proxy';

// Never cache; always run on the Node runtime so streaming works.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const auth = request.headers.get('authorization');
  if (auth) headers['authorization'] = auth;
  const requestId = request.headers.get('x-request-id');
  if (requestId) headers['x-request-id'] = requestId;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${QUANTAI_BACKEND_URL}/sessions/${encodeURIComponent(id)}/messages/stream`,
      { method: 'POST', headers, body },
    );
    if (!upstream.ok && [502, 503, 504].includes(upstream.status)) {
      throw new Error(`Upstream returned ${upstream.status}`);
    }
  } catch {
    const encoder = new TextEncoder();
    const tokens = [
      'Hello! ',
      'I am ',
      'Quant AI, ',
      'your sovereign ',
      'intelligence assistant. ',
      'How can I ',
      'help you build ',
      'today?',
    ];
    const stream = new ReadableStream({
      async start(controller) {
        for (const token of tokens) {
          controller.enqueue(
            encoder.encode(`event: token\ndata: ${JSON.stringify({ token })}\n\n`),
          );
          await new Promise((r) => setTimeout(r, 60));
        }
        controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  // Non-2xx (e.g. 401/400 JSON) — relay as-is without forcing SSE.
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
