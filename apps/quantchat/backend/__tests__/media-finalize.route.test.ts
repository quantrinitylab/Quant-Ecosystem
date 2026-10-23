// ============================================================================
// QC-F-573 — POST /media/:id/finalize route tests.
//
// The REAL media plugin is mounted on a bare Fastify instance with a fake
// Prisma media table and a stub object storage injected via register
// options (stable module-level identities — no fresh-identity mocks).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import * as crypto from 'node:crypto';
import mediaRoutes from '../routes/media';
import { createMediaPrismaFake, StubObjectStorage } from './fake-media-stack';

const OWNER = { userId: 'user_finalize_owner' };
const STRANGER = { userId: 'user_finalize_stranger' };

type AppErrorLike = Error & { statusCode?: number; code?: string };

async function buildMediaApp(
  storage: StubObjectStorage | null | undefined,
): Promise<{ app: FastifyInstance; storage: StubObjectStorage }> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _request, reply) => {
    const e = err as AppErrorLike;
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  app.addHook('preHandler', async (req) => {
    const userId = req.headers['x-test-user-id'];
    if (typeof userId === 'string' && userId) {
      (req as unknown as { auth: unknown }).auth = {
        userId,
        username: userId,
        email: '',
        role: 'user',
        scopes: [],
        sessionId: 'sess_test',
        app: 'quantchat',
        tokenId: 'tok_test',
      };
    }
  });
  const { prisma } = createMediaPrismaFake();
  // undefined -> fresh stub; null -> no storage at all (fail-closed path).
  const stub = storage === undefined ? new StubObjectStorage() : storage;
  // The route plugin accepts injected prisma + storage (production wires the
  // fastify-decorated prisma and the env-derived S3 storage).
  await app.register(mediaRoutes, { prefix: '/media', prisma, storage: stub });
  await app.ready();
  return { app, storage: stub as StubObjectStorage };
}

async function presignAs(app: FastifyInstance, userId: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/media/upload-url',
    headers: { 'x-test-user-id': userId },
    payload: { filename: 'voice-note.webm', contentType: 'audio/webm' },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as { mediaId: string; uploadUrl: string };
}

describe('QC-F-573 POST /media/:id/finalize', () => {
  let app: FastifyInstance;
  let storage: StubObjectStorage;

  beforeEach(async () => {
    ({ app, storage } = await buildMediaApp(new StubObjectStorage()));
  });

  afterEach(async () => {
    await app.close();
  });

  it('unauthenticated finalize is denied 401 UNAUTHORIZED', async () => {
    const mediaId = `media_${crypto.randomUUID()}`;
    const res = await app.inject({
      method: 'POST',
      url: `/media/${mediaId}/finalize`,
      payload: { filename: 'voice-note.webm', contentType: 'audio/webm' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('full pipeline: presign -> PUT bytes -> finalize -> idempotent re-finalize -> owner GET', async () => {
    const { mediaId } = await presignAs(app, OWNER.userId);
    // Simulate the browser PUT of the real blob bytes.
    storage.putObject(
      `${OWNER.userId}/${mediaId}/voice-note.webm`,
      new Uint8Array([10, 20, 30]),
      'audio/webm',
    );

    const fin = await app.inject({
      method: 'POST',
      url: `/media/${mediaId}/finalize`,
      headers: { 'x-test-user-id': OWNER.userId },
      payload: { filename: 'voice-note.webm', contentType: 'audio/webm', durationMs: 4100 },
    });
    expect(fin.statusCode).toBe(200);
    const meta = fin.json().data;
    expect(meta.mediaId).toBe(mediaId);
    expect(meta.userId).toBe(OWNER.userId);
    expect(meta.url).toContain('stub-storage.test');

    // Idempotent re-finalize: same row back, no duplicate.
    const fin2 = await app.inject({
      method: 'POST',
      url: `/media/${mediaId}/finalize`,
      headers: { 'x-test-user-id': OWNER.userId },
      payload: { filename: 'voice-note.webm', contentType: 'audio/webm', durationMs: 4100 },
    });
    expect(fin2.statusCode).toBe(200);
    expect(fin2.json().data.mediaId).toBe(mediaId);
    expect(fin2.json().data.url).toBe(meta.url);

    // Owner can read the durable metadata.
    const get = await app.inject({
      method: 'GET',
      url: `/media/${mediaId}`,
      headers: { 'x-test-user-id': OWNER.userId },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.mediaId).toBe(mediaId);
  });

  it('finalize of an existing row by a stranger is 403 NOT_MEDIA_OWNER', async () => {
    const { mediaId } = await presignAs(app, OWNER.userId);
    storage.putObject(
      `${OWNER.userId}/${mediaId}/voice-note.webm`,
      new Uint8Array([1]),
      'audio/webm',
    );
    const fin = await app.inject({
      method: 'POST',
      url: `/media/${mediaId}/finalize`,
      headers: { 'x-test-user-id': OWNER.userId },
      payload: { filename: 'voice-note.webm', contentType: 'audio/webm' },
    });
    expect(fin.statusCode).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: `/media/${mediaId}/finalize`,
      headers: { 'x-test-user-id': STRANGER.userId },
      payload: { filename: 'voice-note.webm', contentType: 'audio/webm' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_MEDIA_OWNER');
  });

  it('finalize without an uploaded object is 404 MEDIA_NOT_UPLOADED', async () => {
    const { mediaId } = await presignAs(app, OWNER.userId);
    const res = await app.inject({
      method: 'POST',
      url: `/media/${mediaId}/finalize`,
      headers: { 'x-test-user-id': OWNER.userId },
      payload: { filename: 'voice-note.webm', contentType: 'audio/webm' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('MEDIA_NOT_UPLOADED');
  });

  it('finalize rejects a disallowed content type with 400 INVALID_CONTENT_TYPE', async () => {
    const mediaId = `media_${crypto.randomUUID()}`;
    const res = await app.inject({
      method: 'POST',
      url: `/media/${mediaId}/finalize`,
      headers: { 'x-test-user-id': OWNER.userId },
      payload: { filename: 'voice-note.wav', contentType: 'audio/wav' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_CONTENT_TYPE');
  });
});

describe('QC-F-573 fail-closed without storage', () => {
  it('presign without storage is 503 STORAGE_NOT_CONFIGURED, never a simulated URL', async () => {
    const { app } = await buildMediaApp(null);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/media/upload-url',
        headers: { 'x-test-user-id': OWNER.userId },
        payload: { filename: 'voice-note.webm', contentType: 'audio/webm' },
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('STORAGE_NOT_CONFIGURED');
      // No URL of any kind leaks out of a fail-closed response.
      expect(res.body).not.toContain('uploadUrl');
    } finally {
      await app.close();
    }
  });
});
