import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import bitmojiRoutes from '../routes/bitmoji';

// QC-F-089 — the /bitmoji editor's data layer was a phantom: the page called
// GET /api/bitmoji/current + POST /api/bitmoji/save and apiClient called
// GET /bitmoji/me, POST /bitmoji, PUT /bitmoji, but no backend route, Next
// proxy, or storage existed — Save always failed and a saved avatar never
// loaded back. These tests pin the real backend at the route layer: the
// caller's config persists verbatim in their own BitmojiConfig row, a
// never-saved caller gets an honest `config: null` (never invented
// defaults), invalid bodies are rejected without storing anything, and
// one user can never read or overwrite another user's config.

const CALLER = 'u-caller';
const OTHER = 'u-other';

const CONFIG = {
  faceShape: 'oval',
  skinTone: '#EDB98A',
  hairStyle: 'curly',
  hairColor: '#FF4500',
  eyeShape: 'almond',
  eyeColor: '#2E536F',
  noseShape: 'small',
  mouthShape: 'smile',
  eyebrowShape: 'arched',
  facialHair: 'none',
  outfit: 'hoodie',
  outfitColor: '#123456',
  accessories: ['glasses'],
  background: '#FFFC00',
};

interface FakeRow {
  userId: string;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function makeFakePrisma() {
  const rows = new Map<string, FakeRow>();
  const prisma = {
    bitmojiConfig: {
      async findUnique({ where }: { where: { userId: string } }) {
        return rows.get(where.userId) ?? null;
      },
      async upsert({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: { userId: string; config: unknown };
        update: { config: unknown };
      }) {
        const existing = rows.get(where.userId);
        const row: FakeRow = existing
          ? { ...existing, config: update.config, updatedAt: new Date('2026-02-02T00:00:00.000Z') }
          : {
              userId: create.userId,
              config: create.config,
              createdAt: new Date('2026-02-01T00:00:00.000Z'),
              updatedAt: new Date('2026-02-01T00:00:00.000Z'),
            };
        rows.set(where.userId, row);
        return row;
      },
    },
  };
  return { prisma, rows };
}

function errorCode(res: { json: () => unknown }): string {
  return (res.json() as { error: { code: string } }).error.code;
}

describe('QC-F-089 bitmoji routes (real persistence)', () => {
  let app: FastifyInstance;
  let authUserId: string | null;
  let rows: Map<string, FakeRow>;

  async function makeApp(withPrisma: boolean): Promise<FastifyInstance> {
    const fake = makeFakePrisma();
    rows = fake.rows;
    const instance = Fastify({ logger: false });
    await instance.register(errorHandlerPlugin);
    if (withPrisma) {
      (instance as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
        'prisma',
        fake.prisma,
      );
    }
    instance.addHook('preHandler', async (request) => {
      if (authUserId) {
        (request as unknown as { auth: { userId: string } }).auth = { userId: authUserId };
      }
    });
    await instance.register(bitmojiRoutes, { prefix: '/bitmoji' });
    await instance.ready();
    return instance;
  }

  beforeEach(async () => {
    authUserId = CALLER;
    app = await makeApp(true);
  });

  afterEach(async () => {
    await app.close();
  });

  it('fails closed 401 without auth on every bitmoji route', async () => {
    authUserId = null;
    const get = await app.inject({ method: 'GET', url: '/bitmoji/me' });
    expect(get.statusCode).toBe(401);
    expect(errorCode(get)).toBe('UNAUTHORIZED');

    for (const method of ['POST', 'PUT'] as const) {
      const res = await app.inject({ method, url: '/bitmoji', payload: { config: CONFIG } });
      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe('UNAUTHORIZED');
    }
    expect(rows.size).toBe(0);
  });

  it('a caller who never saved gets config: null — no invented defaults', async () => {
    const res = await app.inject({ method: 'GET', url: '/bitmoji/me' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; data: { config: unknown; updatedAt: unknown } };
    expect(body.success).toBe(true);
    expect(body.data.config).toBeNull();
    expect(body.data.updatedAt).toBeNull();
  });

  it('POST saves the config verbatim and GET /me returns it (round-trip)', async () => {
    const save = await app.inject({ method: 'POST', url: '/bitmoji', payload: { config: CONFIG } });
    expect(save.statusCode).toBe(201);
    const saved = (save.json() as { data: { config: unknown } }).data;
    expect(saved.config).toEqual(CONFIG);
    expect(rows.get(CALLER)?.config).toEqual(CONFIG);

    const load = await app.inject({ method: 'GET', url: '/bitmoji/me' });
    expect(load.statusCode).toBe(200);
    const loaded = (load.json() as { data: { config: unknown; updatedAt: string } }).data;
    expect(loaded.config).toEqual(CONFIG);
    expect(loaded.updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('PUT updates the same single row instead of piling up copies', async () => {
    await app.inject({ method: 'POST', url: '/bitmoji', payload: { config: CONFIG } });
    const updated = { ...CONFIG, hairColor: '#4169E1', accessories: [] as string[] };
    const res = await app.inject({ method: 'PUT', url: '/bitmoji', payload: { config: updated } });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { config: unknown } }).data.config).toEqual(updated);
    expect(rows.size).toBe(1);

    const load = await app.inject({ method: 'GET', url: '/bitmoji/me' });
    expect((load.json() as { data: { config: unknown } }).data.config).toEqual(updated);
  });

  it('invalid bodies are a 400 and store nothing', async () => {
    const missing = await app.inject({ method: 'POST', url: '/bitmoji', payload: { config: {} } });
    expect(missing.statusCode).toBe(400);
    expect(errorCode(missing)).toBe('VALIDATION_ERROR');

    const badAccessories = await app.inject({
      method: 'POST',
      url: '/bitmoji',
      payload: { config: { ...CONFIG, accessories: 'glasses' } },
    });
    expect(badAccessories.statusCode).toBe(400);
    expect(errorCode(badAccessories)).toBe('VALIDATION_ERROR');

    const blankField = await app.inject({
      method: 'PUT',
      url: '/bitmoji',
      payload: { config: { ...CONFIG, faceShape: '' } },
    });
    expect(blankField.statusCode).toBe(400);

    const noEnvelope = await app.inject({ method: 'POST', url: '/bitmoji', payload: CONFIG });
    expect(noEnvelope.statusCode).toBe(400);

    expect(rows.size).toBe(0);
  });

  it("one user never sees or overwrites another user's config", async () => {
    await app.inject({ method: 'POST', url: '/bitmoji', payload: { config: CONFIG } });

    authUserId = OTHER;
    const load = await app.inject({ method: 'GET', url: '/bitmoji/me' });
    expect((load.json() as { data: { config: unknown } }).data.config).toBeNull();

    const otherConfig = { ...CONFIG, hairStyle: 'bun' };
    await app.inject({ method: 'POST', url: '/bitmoji', payload: { config: otherConfig } });
    expect(rows.size).toBe(2);
    expect(rows.get(CALLER)?.config).toEqual(CONFIG);
    expect(rows.get(OTHER)?.config).toEqual(otherConfig);
  });

  it('fails honestly 503 when the database is unavailable', async () => {
    const bare = await makeApp(false);
    try {
      const res = await bare.inject({ method: 'GET', url: '/bitmoji/me' });
      expect(res.statusCode).toBe(503);
      expect(errorCode(res)).toBe('DB_UNAVAILABLE');
    } finally {
      await bare.close();
    }
  });
});
