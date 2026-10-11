// ============================================================================
// POST /api/ask — thin authenticated proxy to the agent-gateway backend.
// ============================================================================
//
// SECURITY MODEL (F-112 fix): this route is a proxy, not a gateway.
//
//   - It NEVER plans or executes tools. The previous version ran a local
//     CrossAppOrchestrator whose auth was a presence-only Bearer check (any
//     garbage string passed), whose userId came from the request body
//     (caller-spoofable), and whose "confirmation" was the client's own
//     `confirmed: true` claim (full confirmation bypass once handlers were
//     ever wired here).
//   - The caller's Authorization header is forwarded VERBATIM to the backend
//     `/agentic/chat`, where `createApp`'s global `requireAuth` hook performs
//     real JWT verification (jose.jwtVerify: signature + issuer + audience +
//     non-access-kind rejection — see packages/server-core/src/plugins/auth.ts).
//     An unverifiable token is 401'd by the backend; that verdict is relayed
//     unchanged. There is no anonymous fallback.
//   - `userId` is derived from the verified token's `sub` on the backend —
//     any `userId` in the request body is dropped and never forwarded.
//   - `confirmed` / `confirmedSteps` are dropped and never forwarded. Tier-2+
//     plans are held server-side and resume ONLY via
//     POST /api/agentic/confirm/:planId (held-plan + explicit round-trip,
//     owner-bound, single-use, 10-minute TTL).
//
// Voice input keeps its local real-STT step (fail-closed 503 when
// OPENAI_API_KEY is unset — never a fabricated transcription); the
// transcript is then proxied as the message like any other input.

import { NextRequest, NextResponse } from 'next/server';
import { SpeechToTextService } from '@quant/ai';
import { QUANTAI_BACKEND_URL } from '../_lib/agent-proxy';

export const dynamic = 'force-dynamic';

const MAX_INPUT_LENGTH = 2000;
const STREAM_INACTIVITY_TIMEOUT_MS = 60_000;

interface AskRequestBody {
  input?: string;
  sessionId?: string;
  dryRun?: boolean;
  voice?: boolean;
  audio?: string;
  /**
   * NEVER trusted or forwarded. Identity comes from the verified JWT only.
   * Destructured out explicitly so these fields cannot leak into the
   * backend payload.
   */
  userId?: unknown;
  /** Client-asserted confirmation — not a security boundary. Dropped. */
  confirmed?: unknown;
  /** Client-asserted per-step confirmation — not a security boundary. Dropped. */
  confirmedSteps?: unknown;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized: missing Authorization header' },
    { status: 401 },
  );
}

export async function POST(request: NextRequest | Request) {
  // Fail closed at the edge: no credential, no proxying, no anonymous run.
  // Cryptographic verification happens on the backend; a garbage token is
  // 401'd there and the verdict is relayed below.
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return unauthorized();
  }

  let body: AskRequestBody;
  try {
    body = (await request.json()) as AskRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let message = body.input;

  // Voice mode: real transcription only, then the transcript is proxied as
  // the message. A missing STT provider is an honest 503, never a fake
  // "[voice input]" string fed into the agent.
  if (body.voice && body.audio) {
    const transcript = await transcribeVoice(body.audio);
    if (transcript instanceof NextResponse) {
      return transcript;
    }
    message = transcript;
    if (!message.trim()) {
      return NextResponse.json(
        { error: 'Voice transcription returned no text', code: 'STT_EMPTY' },
        { status: 422 },
      );
    }
  }

  if (typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'Missing required field: input' }, { status: 400 });
  }

  if (message.length > MAX_INPUT_LENGTH) {
    return NextResponse.json(
      { error: `Input exceeds maximum length of ${MAX_INPUT_LENGTH} characters` },
      { status: 400 },
    );
  }

  // Build the backend payload from scratch — body.userId / body.confirmed /
  // body.confirmedSteps are deliberately absent here. The backend derives the
  // user from the verified JWT and holds confirmation server-side.
  const backendBody = {
    message,
    sessionId:
      typeof body.sessionId === 'string' && body.sessionId.length > 0
        ? body.sessionId.slice(0, 128)
        : `session-${Date.now()}`,
    stream: true,
    dryRun: body.dryRun === true,
  };

  const abortController = new AbortController();
  request.signal.addEventListener('abort', () => {
    abortController.abort();
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: authHeader,
  };
  // The backend also accepts the HttpOnly session cookie — forward it so
  // cookie-based sessions keep working across the proxy seam.
  const cookie = request.headers.get('cookie');
  if (cookie) {
    headers['cookie'] = cookie;
  }
  headers['x-request-id'] = request.headers.get('x-request-id') ?? crypto.randomUUID();

  let upstream: Response;
  try {
    upstream = await fetch(`${QUANTAI_BACKEND_URL}/agentic/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(backendBody),
      signal: abortController.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return new NextResponse(null, { status: 499 });
    }
    return NextResponse.json(
      {
        success: false,
        error: 'Agent backend is unreachable. Please try again in a moment.',
        code: 'UPSTREAM_UNAVAILABLE',
      },
      { status: 503 },
    );
  }

  if (!upstream.ok) {
    // Relay the backend's verdict verbatim. A 401 here IS the real JWT
    // verification result — fail closed, never fall back to anonymous.
    const text = await upstream.text().catch(() => '');
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  }

  if (!upstream.body) {
    return NextResponse.json(
      {
        success: false,
        error: 'Agent backend returned an empty response',
        code: 'UPSTREAM_EMPTY',
      },
      { status: 502 },
    );
  }

  return new NextResponse(translateAgenticSse(upstream.body), {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

async function transcribeVoice(audioBase64: string): Promise<string | NextResponse> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Voice transcription is not configured on this server. Please set OPENAI_API_KEY to enable voice input.',
        code: 'VOICE_NOT_CONFIGURED',
      },
      { status: 503 },
    );
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(audioBase64, 'base64');
  } catch {
    return NextResponse.json({ error: 'Invalid audio payload' }, { status: 400 });
  }
  if (audioBuffer.length === 0) {
    return NextResponse.json({ error: 'Empty audio payload' }, { status: 400 });
  }

  try {
    const stt = new SpeechToTextService({ apiKey });
    const result = await stt.transcribe(audioBuffer);
    return result.text;
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(
      { error: `Voice transcription failed: ${detail}`, code: 'STT_FAILED' },
      { status: 502 },
    );
  }
}

// ---------------------------------------------------------------------------
// SSE translation: backend `/agentic/chat` streams `data: {type: ...}` frames;
// the AskQuantPanel UI consumes named events (`event: <name>` + `data:`).
// Frames of unknown type are dropped rather than leaking new backend
// internals to the client.
// ---------------------------------------------------------------------------

function sseEvent(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function translateFrame(frame: string): string | null {
  const dataLines = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'));
  if (dataLines.length === 0) {
    return null;
  }
  const raw = dataLines
    .map((line) => line.slice(5).trim())
    .join('\n')
    .trim();
  if (!raw || raw === '[DONE]') {
    return null;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const type = typeof payload['type'] === 'string' ? payload['type'] : '';
  switch (type) {
    case 'plan':
      return sseEvent('plan_created', {
        plan: {
          id: payload['planId'],
          description: payload['description'],
          steps: payload['steps'],
        },
      });
    case 'tool_start':
      return sseEvent('step_start', {
        stepId: payload['stepId'],
        toolId: payload['toolId'],
      });
    case 'tool_result':
      return payload['success']
        ? sseEvent('step_complete', {
            stepId: payload['stepId'],
            toolId: payload['toolId'],
            result: { data: payload['data'] },
          })
        : sseEvent('step_failed', {
            stepId: payload['stepId'],
            toolId: payload['toolId'],
            error:
              typeof payload['error'] === 'string'
                ? payload['error']
                : 'Tool execution failed',
          });
    case 'confirmation_required':
      return sseEvent('confirmation_required', {
        planId: payload['planId'],
        reason: payload['reason'],
        steps: payload['steps'],
      });
    case 'error':
      return sseEvent('error', {
        error:
          typeof payload['message'] === 'string'
            ? payload['message']
            : 'Agent backend error',
      });
    case 'text':
      return sseEvent('text', { delta: payload['delta'] ?? '' });
    case 'done':
      return sseEvent('done', {});
    default:
      return null;
  }
}

function translateAgenticSse(backendBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = backendBody.getReader();
  let buffer = '';
  let closed = false;
  let inactivityTimer: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    if (closed) {
      return;
    }
    closed = true;
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = undefined;
    }
  };

  const armInactivityTimer = (onTimeout: () => void) => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    inactivityTimer = setTimeout(() => {
      void reader.cancel().catch(() => undefined);
      onTimeout();
    }, STREAM_INACTIVITY_TIMEOUT_MS);
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const fail = (message: string) => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(sseEvent('error', { error: message })));
        finish();
        controller.close();
      };
      armInactivityTimer(() =>
        fail('Stream timeout: the agent backend did not respond within 60s'),
      );
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          armInactivityTimer(() =>
            fail('Stream timeout: the agent backend did not respond within 60s'),
          );
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const translated = translateFrame(frame);
            if (translated) {
              controller.enqueue(encoder.encode(translated));
            }
          }
        }
        const tail = translateFrame(buffer);
        if (tail) {
          controller.enqueue(encoder.encode(tail));
        }
        finish();
        controller.close();
      } catch (err) {
        fail(err instanceof Error ? err.message : 'Stream error');
      }
    },
    cancel() {
      finish();
      void reader.cancel().catch(() => undefined);
    },
  });
}
