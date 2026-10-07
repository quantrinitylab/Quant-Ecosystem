/**
 * ai-streaming.routes.test.ts — vitest for ../ai-streaming.ts
 *
 * NOT executed in staging — run at merge time (vitest).
 * Staging me fastify/vitest/zod deps nahi hain; ye tests mock-based hain
 * (fake Fastify instance + fake reply/req + fake AIStreamProvider).
 * Merge-time run: `vitest run phase2/repo-staging/ai-streaming/__tests__/`
 */

import { describe, expect, it, vi } from 'vitest';
import {
  aiStreamingRoutes,
  createTokenBucketRateLimiter,
  type AIStreamProvider,
  type AIStreamingOptions,
  type StreamMetering,
} from '../routes/ai-streaming';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type Handler = (req: any, reply: any) => Promise<void>;

function makeFastify() {
  const routes: Array<{ method: string; url: string; handler: Handler }> = [];
  return {
    routes,
    post(url: string, handler: Handler) {
      routes.push({ method: 'POST', url, handler });
    },
  };
}

function makeReply() {
  const r: any = {
    hijacked: false,
    headers: {} as Record<string, string>,
    chunks: [] as string[],
    ended: false,
    statusCode: 200,
    hijack() {
      r.hijacked = true;
    },
    header(k: string, v: string) {
      r.headers[k] = v;
      return r;
    },
    code(n: number) {
      r.statusCode = n;
      return r;
    },
    raw: {
      write(c: string) {
        r.chunks.push(c);
        return true;
      },
      end() {
        r.ended = true;
      },
    },
  };
  return r;
}

function makeReq(overrides: Record<string, any> = {}) {
  const closeHandlers: Array<() => void> = [];
  const q: any = {
    id: 'req-1',
    auth: { userId: 'user-1' },
    body: {},
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    raw: {
      on(e: string, cb: () => void) {
        if (e === 'close') closeHandlers.push(cb);
      },
    },
    __emitClose() {
      for (const cb of closeHandlers) cb();
    },
    ...overrides,
  };
  return q;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Captured {
  prompt: string;
  model?: string;
  signal?: AbortSignal;
}

/** Fake provider: yields chunks; can throw at setup or mid-iteration. */
function fakeProvider(
  chunks: string[],
  captured: Captured,
  opts: { throwAtSetup?: any; throwAfterChunks?: number; throwError?: any } = {},
): AIStreamProvider {
  return {
    streamText(prompt: string, o: { signal: AbortSignal; model?: string }) {
      captured.prompt = prompt;
      captured.model = o.model;
      captured.signal = o.signal;
      if (opts.throwAtSetup) throw opts.throwAtSetup;
      const self = this;
      return (async function* () {
        void self;
        let n = 0;
        for (const c of chunks) {
          if (o.signal.aborted) return;
          if (opts.throwAfterChunks !== undefined && n >= opts.throwAfterChunks) {
            throw opts.throwError ?? new Error('mid-stream boom');
          }
          n += 1;
          yield c;
        }
      })();
    },
  };
}

function recordingMetering(reserveResult: { ok: true } | { ok: false; code: string }): {
  metering: StreamMetering;
  calls: { reserve: number; settle: number };
} {
  const calls = { reserve: 0, settle: 0 };
  const metering: StreamMetering = {
    reserve: async () => {
      calls.reserve += 1;
      return reserveResult as any;
    },
    settle: async () => {
      calls.settle += 1;
    },
  };
  return { metering, calls };
}

async function register(opts: Partial<AIStreamingOptions> & { streamProvider: AIStreamProvider }) {
  const fastify = makeFastify();
  await aiStreamingRoutes(fastify as any, {
    rateLimitPerMin: 1000, // tests default: limiter out of the way unless overridden
    ...opts,
  } as AIStreamingOptions);
  return fastify;
}

function route(fastify: ReturnType<typeof makeFastify>, url: string): Handler {
  const r = fastify.routes.find((x) => x.url === url);
  if (!r) throw new Error(`route not found: ${url}`);
  return r.handler;
}

/** Raw chunks → parsed frames (data JSON | [DONE] | ping comment). */
function parseFrames(chunks: string[]): any[] {
  const out: any[] = [];
  for (const part of chunks.join('').split('\n\n')) {
    if (!part) continue;
    if (part === ': ping') {
      out.push({ comment: 'ping' });
      continue;
    }
    if (!part.startsWith('data: ')) {
      out.push({ raw: part });
      continue;
    }
    const payload = part.slice('data: '.length);
    if (payload === '[DONE]') {
      out.push({ done: true });
      continue;
    }
    out.push(JSON.parse(payload));
  }
  return out;
}

const SUMMARIZE_BODY = { subject: 'Hi', body: 'Hello world', from: 'alice@example.com' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('aiStreamingRoutes', () => {
  it('registers exactly 6 POST routes under /stream/*', async () => {
    const fastify = await register({ streamProvider: fakeProvider([], { prompt: '' }) });
    const urls = fastify.routes.map((r) => r.url).sort();
    expect(urls).toEqual(
      [
        '/stream/compose',
        '/stream/compose/improve',
        '/stream/reply',
        '/stream/summarize',
        '/stream/summarize-thread',
        '/stream/triage',
      ].sort(),
    );
    expect(fastify.routes.every((r) => r.method === 'POST')).toBe(true);
  });

  it('summarize happy path: meta → tokens → usage → [DONE]; prompt has field anchors', async () => {
    const captured: Captured = { prompt: '' };
    const fastify = await register({ streamProvider: fakeProvider(['Hello', ' world'], captured) });
    const reply = makeReply();
    await route(fastify, '/stream/summarize')(makeReq({ body: SUMMARIZE_BODY }), reply);

    const frames = parseFrames(reply.chunks);
    expect(frames[0]).toMatchObject({ type: 'meta', requestId: 'req-1' });
    expect(typeof frames[0].model).toBe('string');
    expect(frames[1]).toEqual({ type: 'token', delta: 'Hello' });
    expect(frames[2]).toEqual({ type: 'token', delta: ' world' });
    expect(frames[3].type).toBe('usage');
    expect(frames[3].ttfbMs).toBeGreaterThanOrEqual(0);
    expect(frames[3].inputTokens).toBe(-1); // unknown counts → -1
    expect(frames[4]).toEqual({ done: true });
    expect(reply.ended).toBe(true);

    expect(captured.prompt).toContain('From: alice@example.com');
    expect(captured.prompt).toContain('Subject: Hi');
    expect(captured.prompt).toContain('Hello world');
    expect(typeof captured.model).toBe('string');
  });

  it('summarize-thread prompt contains every message subject + count anchor', async () => {
    const captured: Captured = { prompt: '' };
    const fastify = await register({ streamProvider: fakeProvider(['x'], captured) });
    await route(fastify, '/stream/summarize-thread')(
      makeReq({
        body: {
          messages: [
            { from: 'a@x.com', subject: 'First subject', body: 'one' },
            { from: 'b@x.com', subject: 'Second subject', body: 'two', date: '2026-10-01' },
          ],
        },
      }),
      makeReply(),
    );
    expect(captured.prompt).toContain('First subject');
    expect(captured.prompt).toContain('Second subject');
    expect(captured.prompt).toContain('2 messages');
  });

  it('triage prompt carries the four category anchors', async () => {
    const captured: Captured = { prompt: '' };
    const fastify = await register({ streamProvider: fakeProvider(['x'], captured) });
    await route(fastify, '/stream/triage')(
      makeReq({ body: { subject: 's', body: 'b', from: 'f@x.com' } }),
      makeReply(),
    );
    for (const cat of ['act_now', 'delegate', 'read_later', 'ignore']) {
      expect(captured.prompt).toContain(cat);
    }
  });

  it('reply prompt carries the tone option anchor', async () => {
    const captured: Captured = { prompt: '' };
    const fastify = await register({ streamProvider: fakeProvider(['x'], captured) });
    await route(fastify, '/stream/reply')(
      makeReq({
        body: {
          email: { subject: 's', body: 'b', from: 'f@x.com' },
          options: { tone: 'friendly', includeGreeting: false },
        },
      }),
      makeReply(),
    );
    expect(captured.prompt).toContain('Tone: friendly');
    expect(captured.prompt).toContain('Do not include a greeting.');
  });

  it('compose prompt carries bullets + context anchors', async () => {
    const captured: Captured = { prompt: '' };
    const fastify = await register({ streamProvider: fakeProvider(['x'], captured) });
    await route(fastify, '/stream/compose')(
      makeReq({
        body: {
          bullets: ['launch on Friday', 'invite the team'],
          context: { recipient: 'team@x.com', tone: 'professional' },
        },
      }),
      makeReply(),
    );
    expect(captured.prompt).toContain('- launch on Friday');
    expect(captured.prompt).toContain('- invite the team');
    expect(captured.prompt).toContain('Recipient: team@x.com');
    expect(captured.prompt).toContain('Tone: professional');
  });

  it('compose/improve prompt carries draft + instructions anchors', async () => {
    const captured: Captured = { prompt: '' };
    const fastify = await register({ streamProvider: fakeProvider(['x'], captured) });
    await route(fastify, '/stream/compose/improve')(
      makeReq({ body: { draft: 'hey draft here', instructions: 'make it formal' } }),
      makeReply(),
    );
    expect(captured.prompt).toContain('hey draft here');
    expect(captured.prompt).toContain('make it formal');
  });

  it('invalid body → 400 VALIDATION_ERROR BEFORE hijack', async () => {
    const fastify = await register({ streamProvider: fakeProvider(['x'], { prompt: '' }) });
    const reply = makeReply();
    const err = await route(fastify, '/stream/summarize')(makeReq({ body: { subject: 'no from/body' } }), reply).catch(
      (e) => e,
    );
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(reply.hijacked).toBe(false);
    expect(reply.chunks).toHaveLength(0);
  });

  it('invalid enum (compose tone) → 400 before hijack', async () => {
    const fastify = await register({ streamProvider: fakeProvider(['x'], { prompt: '' }) });
    const reply = makeReply();
    const err = await route(fastify, '/stream/compose')(
      makeReq({ body: { bullets: ['a'], context: { tone: 'royal' } } }),
      reply,
    ).catch((e) => e);
    expect(err.statusCode).toBe(400);
    expect(reply.hijacked).toBe(false);
  });

  it('missing auth → 401 UNAUTHORIZED before hijack', async () => {
    const fastify = await register({ streamProvider: fakeProvider(['x'], { prompt: '' }) });
    const reply = makeReply();
    const err = await route(fastify, '/stream/summarize')(
      makeReq({ body: SUMMARIZE_BODY, auth: undefined }),
      reply,
    ).catch((e) => e);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(reply.hijacked).toBe(false);
  });

  it('rate limit exceeded → 429 RATE_LIMITED + Retry-After, before hijack', async () => {
    const fastify = await register({
      streamProvider: fakeProvider(['x'], { prompt: '' }),
      rateLimitPerMin: 1,
    });
    const h = route(fastify, '/stream/summarize');
    await h(makeReq({ body: SUMMARIZE_BODY }), makeReply()); // consumes the 1 token
    const reply = makeReply();
    const err = await h(makeReq({ body: SUMMARIZE_BODY }), reply).catch((e) => e);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
    expect(reply.headers['Retry-After']).toBe('60');
    expect(reply.hijacked).toBe(false);
  });

  it('metering reserve fail-closed → 402 INSUFFICIENT_CREDITS, before hijack, no settle', async () => {
    const { metering, calls } = recordingMetering({ ok: false, code: 'INSUFFICIENT_CREDITS' });
    const fastify = await register({ streamProvider: fakeProvider(['x'], { prompt: '' }), metering });
    const reply = makeReply();
    const err = await route(fastify, '/stream/summarize')(makeReq({ body: SUMMARIZE_BODY }), reply).catch(
      (e) => e,
    );
    expect(err.statusCode).toBe(402);
    expect(err.code).toBe('INSUFFICIENT_CREDITS');
    expect(reply.hijacked).toBe(false);
    expect(calls.reserve).toBe(1);
    expect(calls.settle).toBe(0);
  });

  it('metering QUOTA_EXHAUSTED → 429', async () => {
    const { metering } = recordingMetering({ ok: false, code: 'QUOTA_EXHAUSTED' });
    const fastify = await register({ streamProvider: fakeProvider(['x'], { prompt: '' }), metering });
    const err = await route(fastify, '/stream/triage')(
      makeReq({ body: { subject: 's', body: 'b', from: 'f' } }),
      makeReply(),
    ).catch((e) => e);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('QUOTA_EXHAUSTED');
  });

  it('provider setup throw (pre-first-byte) → handler throws, no error frame, no [DONE]', async () => {
    const fastify = await register({
      streamProvider: fakeProvider(['x'], { prompt: '' }, { throwAtSetup: new Error('no api key') }),
    });
    const reply = makeReply();
    const err = await route(fastify, '/stream/summarize')(makeReq({ body: SUMMARIZE_BODY }), reply).catch(
      (e) => e,
    );
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('AI_UNAVAILABLE');
    expect(reply.chunks).toHaveLength(0); // no error frame — first byte never sent
    expect(parseFrames(reply.chunks).some((f) => f.done)).toBe(false);
  });

  it('mid-stream throw after first token → error frame, NO [DONE], stream ended', async () => {
    const boom: any = new Error('provider died');
    boom.code = 'PROVIDER_DOWN';
    const fastify = await register({
      streamProvider: fakeProvider(['tok1', 'tok2'], { prompt: '' }, { throwAfterChunks: 1, throwError: boom }),
    });
    const reply = makeReply();
    await route(fastify, '/stream/summarize')(makeReq({ body: SUMMARIZE_BODY }), reply);
    const frames = parseFrames(reply.chunks);
    expect(frames[0]).toMatchObject({ type: 'meta' });
    expect(frames[1]).toEqual({ type: 'token', delta: 'tok1' });
    const errFrame = frames.find((f) => f.type === 'error');
    expect(errFrame).toMatchObject({ type: 'error', code: 'PROVIDER_DOWN' });
    expect(frames.some((f) => f.done)).toBe(false);
    expect(reply.ended).toBe(true);
  });

  it("client disconnect mid-stream → signal aborts, no [DONE], stream cleaned up", async () => {
    const captured: Captured = { prompt: '' };
    const provider: AIStreamProvider = {
      streamText(prompt: string, o: { signal: AbortSignal; model?: string }) {
        captured.prompt = prompt;
        captured.signal = o.signal;
        return (async function* () {
          yield 'a';
          while (!o.signal.aborted) await sleep(5); // wait for abort
        })();
      },
    };
    const fastify = await register({ streamProvider: provider });
    const req = makeReq({ body: SUMMARIZE_BODY });
    const reply = makeReply();
    const done = route(fastify, '/stream/summarize')(req, reply);
    // wait for the first token to hit the wire, then simulate disconnect
    for (let i = 0; i < 100 && !reply.chunks.join('').includes('"delta":"a"'); i++) await sleep(5);
    expect(reply.chunks.join('')).toContain('"delta":"a"');
    req.__emitClose();
    await done;
    expect(captured.signal!.aborted).toBe(true);
    expect(parseFrames(reply.chunks).some((f) => f.done)).toBe(false);
    expect(reply.ended).toBe(true);
  });

  it('usage frame records ttfbMs from handler start', async () => {
    const captured: Captured = { prompt: '' };
    const fastify = await register({ streamProvider: fakeProvider(['z'], captured) });
    const reply = makeReply();
    await route(fastify, '/stream/reply')(
      makeReq({ body: { email: { subject: 's', body: 'b', from: 'f@x.com' } } }),
      reply,
    );
    const usage = parseFrames(reply.chunks).find((f) => f.type === 'usage');
    expect(typeof usage.ttfbMs).toBe('number');
    expect(usage.ttfbMs).toBeGreaterThanOrEqual(0);
  });
});

describe('createTokenBucketRateLimiter', () => {
  it('allows burst up to capacity, then rejects until refill', () => {
    const limiter = createTokenBucketRateLimiter(2);
    expect(limiter.check('u1').ok).toBe(true);
    expect(limiter.check('u1').ok).toBe(true);
    const r = limiter.check('u1');
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBe(60);
  });

  it('buckets are per-user', () => {
    const limiter = createTokenBucketRateLimiter(1);
    expect(limiter.check('u1').ok).toBe(true);
    expect(limiter.check('u2').ok).toBe(true); // different user unaffected
    expect(limiter.check('u1').ok).toBe(false);
  });
});
