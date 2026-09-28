// @vitest-environment node
// ============================================================================
// quantneon — photo album route seam tests
// ============================================================================
//
// Exercises the album-listing route logic in `routes/photos.ts` through a real
// Fastify `inject()` pipeline, with a MOCK prisma decorator (no DB, no network)
// and the REAL `@quant/server-core` error handler so thrown `AppError`s map to
// the production `{ success:false, error:{ code, statusCode } }` envelope.
//
// The global auth hook from `createApp()` is NOT present here (we build a bare
// Fastify app on purpose to isolate the route logic), so we replicate the ONE
// thing the routes depend on: `request.auth.userId`. A small `preHandler`
// binds it from an `x-test-user` header, mirroring how the real auth plugin
// decorates the request. Absent header => no `request.auth` => the route's own
// guard throws `UNAUTHORIZED`, which is exactly the behavior under test.
//
// Routes covered:
//   - GET /photos/albums            -> listAlbumsByUser(caller)  (user-scoped)
//   - GET /photos/albums/:id/photos -> getAlbum(id) then listByAlbum(id)
//
// Route ordering: the static `/albums` and `/albums/:id/photos` paths do not
// collide with the parametric `/albums/:id` (distinct path segments), proven by
// `/albums` returning the album LIST rather than being captured as an `:id`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import photosRoutes from '../routes/photos';

function createMockPrisma() {
  return {
    photo: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    photoAlbum: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

let app: FastifyInstance;
let prisma: MockPrisma;

beforeEach(async () => {
  prisma = createMockPrisma();
  app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);

  // Replicate the single request contract the routes rely on: when an
  // `x-test-user` header is present, bind `request.auth.userId`. Otherwise the
  // route's own `createAppError('Authentication required', 401, …)` guard fires.
  app.addHook('preHandler', async (request) => {
    const testUser = request.headers['x-test-user'];
    if (typeof testUser === 'string' && testUser.length > 0) {
      (request as unknown as { auth: { userId: string } }).auth = { userId: testUser };
    }
  });

  await app.register(photosRoutes, { prefix: '/photos' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('GET /photos/albums (list my albums)', () => {
  it('returns the caller albums, scoped to the authenticated user, newest-first', async () => {
    const albums = [
      { id: 'album-2', userId: 'user-1', name: 'Recent', photoCount: 1, visibility: 'PUBLIC' },
      { id: 'album-1', userId: 'user-1', name: 'Older', photoCount: 3, visibility: 'PUBLIC' },
    ];
    prisma.photoAlbum.findMany.mockResolvedValue(albums);

    const res = await app.inject({
      method: 'GET',
      url: '/photos/albums',
      headers: { 'x-test-user': 'user-1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: albums });
    // User-scoped: the caller's id from `request.auth`, not a path/query value.
    expect(prisma.photoAlbum.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('scopes to a DIFFERENT caller when a different user is authenticated', async () => {
    prisma.photoAlbum.findMany.mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/photos/albums',
      headers: { 'x-test-user': 'user-2' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: [] });
    expect(prisma.photoAlbum.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-2' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('unauthenticated request -> 401 UNAUTHORIZED (service never reached)', async () => {
    const res = await app.inject({ method: 'GET', url: '/photos/albums' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
    expect(prisma.photoAlbum.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /photos/albums/:id/photos (album contents)', () => {
  it('verifies the album exists then returns its paginated photos newest-first', async () => {
    prisma.photoAlbum.findUnique.mockResolvedValue({
      id: 'album-1',
      userId: 'user-1',
      name: 'Vacation',
      visibility: 'PUBLIC',
    });
    prisma.photo.findMany.mockResolvedValue([{ id: 'photo-1' }, { id: 'photo-2' }]);
    prisma.photo.count.mockResolvedValue(2);

    const res = await app.inject({
      method: 'GET',
      url: '/photos/albums/album-1/photos?page=1&pageSize=20',
      headers: { 'x-test-user': 'user-1' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.data).toHaveLength(2);
    expect(body.data.total).toBe(2);
    expect(body.data.totalPages).toBe(1);
    expect(body.data.hasNext).toBe(false);

    // Album-existence check ran first (getAlbum), then the album was listed.
    expect(prisma.photoAlbum.findUnique).toHaveBeenCalledWith({ where: { id: 'album-1' } });
    expect(prisma.photo.findMany).toHaveBeenCalledWith({
      where: { albumId: 'album-1', deletedAt: null },
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('missing album -> 404 ALBUM_NOT_FOUND (photos never listed)', async () => {
    prisma.photoAlbum.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/photos/albums/missing/photos',
      headers: { 'x-test-user': 'user-1' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'ALBUM_NOT_FOUND' } });
    expect(prisma.photo.findMany).not.toHaveBeenCalled();
  });

  it('unauthenticated request -> 401 UNAUTHORIZED (album never read)', async () => {
    const res = await app.inject({ method: 'GET', url: '/photos/albums/album-1/photos' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
    expect(prisma.photoAlbum.findUnique).not.toHaveBeenCalled();
  });

  it('rejects invalid pagination query -> 400 VALIDATION_ERROR', async () => {
    prisma.photoAlbum.findUnique.mockResolvedValue({ id: 'album-1', userId: 'user-1' });

    const res = await app.inject({
      method: 'GET',
      url: '/photos/albums/album-1/photos?page=0',
      headers: { 'x-test-user': 'user-1' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });
});
