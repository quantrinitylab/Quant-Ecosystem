/**
 * sse-transport.ts — REAL SSE transport layer for QuantMail AI streaming (P0-6, W2).
 *
 * QuantAI precedent-compatible framing (RESEARCH.md Q4 — app-foundations/quantai/openapi.yaml:2487-2512):
 *   - `data: <JSON>\n\n` frames, terminator `data: [DONE]`
 *   - auth + zod validation ALWAYS happen BEFORE hijack (caller ki zimmedari — ye module hijack karta hai,
 *     isliye isko sirf saare pre-checks ke baad call karo)
 *
 * Staging note: `fastify` sirf type-only import hai (runtime dep nahi). `node:crypto` sirf requestId
 * fallback ke liye. Koi @quant/* runtime import nahi — merge-time par bhi nahi chahiye.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';

export interface SseMetaPayload {
  type: 'meta';
  requestId: string;
  model: string;
}

export interface SseTokenPayload {
  type: 'token';
  delta: string;
}

export interface SseUsagePayload {
  type: 'usage';
  /** -1 = provider ne counts expose nahi kiye (TODO(UNVERIFIED): AIEngine.stream StreamChunk counts) */
  inputTokens: number;
  outputTokens: number;
  /** handler-start se first token frame tak ka ms */
  ttfbMs: number;
}

export interface SseErrorPayload {
  type: 'error';
  code: string;
  message: string;
}

export interface SseStreamOptions {
  /** heartbeat comment interval; default 15_000ms */
  heartbeatMs?: number;
  /** handler-start timestamp (Date.now()); default: stream creation time */
  startedAt?: number;
}

export interface SseStream {
  /** client disconnect par abort hota hai — provider loop ko ye signal do */
  readonly signal: AbortSignal;
  readonly aborted: boolean;
  /** koi byte wire par gaya ya nahi (error-mapping decision ke liye) */
  readonly firstByteSent: boolean;
  readonly closed: boolean;
  writeFrame(obj: unknown): void;
  writeMeta(requestId: string, model: string): void;
  /** pehle token par TTFB record hota hai */
  writeToken(delta: string): void;
  writeUsage(inputTokens: number, outputTokens: number): void;
  /** mid-stream error: error frame bhejkar close — [DONE] NAHI bheja jata */
  writeError(code: string, message: string): void;
  /** normal terminator: `data: [DONE]` phir close */
  done(): void;
  /** bina terminator ke close (abort / pre-first-byte error paths) */
  close(): void;
  /** first token tak ka ms; null jab tak koi token na aaya ho */
  ttfbMs(): number | null;
  /** requestId fallback jab caller request.id na de */
  newRequestId(): string;
}

const DEFAULT_HEARTBEAT_MS = 15_000;

export function createSseStream(
  reply: FastifyReply,
  req: FastifyRequest,
  opts: SseStreamOptions = {},
): SseStream {
  // Hijack FIRST — iske baad Fastify ka normal JSON error path available nahi hai.
  // Isliye caller (ai-streaming.ts) auth/zod/rate-limit/metering SAB hijack se pehle karta hai.
  reply.hijack();
  reply.header('Content-Type', 'text/event-stream');
  reply.header('Cache-Control', 'no-cache');
  reply.header('Connection', 'keep-alive');
  reply.header('X-Accel-Buffering', 'no'); // nginx buffering off — proxies ke peeche flush guarantee

  const raw = (reply as unknown as { raw: { write(c: string): unknown; end(): unknown } }).raw;
  const rawReq = (req as unknown as { raw: { on(e: string, cb: () => void): unknown } }).raw;

  const controller = new AbortController();
  const startedAt = opts.startedAt ?? Date.now();
  const heartbeatMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;

  let aborted = false;
  let firstByteSent = false;
  let closed = false;
  let ended = false;
  let firstTokenAt: number | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  function cleanup(): void {
    if (heartbeat !== null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    closed = true;
  }

  function end(): void {
    cleanup();
    if (!ended) {
      ended = true;
      try {
        raw.end();
      } catch {
        /* socket already gone — nothing to do */
      }
    }
  }

  function writeRaw(s: string): void {
    if (closed || aborted) return;
    try {
      raw.write(s);
    } catch {
      // socket died without 'close' firing — aage ke writes no-op
      aborted = true;
      try {
        controller.abort();
      } catch {
        /* noop */
      }
      return;
    }
    firstByteSent = true;
  }

  // Disconnect: client ne connection kaat di → provider loop abort + timer cleanup.
  rawReq.on('close', () => {
    aborted = true;
    try {
      controller.abort();
    } catch {
      /* noop */
    }
    cleanup();
  });

  heartbeat = setInterval(() => {
    writeRaw(': ping\n\n'); // SSE comment — client ignore karta hai, proxies ko alive rakhta hai
  }, heartbeatMs);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  const stream: SseStream = {
    get signal() {
      return controller.signal;
    },
    get aborted() {
      return aborted;
    },
    get firstByteSent() {
      return firstByteSent;
    },
    get closed() {
      return closed;
    },

    writeFrame(obj: unknown): void {
      // JSON.stringify \n ko \\n escape karta hai — frame me kabhi raw newline nahi aata.
      writeRaw(`data: ${JSON.stringify(obj)}\n\n`);
    },

    writeMeta(requestId: string, model: string): void {
      const payload: SseMetaPayload = { type: 'meta', requestId, model };
      stream.writeFrame(payload);
    },

    writeToken(delta: string): void {
      if (firstTokenAt === null) firstTokenAt = Date.now();
      const payload: SseTokenPayload = { type: 'token', delta };
      stream.writeFrame(payload);
    },

    writeUsage(inputTokens: number, outputTokens: number): void {
      const payload: SseUsagePayload = {
        type: 'usage',
        inputTokens,
        outputTokens,
        ttfbMs: stream.ttfbMs() ?? -1,
      };
      stream.writeFrame(payload);
    },

    writeError(code: string, message: string): void {
      const payload: SseErrorPayload = { type: 'error', code, message };
      stream.writeFrame(payload);
      end(); // error ke baad [DONE] kabhi nahi
    },

    done(): void {
      if (!aborted && !closed) writeRaw('data: [DONE]\n\n');
      end();
    },

    close(): void {
      end();
    },

    ttfbMs(): number | null {
      return firstTokenAt === null ? null : firstTokenAt - startedAt;
    },

    newRequestId(): string {
      return randomUUID();
    },
  };

  return stream;
}
