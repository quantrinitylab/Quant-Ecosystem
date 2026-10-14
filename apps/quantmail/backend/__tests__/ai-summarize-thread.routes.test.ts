// @vitest-environment node
// ============================================================================
// POST /ai/summarize-thread — reachable where the browser actually lands.
//
// Live bug (staging): every "Summarize" click on a thread showed "Could not
// generate summary". The browser posts to /api/ai/summarize-thread; the
// staging ingress rewrites /api/* straight to the backend ROOT, so the request
// arrives as /ai/summarize-thread — but the route only existed under /api/v1
// (aiServicesRoutes), and Fastify answered
//   404 "Route POST:/ai/summarize-thread not found".
// These tests pin the root registration and the handler contract.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';

const { summarizeThreadMock } = vi.hoisted(() => ({ summarizeThreadMock: vi.fn() }));

vi.mock('../services/ai-summarize.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/ai-summarize.service')>();
  class FakeSummarizeService {
    summarizeThread = summarizeThreadMock;
  }
  return { ...actual, AISummarizeService: FakeSummarizeService };
});

import { aiThreadSummaryRoutes } from '../routes/ai-services';

const MESSAGES = [
  {
    from: 'Priya Peer <qwpeer20261013@quantmail.in>',
    subject: 'Design review notes from Priya',
    body: 'Can we try it on Android Chrome before Friday?',
  },
];

let app: FastifyInstance;

async function build(userId: string | null = 'user-1') {
  const instance = Fastify();
  await instance.register(errorHandlerPlugin);
  instance.addHook('onRequest', async (request) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  // Mounted exactly as backend/app.ts does: no prefix.
  await instance.register(aiThreadSummaryRoutes);
  await instance.ready();
  return instance;
}

beforeEach(() => {
  summarizeThreadMock.mockReset();
  summarizeThreadMock.mockResolvedValue({
    summary: 'Priya wants an Android Chrome check before Friday.',
    keyPoints: ['Android Chrome test'],
    actionItems: ['Test on Android Chrome by Friday'],
    messageCount: 1,
  });
});

afterEach(async () => {
  await app?.close();
});

describe('POST /ai/summarize-thread at the backend root', () => {
  it('is registered at the path the staging ingress forwards to', async () => {
    app = await build();
    expect(app.hasRoute({ method: 'POST', url: '/ai/summarize-thread' })).toBe(true);
  });

  it('returns the service summary for the signed-in user', async () => {
    app = await build('user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/ai/summarize-thread',
      payload: { messages: MESSAGES },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        summary: 'Priya wants an Android Chrome check before Friday.',
        keyPoints: ['Android Chrome test'],
        actionItems: ['Test on Android Chrome by Friday'],
        messageCount: 1,
      },
    });
    expect(summarizeThreadMock).toHaveBeenCalledWith(MESSAGES, 'user-1');
  });

  it('rejects an unauthenticated call without reaching the AI service', async () => {
    app = await build(null);
    const res = await app.inject({
      method: 'POST',
      url: '/ai/summarize-thread',
      payload: { messages: MESSAGES },
    });
    expect(res.statusCode).toBe(401);
    expect(summarizeThreadMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed body with a 400, not a 500', async () => {
    app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/summarize-thread',
      payload: { messages: 'not-an-array' },
    });
    expect(res.statusCode).toBe(400);
    expect(summarizeThreadMock).not.toHaveBeenCalled();
  });

  it('surfaces a service failure as an error, never a fake summary', async () => {
    summarizeThreadMock.mockRejectedValueOnce(
      Object.assign(new Error('AI is not configured'), { statusCode: 503, code: 'AI_NOT_CONFIGURED' }),
    );
    app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/summarize-thread',
      payload: { messages: MESSAGES },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().success).toBe(false);
  });
});

describe('backend/app.ts wiring', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.ts'), 'utf8');

  it('mounts aiThreadSummaryRoutes at the root (no prefix)', () => {
    expect(appSource).toMatch(/app\.register\(aiThreadSummaryRoutes\);/);
  });

  it('keeps the /api/v1 registration for existing callers', () => {
    expect(appSource).toMatch(/app\.register\(aiServicesRoutes, \{ prefix: '\/api\/v1' \}\);/);
  });
});
