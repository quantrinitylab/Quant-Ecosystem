import { NextRequest } from 'next/server';

const BACKEND_URL = process.env.QUANTAI_BACKEND_URL || 'http://localhost:3020';

/**
 * Dedicated streaming endpoint - always returns SSE (no JSON fallback).
 * POST /api/ai/stream
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;

  const abortController = new AbortController();

  // Abort backend request when client disconnects
  request.signal.addEventListener('abort', () => {
    abortController.abort();
  });

  try {
    const backendResponse = await fetch(`${BACKEND_URL}/assistant/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, stream: true }),
      signal: abortController.signal,
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text().catch(() => 'Unknown error');
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorText })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    if (!backendResponse.body) {
      return new Response('data: [DONE]\n\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Pipe the backend ReadableStream through to the client
    const stream = backendResponse.body.pipeThrough(new TransformStream());

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return new Response(null, { status: 499 });
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }
}
