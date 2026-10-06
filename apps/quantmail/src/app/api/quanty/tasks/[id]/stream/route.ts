// GET /api/quanty/tasks/:id/stream — SSE live progress.
//
// Translates the backend's SSE vocabulary (task, step.start, step.done,
// step.failed, waiting-confirm, task.done/failed/interrupted) into the
// frontend vocabulary (task, step, done, error) that useQuantyAgent
// understands, mapping task/step statuses and shapes along the way.
import { NextRequest } from 'next/server';
import { backendBase, forwardHeaders } from '../../../_lib/backend';
import {
  translateStreamEvent,
  type BackendStreamEvent,
  type BackendTask,
} from '../../../_lib/quanty-mapper';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(`/api/quanty/tasks/${encodeURIComponent(id)}/stream`, backendBase()).toString();

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: forwardHeaders(request), cache: 'no-store' });
  } catch {
    return new Response(JSON.stringify({ error: 'Quanty backend is temporarily unavailable.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: `Stream unavailable (HTTP ${upstream.status})` }), {
      status: upstream.status === 404 ? 404 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let lastTask: BackendTask | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || closed) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            for (const line of frame.split('\n')) {
              if (!line.startsWith('data:')) continue; // skip : heartbeat comments
              const payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;
              let event: BackendStreamEvent;
              try {
                event = JSON.parse(payload) as BackendStreamEvent;
              } catch {
                continue; // malformed frame must not kill the stream
              }
              if (event.type === 'task') lastTask = event.task;
              const out = translateStreamEvent(event, lastTask);
              if (out) send(out);
            }
          }
        }
      } catch {
        // Upstream dropped — EventSource will reconnect.
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      closed = true;
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
