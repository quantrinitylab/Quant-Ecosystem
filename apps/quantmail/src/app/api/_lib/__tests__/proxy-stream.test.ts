// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../proxy';

/**
 * fix/qm-quantgit-ci-logs-stream: proxyToBackend must stream SSE
 * (text/event-stream) responses through untouched instead of
 * `await res.json()`-ing them (which either hangs until the stream closes or
 * throws into a 502 INVALID_RESPONSE) and never setting the Content-Type a
 * browser EventSource requires.
 */

const LOGS_PATH = '/api/ci/builds/build-123/logs';
const BACKEND_LOGS = '/ci/builds/build-123/logs';

const sseResponse = (chunks: string[]): Response =>
  new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    },
  );

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const getRequest = (path = LOGS_PATH): NextRequest =>
  new NextRequest(`http://localhost:3000${path}`, { method: 'GET' });

describe('proxyToBackend SSE stream-through', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pipes an SSE response untouched with SSE headers when stream:true', async () => {
    const chunks = [
      'id: 0\nevent: connected\ndata: {"status":"connected"}\n\n',
      'event: log\ndata: {"line":"npm run build"}\n\n',
    ];
    fetchMock.mockResolvedValueOnce(sseResponse(chunks));

    const res = await proxyToBackend(getRequest(), BACKEND_LOGS, { stream: true });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    // Body is the raw SSE stream, byte-for-byte — not JSON-wrapped.
    expect(await res.text()).toBe(chunks.join(''));
  });

  it('streams automatically when the backend answers text/event-stream even without the option', async () => {
    // Regression: the old code did `await res.json()` on this and 502'd.
    fetchMock.mockResolvedValueOnce(sseResponse(['data: {"line":"hi"}\n\n']));

    const res = await proxyToBackend(getRequest(), BACKEND_LOGS);

    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(await res.text()).toBe('data: {"line":"hi"}\n\n');
  });

  it('forwards the backend connection header on streamed responses', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(['data: x\n\n']));

    const res = await proxyToBackend(getRequest(), BACKEND_LOGS, { stream: true });

    expect(res.headers.get('connection')).toBe('keep-alive');
  });

  it('still JSON-buffers ordinary JSON responses (unchanged behavior)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));

    const res = await proxyToBackend(getRequest('/api/emails'), '/emails');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ success: true, data: [] });
  });

  it('JSON-buffers backend JSON errors on a stream route — honest error, never a fake stream', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { success: false, error: { code: 'BUILD_NOT_FOUND', message: 'Build not found' } },
        404,
      ),
    );

    const res = await proxyToBackend(getRequest(), '/ci/builds/nope/logs', { stream: true });

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.error.code).toBe('BUILD_NOT_FOUND');
  });

  it('returns an honest 502 BACKEND_UNAVAILABLE when the backend is unreachable on a stream route', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const res = await proxyToBackend(getRequest(), BACKEND_LOGS, { stream: true });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('BACKEND_UNAVAILABLE');
  });

  it('streams chunked SSE bodies incrementally (no full-buffer hang)', async () => {
    // The old `await res.json()` would never resolve on an open stream; the
    // streamed body must be readable chunk-by-chunk.
    fetchMock.mockResolvedValueOnce(sseResponse(['chunk-1\n\n', 'chunk-2\n\n']));

    const res = await proxyToBackend(getRequest(), BACKEND_LOGS, { stream: true });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let received = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
    }
    expect(received).toBe('chunk-1\n\nchunk-2\n\n');
  });
});
