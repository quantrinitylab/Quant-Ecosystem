// @vitest-environment node
// ============================================================================
// fix/qm-drive-folder-colors-2 — PUT /drive/folders/:id/color route tests.
//
// Drive-style "Change color": a FIXED 16-swatch palette the backend
// validates every write against; null resets to the default tint. Files are
// rejected (400), unknown/foreign ids 404, anonymous callers 401.
// No fake data: every folder/file asserted here comes from the stubbed prisma
// queries below; an unknown id yields an honest 404, never invented state.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

vi.mock('@quant/ai', () => ({
  AIEngine: class {
    infer = vi.fn();
  },
}));

vi.mock('../services/drive-storage.service', () => ({
  DRIVE_MAX_BODY_BYTES: 10 * 1024 * 1024,
  DRIVE_MAX_FILE_BYTES: 10 * 1024 * 1024,
  checkedPlaintext: vi.fn(async () => Buffer.from('folders-bytes')),
  deleteDriveObject: vi.fn(async () => {}),
  driveObjectKey: vi.fn((userId: string, path: string) => `${userId}/${path}`),
  driveStorageReady: vi.fn(() => true),
  driveStorageUnavailableReason: vi.fn(() => null),
  encryptForDrive: vi.fn(() => ({
    ciphertext: Buffer.from('ciphertext'),
    iv: 'iv',
    authTag: 'tag',
    wrappedKey: 'wrapped-key',
    contentHash: 'hash-abc-123',
  })),
  putDriveObject: vi.fn(async () => {}),
  safeFileName: vi.fn((n: string) => n),
  hashFromVersionKey: vi.fn(() => null),
}));

interface Row {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  path: string;
  color: string | null;
  isDeleted: boolean;
}

let folders: Row[];
let files: { id: string; userId: string }[];
let lastUpdate: { where: unknown; data: unknown } | undefined;

const makeFolder = (overrides: Partial<Row> = {}): Row => ({
  id: 'fld-x',
  userId: 'user-owner',
  name: 'Docs',
  parentId: null,
  path: '/Docs',
  color: null,
  isDeleted: false,
  ...overrides,
});

function makePrisma() {
  return {
    user: {
      findUnique: vi.fn(async () => ({ displayName: 'Owner', email: 'owner@quantmail.in' })),
    },
    file: {
      findFirst: vi.fn(async (args: { where: { id: string; userId: string } }) =>
        files.find((f) => f.id === args.where.id && f.userId === args.where.userId) ?? null,
      ),
    },
    folder: {
      findFirst: vi.fn(async (args: { where: { id: string; userId: string } }) =>
        folders.find(
          (f) =>
            f.id === args.where.id && f.userId === args.where.userId && !f.isDeleted,
        ) ?? null,
      ),
      findMany: vi.fn(async () => folders.map((f) => ({ ...f }))),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const row = makeFolder({
          id: 'fld-new',
          name: args.data.name as string,
          path: args.data.path as string,
          color: (args.data.color as string | null) ?? null,
        });
        folders.push(row);
        return { ...row };
      }),
      update: vi.fn(async (args: { where: { id: string }; data: { color: string | null } }) => {
        lastUpdate = { where: args.where, data: args.data };
        const row = folders.find((f) => f.id === args.where.id);
        if (!row) throw new Error('row missing');
        row.color = args.data.color;
        return { ...row };
      }),
    },
  };
}

async function buildApp(currentUserId: string | null = 'user-owner'): Promise<FastifyInstance> {
  const { default: driveRoutes } = await import('../routes/drive');
  const app = Fastify();
  app.decorate('prisma', makePrisma() as never);
  app.addHook('onRequest', async (request) => {
    if (currentUserId) {
      (request as unknown as { auth: { userId: string } }).auth = { userId: currentUserId };
    }
  });
  await app.register(driveRoutes);
  await app.ready();
  return app;
}

const PALETTE_HEX = '#E87171';

describe('PUT /drive/folders/:id/color', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    folders = [makeFolder({ id: 'fld-docs', name: 'Docs', path: '/Docs' })];
    files = [{ id: 'file-a', userId: 'user-owner' }];
    lastUpdate = undefined;
    app = await buildApp();
  });

  it('persists a palette color on the caller\'s own folder', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/drive/folders/fld-docs/color',
      payload: { color: PALETTE_HEX },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: 'fld-docs', color: PALETTE_HEX });
    expect(lastUpdate).toEqual({ where: { id: 'fld-docs' }, data: { color: PALETTE_HEX } });
  });

  it('resets to the default tint when color is null', async () => {
    folders[0].color = PALETTE_HEX;
    const res = await app.inject({
      method: 'PUT',
      url: '/drive/folders/fld-docs/color',
      payload: { color: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: 'fld-docs', color: null });
  });

  it('rejects a hex outside the palette with 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/drive/folders/fld-docs/color',
      payload: { color: '#DEAD00' },
    });
    expect(res.statusCode).toBe(400);
    // The row must be untouched — no junk persisted.
    expect(lastUpdate).toBeUndefined();
    expect(folders[0].color).toBeNull();
  });

  it('rejects a missing body color with 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/drive/folders/fld-docs/color',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects files with 400 (folders only)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/drive/folders/file-a/color',
      payload: { color: PALETTE_HEX },
    });
    expect(res.statusCode).toBe(400);
    expect(lastUpdate).toBeUndefined();
  });

  it('returns 404 for an unknown id', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/drive/folders/fld-nope/color',
      payload: { color: PALETTE_HEX },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for another user\'s folder (no cross-user write)', async () => {
    folders = [makeFolder({ id: 'fld-theirs', userId: 'user-other', name: 'Theirs', path: '/Theirs' })];
    const res = await app.inject({
      method: 'PUT',
      url: '/drive/folders/fld-theirs/color',
      payload: { color: PALETTE_HEX },
    });
    expect(res.statusCode).toBe(404);
    expect(lastUpdate).toBeUndefined();
  });

  it('rejects unauthenticated callers with 401', async () => {
    const anon = await buildApp(null);
    const res = await anon.inject({
      method: 'PUT',
      url: '/drive/folders/fld-docs/color',
      payload: { color: PALETTE_HEX },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('folder color in listings', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    folders = [makeFolder({ id: 'fld-docs', name: 'Docs', path: '/Docs', color: PALETTE_HEX })];
    files = [];
    app = await buildApp();
  });

  it('GET /drive/folders exposes the color', async () => {
    const res = await app.inject({ method: 'GET', url: '/drive/folders' });
    expect(res.statusCode).toBe(200);
    expect(res.json().folders).toEqual([
      {
        id: 'fld-docs',
        name: 'Docs',
        parentId: null,
        path: '/Docs',
        color: PALETTE_HEX,
      },
    ]);
  });

  it('POST /drive/folders accepts an initial palette color and defaults to null', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/drive/folders',
      payload: { name: 'Tinted', color: PALETTE_HEX },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().color).toBe(PALETTE_HEX);

    const res2 = await app.inject({
      method: 'POST',
      url: '/drive/folders',
      payload: { name: 'Plain' },
    });
    expect(res2.statusCode).toBe(201);
    expect(res2.json().color).toBeNull();

    const bad = await app.inject({
      method: 'POST',
      url: '/drive/folders',
      payload: { name: 'Junk', color: '#DEAD00' },
    });
    expect(bad.statusCode).toBe(400);
  });
});
