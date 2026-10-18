// ============================================================================
// QC-F-493 — the stories 12 Mi-char mediaUrl cap was unreachable in transport
//
// QC-F-330 gave POST /stories a deliberate 12,582,912-char mediaUrl cap so a
// real inline `data:` photo story (the shipped client's only photo path)
// could persist. But neither createApp nor the stories route set a
// bodyLimit, so Fastify's default 1 MiB bodyLimit rejected every JSON body
// over ~1,048,516 chars with 413 BEFORE zod/validation ever ran — real
// media was capped at ~786 KB and almost every gallery video died in
// transport. The QC-F-330 S-series never caught it: its payloads are ~6 KB
// on the same default-limited bare-Fastify harness.
//
// Fix (specialist-qc-f-493-buildprep.md §5.2, band): POST /stories alone
// gets a per-route `bodyLimit: 13_631_488` (13 MiB — the cap plus the JSON
// envelope). The zod cap and the media-url validator remain the real bound;
// no other route's limit changes.
//
// Negative control (against the ORIGINAL route): B1/B2 come back 413
// instead of 201 (FAIL); B3 comes back 413 instead of the honest 400
// (FAIL). B4 is a control — small payloads always passed.
//
// Harness is the qc-f-330 buildRouteApp pattern; helper params take the
// REAL decorated PrismaClient type (the `unknown`-param pattern broke CI
// typecheck in PR #903/#905); the fake is cast at construction.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// routes/stories pulls services that transitively load @quant/auth in some
// environments (see qc-f-330 header); stub it so the suite stays loadable.
vi.mock('@quant/auth', () => ({
  passwordService: {
    verify: async () => false,
    hash: async () => 'stub-hash',
  },
}));

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import storiesRoutes from '../routes/stories';

const OWNER = 'user-1';

// ---------------------------------------------------------------------------
// Bare-Fastify harness (qc-f-330 pattern)
// ---------------------------------------------------------------------------
async function buildRouteApp(
  prisma: PrismaClient,
  register: (app: FastifyInstance) => Promise<void>,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _request, reply) => {
    const e = err as Error & { statusCode?: number; code?: string };
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate('prisma', prisma);
  app.addHook('preHandler', async (req) => {
    (req as unknown as { auth: unknown }).auth = { userId: OWNER, username: 'user1' };
  });
  await register(app);
  await app.ready();
  return app;
}

describe('QC-F-493 stories bodyLimit (route level)', () => {
  let storyCreate: ReturnType<typeof vi.fn>;
  let app: FastifyInstance;

  beforeEach(async () => {
    storyCreate = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'story-1',
      userId: OWNER,
      type: data['type'],
      mediaUrl: data['mediaUrl'] ?? null,
      textContent: data['textContent'] ?? null,
      duration: data['duration'],
      viewCount: 0,
      audience: data['audience'],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600_000),
      user: { id: OWNER, displayName: 'User One', avatarUrl: null },
    }));
    const fakePrisma = { story: { create: storyCreate } } as unknown as PrismaClient;
    app = await buildRouteApp(fakePrisma, async (a) => {
      await a.register(storiesRoutes, { prefix: '/stories' });
    });
  });
  afterEach(async () => {
    await app.close();
  });

  const postStory = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/stories', payload });

  it('B1: a real-size data: photo (~2M chars, over the old 1 MiB transport limit) is accepted and persisted verbatim', async () => {
    const mediaUrl = `data:image/jpeg;base64,${'A'.repeat(2_000_000)}`;
    const res = await postStory({ type: 'photo', mediaUrl });
    expect(res.statusCode).toBe(201);
    expect(storyCreate).toHaveBeenCalledTimes(1);
    const call = storyCreate.mock.calls[0] as unknown as [{ data: { mediaUrl: string } }];
    expect(call[0].data.mediaUrl).toBe(mediaUrl);
  });

  it('B2: mediaUrl at exactly the 12,582,912-char cap is accepted and persisted verbatim', async () => {
    const prefix = 'data:image/jpeg;base64,';
    const mediaUrl = prefix + 'A'.repeat(12_582_912 - prefix.length);
    expect(mediaUrl.length).toBe(12_582_912);
    const res = await postStory({ type: 'photo', mediaUrl });
    expect(res.statusCode).toBe(201);
    expect(storyCreate).toHaveBeenCalledTimes(1);
    const call = storyCreate.mock.calls[0] as unknown as [{ data: { mediaUrl: string } }];
    expect(call[0].data.mediaUrl).toBe(mediaUrl);
  });

  it('B3: mediaUrl one char over the cap is an honest 400 (the cap is the bound), NOT a transport 413', async () => {
    const prefix = 'data:image/jpeg;base64,';
    const mediaUrl = prefix + 'A'.repeat(12_582_913 - prefix.length);
    expect(mediaUrl.length).toBe(12_582_913);
    const res = await postStory({ type: 'photo', mediaUrl });
    expect(res.statusCode).toBe(400);
    expect(res.statusCode).not.toBe(413);
    expect(storyCreate).not.toHaveBeenCalled();
  });

  it('B4 (controls): small data:video still posts; video-placeholder is still rejected 400 on the new path', async () => {
    const r1 = await postStory({ type: 'video', mediaUrl: 'data:video/mp4;base64,AAAA' });
    expect(r1.statusCode).toBe(201);
    const r2 = await postStory({ type: 'video', mediaUrl: 'video-placeholder' });
    expect(r2.statusCode).toBe(400);
    expect(r2.json()).toMatchObject({ success: false, error: { code: 'MEDIA_URL_NOT_ALLOWED' } });
    expect(storyCreate).toHaveBeenCalledTimes(1);
  });
});
