// ===========================================================================
// QC-F-031 — media metadata BOLA regression tests (GET /media/:id)
// ===========================================================================
//
// GET /media/:id returned any media's metadata — including the plain storage
// URL, which embeds the uploader's userId and the original filename — to ANY
// logged-in user. The route handler never extracted the caller's identity
// and MediaService.getMediaMetadata had no requester parameter at all, so
// no ownership check was even possible. MediaMetadata carries no
// conversation linkage (only the owner userId), so the implementable gate
// today is owner-only; the conversation-member case from the brief is N/A
// until a linkage model exists (brief §4.3/§6, recorded in the build report).
//
// Fix: the service takes the requester and enforces existence (404
// MEDIA_NOT_FOUND) then ownership (403 NOT_MEDIA_OWNER) — the same order
// and error family as MessageService's NOT_MESSAGE_OWNER precedent — and
// the route extracts request.auth.userId with a fail-closed 401 (the exact
// pattern of the sibling upload-url handler in the same file). deleteMedia
// is hardened with the same gate (brief §4.4): it has no route yet, so a
// future DELETE endpoint is fail-closed by construction.
//
// Route tests mount the REAL media plugin on a bare Fastify instance. A
// preHandler hook installs `request.auth` per request exactly the way the
// real auth plugin does (from a test header standing in for the verified
// token); a minimal error handler mirrors the server-core AppError mapping.
// The route plugin owns ONE in-memory MediaService instance, so seeding
// happens through the real POST /media/upload-url flow on the same app.
// Identities are stable module-level constants (no fresh-identity mocks).
//
// Every authorization test FAILS against the pre-fix code (verified by
// negative control) and passes with the fix.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import mediaRoutes from '../routes/media';
import { MediaService } from '../services/media.service';

// Stable identities (module-level).
const OWNER = { userId: 'user_media_owner', username: 'mediaowner' };
const STRANGER = { userId: 'user_media_stranger', username: 'mediastranger' };

type AppErrorLike = Error & { statusCode?: number; code?: string };

async function expectAppError(
  promise: Promise<unknown>,
  statusCode: number,
  code: string,
): Promise<AppErrorLike> {
  try {
    await promise;
  } catch (err) {
    const e = err as AppErrorLike;
    expect(e.statusCode).toBe(statusCode);
    expect(e.code).toBe(code);
    return e;
  }
  throw new Error(`Expected ${code} (${statusCode}) but the call succeeded`);
}

// ---------------------------------------------------------------------------
// Service level
// ---------------------------------------------------------------------------

describe('QC-F-031 MediaService.getMediaMetadata owner gate', () => {
  let service: MediaService;
  let mediaId: string;

  beforeEach(async () => {
    service = new MediaService();
    const upload = await service.generateUploadUrl(OWNER.userId, 'photo.jpg', 'image/jpeg');
    mediaId = upload.mediaId;
  });

  it('owner succeeds and gets the full metadata record', async () => {
    const meta = await service.getMediaMetadata(mediaId, OWNER.userId);
    expect(meta.mediaId).toBe(mediaId);
    expect(meta.userId).toBe(OWNER.userId);
    expect(meta.filename).toBe('photo.jpg');
    expect(meta.contentType).toBe('image/jpeg');
    expect(meta.url).toContain(`${OWNER.userId}/${mediaId}/photo.jpg`);
  });

  it('non-owner is denied 403 NOT_MEDIA_OWNER and the error leaks nothing', async () => {
    const err = await expectAppError(
      service.getMediaMetadata(mediaId, STRANGER.userId),
      403,
      'NOT_MEDIA_OWNER',
    );
    expect(err.message).toBe('Only the media owner can access this media');
    // The denial must not smuggle the leaked fields out in the error itself.
    expect(err.message).not.toContain('photo.jpg');
    expect(JSON.stringify(err)).not.toContain(mediaId);
  });

  it('nonexistent media is 404 MEDIA_NOT_FOUND for owner and stranger alike', async () => {
    await expectAppError(
      service.getMediaMetadata('media_does-not-exist', OWNER.userId),
      404,
      'MEDIA_NOT_FOUND',
    );
    await expectAppError(
      service.getMediaMetadata('media_does-not-exist', STRANGER.userId),
      404,
      'MEDIA_NOT_FOUND',
    );
  });

  it('deleteMedia: non-owner is denied and the record survives; owner can delete', async () => {
    await expectAppError(service.deleteMedia(mediaId, STRANGER.userId), 403, 'NOT_MEDIA_OWNER');
    // Record intact after the failed delete — the owner can still read it.
    const meta = await service.getMediaMetadata(mediaId, OWNER.userId);
    expect(meta.mediaId).toBe(mediaId);

    await service.deleteMedia(mediaId, OWNER.userId);
    await expectAppError(service.getMediaMetadata(mediaId, OWNER.userId), 404, 'MEDIA_NOT_FOUND');
  });

  it('deleteMedia: nonexistent media is 404 MEDIA_NOT_FOUND', async () => {
    await expectAppError(
      service.deleteMedia('media_does-not-exist', OWNER.userId),
      404,
      'MEDIA_NOT_FOUND',
    );
  });
});

// ---------------------------------------------------------------------------
// Route level — the real plugin, per-request auth installed by a preHandler
// ---------------------------------------------------------------------------

async function buildMediaApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Mirror of server-core error-handler's AppError branch.
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
  // Install request.auth the way the real auth plugin does, per request,
  // from the (test) verified identity header. No header → no auth at all.
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
  await app.register(mediaRoutes, { prefix: '/media' });
  await app.ready();
  return app;
}

describe('QC-F-031 GET /media/:id route gate', () => {
  let app: FastifyInstance;
  let mediaId: string;

  beforeEach(async () => {
    app = await buildMediaApp();
    // Seed through the real upload-url flow, as the owner, on this same app
    // (the plugin's MediaService instance is per-app in-memory).
    const upload = await app.inject({
      method: 'POST',
      url: '/media/upload-url',
      headers: { 'x-test-user-id': OWNER.userId },
      payload: { filename: 'photo.jpg', contentType: 'image/jpeg' },
    });
    expect(upload.statusCode).toBe(201);
    mediaId = upload.json().data.mediaId as string;
    expect(mediaId).toBeTruthy();
  });

  afterEach(async () => {
    await app.close();
  });

  it('unauthenticated request is denied 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'GET', url: `/media/${mediaId}` });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('owner gets 200 with their metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/media/${mediaId}`,
      headers: { 'x-test-user-id': OWNER.userId },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.mediaId).toBe(mediaId);
    expect(body.data.userId).toBe(OWNER.userId);
    expect(body.data.filename).toBe('photo.jpg');
  });

  it('a different logged-in user gets 403 NOT_MEDIA_OWNER and no leaked fields', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/media/${mediaId}`,
      headers: { 'x-test-user-id': STRANGER.userId },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_MEDIA_OWNER');
    // The response must not carry the metadata it is protecting.
    expect(res.body).not.toContain('photo.jpg');
    expect(res.body).not.toContain(OWNER.userId);
    expect(res.body).not.toContain('s3.amazonaws.com');
  });

  it('nonexistent media is 404 MEDIA_NOT_FOUND for an authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/media/media_does-not-exist',
      headers: { 'x-test-user-id': OWNER.userId },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('MEDIA_NOT_FOUND');
  });
});
