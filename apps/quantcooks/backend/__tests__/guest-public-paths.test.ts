import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

// ============================================================================
// Prisma double for the FULL app (P0-6 gate follow-up).
//
// This suite builds the real app via buildApp, so `fastify.prisma` comes
// from server-core's prisma plugin = @quant/database's singleton client.
// Since P0-3 the AssetService behind the public GET /assets/project/:id
// path is Prisma-backed (editAsset.findMany), so the suite needs the app
// to run over a working prisma double — before P0-3 the service was
// in-memory and this suite needed none, which is why the gap stayed
// hidden while the suite was import-blocked in no-install environments
// (where @prisma/client resolves to a stub whose every query throws).
//
// The double is assembled from this repo's own delegate fakes — the same
// ones the per-service suites inject through the DI seam — so the guest
// path is asserted against AssetService's CURRENT real call shape
// (editAsset.findMany with where.projectId + orderBy.createdAt). Only the
// `prisma` export is replaced; every other @quant/database export is the
// real module's.
// ============================================================================
vi.mock('@quant/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@quant/database')>();
  const { createFakeEditAssetPrisma } = await import('./fake-edit-asset-prisma');
  const { createFakeEditProjectPrisma } = await import('./fake-edit-project-prisma');
  const { createFakeEditLayerPrisma } = await import('./fake-edit-layer-prisma');
  const { createFakeEditExportPrisma } = await import('./fake-edit-export-prisma');
  const { createFakeEditCraftRenderPrisma } = await import('./fake-edit-craft-render-prisma');
  const { createFakeEditPhotoEditPrisma } = await import('./fake-edit-photo-edit-prisma');

  const prisma = {
    editAsset: createFakeEditAssetPrisma().editAsset,
    editProject: createFakeEditProjectPrisma().editProject,
    editLayer: createFakeEditLayerPrisma().editLayer,
    editExportJob: createFakeEditExportPrisma().editExportJob,
    editCraftRenderJob: createFakeEditCraftRenderPrisma().editCraftRenderJob,
    editPhotoEditJob: createFakeEditPhotoEditPrisma().editPhotoEditJob,
    $connect: async () => {},
    $disconnect: async () => {},
  };

  return { ...actual, prisma: prisma as unknown as typeof actual.prisma };
});

describe('quantedits guest public paths (unauthenticated access)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config: AppConfig = {
      ...getConfig(),
      logLevel: 'silent',
      env: 'test',
    };
    app = await buildApp(config);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows guest to access GET /templates and returns public templates', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.templates).toBeDefined();
  });

  it('allows guest to access GET /effects and returns public effects', async () => {
    const res = await app.inject({ method: 'GET', url: '/effects' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.effects).toBeDefined();
  });

  it('allows guest to access GET /effects/categories', async () => {
    const res = await app.inject({ method: 'GET', url: '/effects/categories' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.categories).toBeDefined();
  });

  it('allows guest to access GET /assets/project/:projectId', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/project/test-proj-1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('rejects guest attempting mutating POST /export with 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/export',
      payload: { projectId: 'test-proj-1' },
    });
    expect(res.statusCode).toBe(401);
  });
});
