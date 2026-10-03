/**
 * sse-transport.test.ts — vitest for ../sse-transport.ts
 *
 * NOT executed in staging — run at merge time (vitest).
 * Staging me fastify/vitest deps nahi hain; ye tests mock-based hain (fake reply/req objects).
 * Merge-time run: `vitest run phase2/repo-staging/ai-streaming/__tests__/`
 */

import { describe, expect, it, vi } from 'vitest';
import { createSseStream } from '../sse-transport';

// ---------------------------------------------------------------------------
// Fakes (prior shifts ki tarah mock-based)
// ---------------------------------------------------------------------------

interface FakeReply {
  hijacked: boolean;
  headers: Record<string, string>;
  chunks: string[];
  ended: boolean;
  hijack(): void;
  header(k: string, v: string): FakeReply;
  raw: { write(c: string): boolean; end(): void };
}

interface FakeReq {
  closeHandlers: Array<() => void>;
  raw: { on(e: string, cb: () => void): void };
  __emitClose(): void;
}

function makeReply(): FakeReply {
  const r: FakeReply = {
    hijacked: false,
    headers: {},
    chunks: [],
    ended: false,
    hijack() {
      r.hijacked = true;
    },
    header(k: string, v: string) {
      r.headers[k] = v;
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

function makeReq(): FakeReq {
  const q: FakeReq = {
    closeHandlers: [],
    raw: {
      on(e: string, cb: () => void) {
        if (e === 'close') q.closeHandlers.push(cb);
      },
    },
    __emitClose() {
      for (const cb of q.closeHandlers) cb();
    },
  };
  return q;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createSseStream', () => {
  it('hijacks the reply and sets the SSE headers', () => {
    const reply = makeReply();
    const req = makeReq();
    const s = createSseStream(reply as any, req as any);
    try {
      expect(reply.hijacked).toBe(true);
      expect(reply.headers['Content-Type']).toBe('text/event-stream');
      expect(reply.headers['Cache-Control']).toBe('no-cache');
      expect(reply.headers['Connection']).toBe('keep-alive');
      expect(reply.headers['X-Accel-Buffering']).toBe('no');
    } finally {
      s.close();
    }
  });

  it('writeFrame produces exact bytes: data: <JSON>\\n\\n', () => {
    const reply = makeReply();
    const s = createSseStream(reply as any, makeReq() as any);
    s.writeFrame({ type: 'token', delta: 'hi' });
    s.close();
    expect(reply.chunks[0]).toBe('data: {"type":"token","delta":"hi"}\n\n');
  });

  it('newlines inside JSON are escaped — a frame is always a single data line', () => {
    const reply = makeReply();
    const s = createSseStream(reply as any, makeReq() as any);
    s.writeFrame({ type: 'token', delta: 'a\nb' });
    s.close();
    expect(reply.chunks[0]).toBe('data: {"type":"token","delta":"a\\nb"}\n\n');
    expect(reply.chunks[0].split('\n').filter(Boolean)).toHaveLength(1);
  });

  it('emits heartbeat comments (: ping) on the configured interval', async () => {
    const reply = makeReply();
    const s = createSseStream(reply as any, makeReq() as any, { heartbeatMs: 30 });
    await sleep(110);
    s.close();
    const pings = reply.chunks.filter((c) => c === ': ping\n\n');
    expect(pings.length).toBeGreaterThanOrEqual(2);
  });

  it('close() clears the heartbeat timer — no more pings after close', async () => {
    const reply = makeReply();
    const s = createSseStream(reply as any, makeReq() as any, { heartbeatMs: 30 });
    await sleep(80);
    s.close();
    const countAtClose = reply.chunks.filter((c) => c === ': ping\n\n').length;
    await sleep(90);
    expect(reply.chunks.filter((c) => c === ': ping\n\n').length).toBe(countAtClose);
    expect(reply.ended).toBe(true);
  });

  it("req 'close' → aborted=true, signal aborted, writes become no-ops", () => {
    const reply = makeReply();
    const req = makeReq();
    const s = createSseStream(reply as any, req as any);
    expect(s.aborted).toBe(false);
    req.__emitClose();
    expect(s.aborted).toBe(true);
    expect(s.signal.aborted).toBe(true);
    const n = reply.chunks.length;
    s.writeFrame({ type: 'token', delta: 'late' });
    expect(reply.chunks.length).toBe(n);
    s.close();
  });

  it('done() writes the [DONE] terminator and ends the response', () => {
    const reply = makeReply();
    const s = createSseStream(reply as any, makeReq() as any);
    s.writeMeta('req-1', 'model-x');
    s.done();
    const joined = reply.chunks.join('');
    expect(joined).toContain('data: [DONE]\n\n');
    expect(joined).toContain('"type":"meta"');
    expect(reply.ended).toBe(true);
  });

  it('writeError emits an error frame (type/code/message) and never [DONE]', () => {
    const reply = makeReply();
    const s = createSseStream(reply as any, makeReq() as any);
    s.writeToken('partial');
    s.writeError('STREAM_FAILED', 'AI stream failed');
    const joined = reply.chunks.join('');
    expect(joined).toContain('data: {"type":"error","code":"STREAM_FAILED","message":"AI stream failed"}\n\n');
    expect(joined).not.toContain('[DONE]');
    expect(reply.ended).toBe(true);
  });

  it('ttfbMs(): null before the first token, number >= 0 after', async () => {
    const reply = makeReply();
    const startedAt = Date.now() - 25;
    const s = createSseStream(reply as any, makeReq() as any, { startedAt });
    expect(s.ttfbMs()).toBeNull();
    await sleep(5);
    s.writeToken('x');
    const ttfb = s.ttfbMs();
    expect(typeof ttfb).toBe('number');
    expect(ttfb!).toBeGreaterThanOrEqual(0);
    s.writeUsage(-1, -1);
    s.close();
    const usage = JSON.parse(reply.chunks[1].slice('data: '.length));
    expect(usage.type).toBe('usage');
    expect(usage.ttfbMs).toBe(ttfb);
    expect(usage.inputTokens).toBe(-1);
    expect(usage.outputTokens).toBe(-1);
  });

  it('writes after close() are no-ops and never throw', () => {
    const reply = makeReply();
    const s = createSseStream(reply as any, makeReq() as any);
    s.close();
    const n = reply.chunks.length;
    expect(() => {
      s.writeFrame({ a: 1 });
      s.writeToken('x');
      s.done();
      s.close();
    }).not.toThrow();
    expect(reply.chunks.length).toBe(n);
  });
});
