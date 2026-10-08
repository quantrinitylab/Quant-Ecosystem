// @vitest-environment node
// ============================================================================
// QM-M39-014 — Drive files cursor pagination verification
// ----------------------------------------------------------------------------
// Proves GET /drive/files implements REAL server-side cursor pagination (not
// client-only slicing): pages are disjoint, ordered, resumable via nextCursor,
// limits are clamped, folders are only returned on the first page, and the
// pdf/doc/code/zip type filters are server-compatible with the frontend
// type-card classification.
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
  DRIVE_QUOTA_BYTES: 15 * 1024 * 1024 * 1024,
  checkedPlaintext: vi.fn(async () => Buffer.from('sovereign-quant-drive-bytes')),
  decryptFromDrive: vi.fn(),
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
  getDriveObject: vi.fn(),
  putDriveObject: vi.fn(async () => {}),
  safeFileName: vi.fn((n: string) => n),
  hashFromVersionKey: vi.fn(() => null),
}));

interface Row {
  id: string;
  [key: string]: unknown;
}

let files: Row[] = [];
let folders: Row[] = [];

// --- Minimal but HONEST in-memory query engine --------------------------------
// Supports exactly the operators GET /drive/files uses: equality, OR, `in`,
// `not`, `startsWith`, `endsWith`, `contains`, plus orderBy (single or array),
// keyset cursor ({ id }), skip and take. A fake that ignores orderBy/cursor
// would make this test vacuous; this one actually sorts and slices.

function matches(record: Row, where: any): boolean {
  if (!where) return true;
  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;
    if (key === 'OR' && Array.isArray(val)) {
      if (!val.some((sub: any) => matches(record, sub))) return false;
      continue;
    }
    if (key === 'AND' && Array.isArray(val)) {
      if (!val.every((sub: any) => matches(record, sub))) return false;
      continue;
    }
    const recVal = record[key];
    if (val && typeof val === 'object' && !(val instanceof Date)) {
      const obj = val as Record<string, unknown>;
      if ('in' in obj && Array.isArray(obj.in)) {
        if (!obj.in.includes(recVal)) return false;
        continue;
      }
      if ('not' in obj) {
        if (recVal === obj.not) return false;
        continue;
      }
      if ('startsWith' in obj && typeof obj.startsWith === 'string') {
        if (typeof recVal !== 'string' || !recVal.startsWith(obj.startsWith)) return false;
        continue;
      }
      if ('endsWith' in obj && typeof obj.endsWith === 'string') {
        if (typeof recVal !== 'string' || !recVal.endsWith(obj.endsWith)) return false;
        continue;
      }
      if ('contains' in obj && typeof obj.contains === 'string') {
        if (typeof recVal !== 'string' || !recVal.includes(obj.contains)) return false;
        continue;
      }
    } else if (recVal !== val) {
      return false;
    }
  }
  return true;
}

function compareValues(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function applyOrderBy(rows: Row[], orderBy: any): Row[] {
  const specs = (Array.isArray(orderBy) ? orderBy : [orderBy]).filter(Boolean);
  if (specs.length === 0) return rows;
  return [...rows].sort((ra, rb) => {
    for (const spec of specs) {
      const entries = Object.entries(spec) as [string, string][];
      const [field, dir] = entries[0];
      const cmp = compareValues(ra[field], rb[field]);
      if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

function applyCursorTake(rows: Row[], args: any): Row[] {
  let out = rows;
  if (args?.cursor?.id) {
    // Prisma keyset semantics: the cursor positions AT the cursor row
    // (inclusive); `skip: 1` then drops the cursor itself. Slicing past the
    // cursor AND applying skip would double-skip a row.
    const idx = out.findIndex((r) => r.id === args.cursor.id);
    out = idx >= 0 ? out.slice(idx) : [];
  }
  if (typeof args?.skip === 'number') out = out.slice(args.skip);
  if (typeof args?.take === 'number') out = out.slice(0, args.take);
  return out;
}

function createFakePrisma() {
  return {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === 'user-owner'
          ? { id: 'user-owner', email: 'owner@quantmail.in', displayName: 'Owner' }
          : null,
      findMany: async () => [],
    },
    userSubscription: {
      findUnique: async () => null,
    },
    folder: {
      findMany: async (args: any = {}) => {
        const hits = folders.filter((f) => matches(f, args.where));
        return applyOrderBy(hits, args.orderBy);
      },
    },
    file: {
      findMany: async (args: any = {}) => {
        const hits = files.filter((f) => matches(f, args.where));
        const ordered = applyOrderBy(hits, args.orderBy);
        return applyCursorTake(ordered, args);
      },
      count: async (args: any = {}) => files.filter((f) => matches(f, args.where)).length,
      aggregate: async (args: any = {}) => {
        const hits = files.filter((f) => matches(f, args.where));
        const sum = hits.reduce((acc, f) => acc + (Number(f.size) || 0), 0);
        return { _sum: { size: sum } };
      },
    },
    share: { findMany: async () => [] },
    fileVersion: { findMany: async () => [] },
    fileIndex: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    $transaction: async (arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : typeof arg === 'function' ? arg({}) : arg,
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const { default: driveRoutes } = await import('../routes/drive');
  const app = Fastify();
  app.decorate('prisma', createFakePrisma() as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-owner' };
  });
  await app.register(driveRoutes);
  await app.ready();
  return app;
}

function seedFile(i: number, overrides: Partial<Row> = {}): Row {
  return {
    id: `file-${i}`,
    name: `file-${String(i).padStart(2, '0')}.bin`,
    mimeType: 'application/octet-stream',
    size: i * 100,
    folderId: null,
    isStarred: false,
    isDeleted: false,
    deletedAt: null,
    trashRootId: null,
    encryptedContent: '',
    encryptionIV: '',
    encryptionAuthTag: '',
    encryptionKey: '',
    contentHash: `hash-${i}`,
    userId: 'user-owner',
    createdAt: new Date(2026, 0, i + 1),
    updatedAt: new Date(2026, 0, i + 1),
    ...overrides,
  };
}

describe('QM-M39-014 — GET /drive/files cursor pagination', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    files = [];
    folders = [];
    // 5 files, deterministic updatedAt order: file-0 oldest … file-4 newest.
    for (let i = 0; i < 5; i++) files.push(seedFile(i));
    folders.push({
      id: 'folder-1',
      name: 'Projects',
      parentId: null,
      path: '/Projects',
      userId: 'user-owner',
      isStarred: false,
      isDeleted: false,
      deletedAt: null,
      trashRootId: null,
      createdAt: new Date(2026, 0, 1),
      updatedAt: new Date(2026, 0, 1),
    });
    app = await buildApp();
  });

  it('returns the first page with nextCursor, hasMore and totalCount', async () => {
    const res = await app.inject({ method: 'GET', url: '/drive/files?limit=2' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // default sort is updatedAt desc → newest first
    expect(body.files.map((f: any) => f.id)).toEqual(['folder-1', 'file-4', 'file-3']);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe('file-3');
    expect(body.totalCount).toBe(5);
  });

  it('walks all pages with disjoint, ordered results and ends with hasMore=false', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const url: string = cursor
        ? `/drive/files?limit=2&cursor=${cursor}`
        : '/drive/files?limit=2';
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      const body: any = res.json();
      pages += 1;
      const ids = body.files.map((f: any) => f.id);
      for (const id of ids) expect(seen).not.toContain(id);
      seen.push(...ids);
      if (!body.hasMore) {
        expect(body.nextCursor).toBeNull();
        break;
      }
      cursor = body.nextCursor;
      expect(pages).toBeLessThan(10); // guard against infinite loop
    }
    // folder + all 5 files exactly once
    expect(seen.sort()).toEqual(['file-0', 'file-1', 'file-2', 'file-3', 'file-4', 'folder-1']);
    expect(pages).toBe(3);
  });

  it('returns folders only on the first page (never repeats them on later pages)', async () => {
    const first = await app.inject({ method: 'GET', url: '/drive/files?limit=2' });
    const firstBody = first.json();
    expect(firstBody.files.some((f: any) => f.type === 'folder')).toBe(true);
    const second = await app.inject({
      method: 'GET',
      url: `/drive/files?limit=2&cursor=${firstBody.nextCursor}`,
    });
    const secondBody = second.json();
    expect(secondBody.files.some((f: any) => f.type === 'folder')).toBe(false);
  });

  it('honours sortBy=name&sortDir=asc across page boundaries', async () => {
    const p1 = await app.inject({ method: 'GET', url: '/drive/files?limit=2&sortBy=name&sortDir=asc' });
    const p2 = await app.inject({
      method: 'GET',
      url: `/drive/files?limit=2&sortBy=name&sortDir=asc&cursor=${p1.json().nextCursor}`,
    });
    const names1 = p1.json().files.filter((f: any) => f.type === 'file').map((f: any) => f.name);
    const names2 = p2.json().files.filter((f: any) => f.type === 'file').map((f: any) => f.name);
    const all = [...names1, ...names2];
    expect(all).toEqual([...all].sort());
    expect(names1[names1.length - 1] < names2[0]).toBe(true);
  });

  it('clamps the limit: negative → 1, huge → 200', async () => {
    const neg = await app.inject({ method: 'GET', url: '/drive/files?limit=-3' });
    expect(neg.json().files.filter((f: any) => f.type === 'file')).toHaveLength(1);
    // 200-cap cannot be observed with 5 rows, but the route must not error and
    // must still report the true totalCount.
    const huge = await app.inject({ method: 'GET', url: '/drive/files?limit=99999' });
    expect(huge.statusCode).toBe(200);
    expect(huge.json().totalCount).toBe(5);
  });

  it('serves the pdf/doc/code/zip type filters server-side (QM-M39-014)', async () => {
    files.push(
      seedFile(10, { id: 'file-pdf', name: 'report.pdf', mimeType: 'application/pdf' }),
      seedFile(11, { id: 'file-doc', name: 'notes.txt', mimeType: 'text/plain' }),
      seedFile(12, { id: 'file-code', name: 'app.ts', mimeType: 'application/octet-stream' }),
      seedFile(13, { id: 'file-zip', name: 'backup.tar.gz', mimeType: 'application/gzip' }),
    );
    const check = async (filter: string, expectedIds: string[]) => {
      const res = await app.inject({ method: 'GET', url: `/drive/files?filter=${filter}&limit=50` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.files.map((f: any) => f.id).sort()).toEqual(expectedIds.sort());
      expect(body.totalCount).toBe(expectedIds.length);
      expect(body.hasMore).toBe(false);
    };
    await check('pdf', ['file-pdf']);
    await check('doc', ['file-doc']);
    await check('code', ['file-code']);
    await check('zip', ['file-zip']);
  });

  it('keeps working without pagination params (backwards-compatible single page)', async () => {
    const res = await app.inject({ method: 'GET', url: '/drive/files' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.files).toHaveLength(6); // folder + 5 files
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });
});
