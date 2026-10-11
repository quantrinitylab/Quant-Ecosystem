// F-112 regression: POST /api/ask must be a thin AUTHENTICATED proxy.
// It must never plan/execute tools itself, never accept a client-controlled
// userId, and never honor client-asserted confirmation. Auth is verified on
// the backend (real JWT verification); this route forwards the bearer
// verbatim and relays the backend's verdict, failing closed.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from '../route';

const AUTH = 'Bearer real-user-jwt';

interface CapturedCall {
  url: string;
  init: RequestInit | undefined;
}

let captured: CapturedCall[];

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  captured = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url: String(url), init });
      return handler(url, init);
    }),
  );
}

function backendSseStream(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function postJson(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/ask (F-112 authenticated proxy)', () => {
  it('fails closed with 401 when the Authorization header is missing', async () => {
    const res = await POST(postJson({ input: 'hello' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 400 for missing or empty input', async () => {
    for (const body of [{}, { input: '' }, { input: '   ' }, { voice: true }]) {
      const res = await POST(postJson(body, { authorization: AUTH }));
      expect(res.status).toBe(400);
    }
  });

  it('returns 400 for oversized input', async () => {
    const res = await POST(
      postJson({ input: 'x'.repeat(2001) }, { authorization: AUTH }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/maximum length/);
  });

  it('strips userId/confirmed/confirmedSteps and forwards the bearer verbatim', async () => {
    stubFetch(() => backendSseStream([JSON.stringify({ type: 'done' })]));

    const res = await POST(
      postJson(
        {
          input: 'send an email',
          sessionId: 'sess-9',
          dryRun: true,
          userId: 'mallory',
          confirmed: true,
          confirmedSteps: ['step-1'],
        },
        { authorization: AUTH },
      ),
    );

    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('http://localhost:3004/agentic/chat');
    const sentHeaders = new Headers(captured[0]!.init?.headers);
    expect(sentHeaders.get('authorization')).toBe(AUTH);
    const sentBody = JSON.parse(String(captured[0]!.init?.body)) as Record<string, unknown>;
    // Spoofable / client-asserted fields must never reach the backend.
    expect(sentBody).not.toHaveProperty('userId');
    expect(sentBody).not.toHaveProperty('confirmed');
    expect(sentBody).not.toHaveProperty('confirmedSteps');
    // Only the sanctioned fields go through.
    expect(sentBody).toEqual({
      message: 'send an email',
      sessionId: 'sess-9',
      stream: true,
      dryRun: true,
    });
  });

  it('relays the backend 401 for a garbage token (fail closed, no anonymous run)', async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const res = await POST(
      postJson({ input: 'do something' }, { authorization: 'Bearer garbage-token-xyz' }),
    );
    // The presence-only check of the old route would have let this through;
    // now the backend's real JWT verification rejects it and we relay 401.
    expect(res.status).toBe(401);
    expect(captured).toHaveLength(1);
  });

  it('returns 503 (never anonymous execution) when the backend is unreachable', async () => {
    stubFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });

    const res = await POST(postJson({ input: 'do something' }, { authorization: AUTH }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('translates backend SSE frames to the panel named-event format', async () => {
    stubFetch(() =>
      backendSseStream([
        JSON.stringify({
          type: 'plan',
          planId: 'plan-1',
          description: 'Send the email',
          steps: [{ stepId: 's1', toolId: 'quantmail.send', params: {} }],
        }),
        JSON.stringify({ type: 'tool_start', stepId: 's1', toolId: 'quantmail.send' }),
        JSON.stringify({
          type: 'tool_result',
          stepId: 's1',
          toolId: 'quantmail.send',
          success: true,
          data: { ok: true },
        }),
        JSON.stringify({
          type: 'tool_result',
          stepId: 's2',
          toolId: 'quantmail.send',
          success: false,
          error: 'quota exceeded',
        }),
        JSON.stringify({
          type: 'confirmation_required',
          planId: 'plan-9',
          reason: 'tier-2 tool',
          steps: [{ stepId: 's3', toolId: 'quantmail.send' }],
        }),
        JSON.stringify({ type: 'mystery-future-event', foo: 1 }),
        JSON.stringify({ type: 'done' }),
      ]),
    );

    const res = await POST(postJson({ input: 'hi' }, { authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();

    expect(text).toContain('event: plan_created');
    expect(text).toContain('"id":"plan-1"');
    expect(text).toContain('event: step_start');
    expect(text).toContain('event: step_complete');
    expect(text).toContain('event: step_failed');
    expect(text).toContain('"error":"quota exceeded"');
    // The held-plan id survives translation so the confirm round-trip works.
    expect(text).toContain('event: confirmation_required');
    expect(text).toContain('"planId":"plan-9"');
    expect(text).toContain('event: done');
    // Unknown backend internals are dropped, not leaked.
    expect(text).not.toContain('mystery-future-event');
  });

  it('fails voice closed with 503 when no STT provider is configured', async () => {
    const saved = process.env['OPENAI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    try {
      stubFetch(() => backendSseStream([JSON.stringify({ type: 'done' })]));
      const audio = Buffer.from('fake-audio').toString('base64');
      const res = await POST(
        postJson({ voice: true, audio }, { authorization: AUTH }),
      );
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.code).toBe('VOICE_NOT_CONFIGURED');
      // No STT, no transcription, no backend call.
      expect(captured).toHaveLength(0);
    } finally {
      if (saved !== undefined) {
        process.env['OPENAI_API_KEY'] = saved;
      }
    }
  });
});
