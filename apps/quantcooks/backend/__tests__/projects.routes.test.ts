// ============================================================================
// First route-level tests for /projects (P0-1).
//
// The projects route previously had zero tests — and zero working behavior,
// since it called a Prisma model that did not exist. These tests mount ONLY
// the projects routes on a bare Fastify instance with the fake EditProject
// delegate as `fastify.prisma` and a stub auth hook (the route reads
// request.auth.userId, normally populated by server-core's auth plugin).
// They cover POST/GET /projects end to end through the real route + real
// Prisma-backed ProjectService, including the restart property: a second
// app instance over the same store still serves the project.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import projectsRoutes from '../routes/projects';
import { createFakeEditProjectPrisma } from './fake-edit-project-prisma';

type FakePrisma = ReturnType<typeof createFakeEditProjectPrisma>;

async function buildProjectsApp(prisma: FakePrisma, userId: string | null) {
  const app = Fastify();
  // Test harness only: the fake implements the narrow delegate surface the
  // service under test uses, not the full generated PrismaClient (all model
  // delegates + $on/$connect/$disconnect/$executeRaw/...). The cast is
  // confined to the Fastify decoration; services still receive the fake
  // through their own narrow-typed constructors/adapters. Precedent:
  // quantchat otp-request / qc-f-118 tests use the same cast.
  app.decorate('prisma', prisma as unknown as PrismaClient);
  if (userId !== null) {
    app.addHook('onRequest', async (request) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId };
    });
  }
  await app.register(projectsRoutes, { prefix: '/projects' });
  await app.ready();
  return app;
}

describe('projects routes', () => {
  let prisma: FakePrisma;
  let app: FastifyInstance;

  beforeEach(() => {
    prisma = createFakeEditProjectPrisma();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('POST /projects creates a project and returns 201', async () => {
    app = await buildProjectsApp(prisma, 'user-1');

    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Launch Video', type: 'video' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.userId).toBe('user-1');
    expect(body.data.name).toBe('Launch Video');
    expect(body.data.type).toBe('video');
    expect(body.data.deletedAt).toBeNull();
  });

  it('GET /projects returns only the caller’s projects, paginated', async () => {
    app = await buildProjectsApp(prisma, 'user-1');

    await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Mine 1', type: 'video' },
    });
    await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Mine 2', type: 'image' },
    });

    // A project owned by someone else, written straight into the store.
    const otherApp = await buildProjectsApp(prisma, 'user-2');
    await otherApp.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Theirs', type: 'audio' },
    });
    await otherApp.close();

    const res = await app.inject({ method: 'GET', url: '/projects' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(2);
    expect(body.data.data).toHaveLength(2);
    expect(body.data.data.map((p: { name: string }) => p.name).sort()).toEqual([
      'Mine 1',
      'Mine 2',
    ]);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(20);
  });

  it('GET /projects honors page/pageSize', async () => {
    app = await buildProjectsApp(prisma, 'user-1');

    for (const name of ['P1', 'P2', 'P3']) {
      await app.inject({ method: 'POST', url: '/projects', payload: { name, type: 'video' } });
    }

    const res = await app.inject({ method: 'GET', url: '/projects?page=2&pageSize=2' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.total).toBe(3);
    expect(body.data.totalPages).toBe(2);
    expect(body.data.data).toHaveLength(1);
    expect(body.data.hasNext).toBe(false);
    expect(body.data.hasPrev).toBe(true);
  });

  it('a project created by one app instance is served by a fresh instance (restart)', async () => {
    app = await buildProjectsApp(prisma, 'user-1');

    const created = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Persisted', type: 'video' },
    });
    const id = created.json().data.id as string;
    await app.close();

    // Simulate a backend restart: brand-new Fastify app + route + service,
    // same underlying store. The old in-memory stack could never pass this.
    app = await buildProjectsApp(prisma, 'user-1');
    const res = await app.inject({ method: 'GET', url: `/projects/${id}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('Persisted');
  });

  it('POST /projects without auth is rejected 401', async () => {
    app = await buildProjectsApp(prisma, null);

    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Nope', type: 'video' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /projects?type= filters by project type (P0-2)', async () => {
    app = await buildProjectsApp(prisma, 'user-1');

    await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Clip', type: 'video' },
    });
    await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Poster', type: 'image' },
    });

    const res = await app.inject({ method: 'GET', url: '/projects?type=image' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.total).toBe(1);
    expect(body.data.data[0].name).toBe('Poster');
  });

  it('POST /projects/:id/duplicate creates a (Copy) through the route', async () => {
    app = await buildProjectsApp(prisma, 'user-1');

    const created = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Original', type: 'video' },
    });
    const id = created.json().data.id as string;

    const res = await app.inject({ method: 'POST', url: `/projects/${id}/duplicate` });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.id).not.toBe(id);
    expect(body.data.name).toBe('Original (Copy)');
  });
});
