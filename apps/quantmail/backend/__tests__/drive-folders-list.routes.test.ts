// @vitest-environment node
// ============================================================================
// QM-FIX drive-folders-405 — GET /drive/folders backend route tests.
//
// Quanty's organize flow resolves a suggested category name to a folder id via
// GET /api/drive/folders (QuantyFileWorkspace resolveFolderId), which the Next
// proxy forwards to this backend route. Before the fix the Next route only
// exported POST, so every GET 405'd and the lookup silently fell back to null.
//
// The backend had no GET /drive/folders at all: `GET /folders` lists *mail*
// label folders (emailFolder), and `GET /drive/files?filter=folders` returns
// only one level. This route returns a flat list of ALL non-deleted drive
// folders for the user (every depth) so name lookups see nested folders too.
//
// No fake data: every folder asserted here comes from the stubbed prisma query
// in the shape the route projects; an empty drive yields an honest empty list.
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

interface FolderRow {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  path: string;
  isDeleted: boolean;
}

let folders: FolderRow[];
let lastWhere: unknown;

function makePrisma() {
  return {
    folder: {
      findMany: vi.fn(async (args: { where?: Record<string, unknown> }) => {
        lastWhere = args?.where;
        return folders.map((f) => ({ ...f }));
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

const makeFolder = (overrides: Partial<FolderRow> = {}): FolderRow => ({
  id: `folder-${Math.random().toString(36).slice(2, 8)}`,
  userId: 'user-owner',
  name: 'Untitled',
  parentId: null,
  path: '/Untitled',
  isDeleted: false,
  ...overrides,
});

describe('GET /drive/folders', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    folders = [
      makeFolder({ id: 'fld-receipts', name: 'Receipts', path: '/Receipts' }),
      makeFolder({
        id: 'fld-2024',
        name: '2024',
        parentId: 'fld-receipts',
        path: '/Receipts/2024',
      }),
    ];
    lastWhere = undefined;
    app = await buildApp();
  });

  it('returns every folder (all depths) as { folders: [{ id, name, parentId, path }] }', async () => {
    const res = await app.inject({ method: 'GET', url: '/drive/folders' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.folders).toEqual([
      { id: 'fld-receipts', name: 'Receipts', parentId: null, path: '/Receipts' },
      { id: 'fld-2024', name: '2024', parentId: 'fld-receipts', path: '/Receipts/2024' },
    ]);
  });

  it('scopes to the caller and excludes deleted folders', async () => {
    folders = [
      makeFolder({ id: 'mine', name: 'Mine' }),
      makeFolder({ id: 'deleted', name: 'Gone', isDeleted: true }),
      makeFolder({ id: 'theirs', name: 'Theirs', userId: 'user-other' }),
    ];
    await app.inject({ method: 'GET', url: '/drive/folders' });
    // The route must ask prisma for exactly this user's non-deleted folders —
    // scoping is enforced in the query, not filtered in JS afterwards.
    expect(lastWhere).toEqual({ userId: 'user-owner', isDeleted: false });
  });

  it('returns an honest empty list when the user has no folders', async () => {
    folders = [];
    const res = await app.inject({ method: 'GET', url: '/drive/folders' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ folders: [] });
  });

  it('rejects unauthenticated callers with 401', async () => {
    const anon = await buildApp(null);
    const res = await anon.inject({ method: 'GET', url: '/drive/folders' });
    expect(res.statusCode).toBe(401);
  });
});
