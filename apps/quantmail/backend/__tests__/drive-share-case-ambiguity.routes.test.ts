// @vitest-environment node
// ============================================================================
// Drive direct-share recipient resolution: case-colliding legacy rows.
//
// POST /drive/files/:id/share used to resolve the recipient with a
// case-insensitive findFirst, so two live rows differing only by case
// (person@example.com vs Person@example.com) granted the share — and the
// file encryption key — to whichever twin row order returned first, with no
// deletedAt filter. The fix mirrors resolveLinkAudience's fail-closed
// AUDIENCE_AMBIGUOUS pattern: only live ACTIVE subjects are eligible, and
// the address must resolve to exactly one of them. Ambiguity throws before
// any share / invitation / activity write, so zero writes happen.
//
// The fake prisma below is a faithful where-evaluator, not an
// eligible-only stub: it applies every where clause the handler passes, so
// a handler that forgot the deletedAt or status filter would fail the
// "ineligible twin ignored" tests below instead of passing vacuously.
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
  checkedPlaintext: vi.fn(async () => Buffer.from('share-bytes')),
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

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  status: string;
  deletedAt: Date | null;
}

interface ShareRow {
  id: string;
  fileId: string | null;
  folderId: string | null;
  ownerUserId: string;
  sharedWithUserId: string;
  encryptedFileKey: string;
  permission: string;
  status: string;
}

let users: UserRow[] = [];
let shares: ShareRow[] = [];
let invites: Array<Record<string, unknown>> = [];
let events: Array<Record<string, unknown>> = [];

const OWNER = { id: 'user-owner', email: 'owner@quantmail.in', displayName: 'Owner', status: 'ACTIVE', deletedAt: null };

function userMatches(u: UserRow, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (key === 'email' && value && typeof value === 'object') {
      const cond = value as { equals?: string; mode?: string };
      if (cond.equals && u.email.toLowerCase() !== cond.equals.toLowerCase()) return false;
    } else if (key === 'id' && value && typeof value === 'object' && 'in' in value) {
      if (!(value as { in: string[] }).in.includes(u.id)) return false;
    } else if ((u as unknown as Record<string, unknown>)[key] !== value) {
      return false;
    }
  }
  return true;
}

function createFakePrisma() {
  return {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.find((u) => u.id === where.id) ?? null,
      findMany: async ({ where }: { where?: Record<string, unknown> }) =>
        users.filter((u) => userMatches(u, where)),
    },
    file: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id !== 'file-1') return null;
        return {
          id: 'file-1',
          name: 'report.pdf',
          userId: 'user-owner',
          isDeleted: false,
          encryptionKey: 'file-key-1',
        };
      },
    },
    share: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        shares.find((s) => {
          for (const [k, v] of Object.entries(where)) {
            if ((s as unknown as Record<string, unknown>)[k] !== v) return false;
          }
          return true;
        }) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `share-${shares.length + 1}`, ...(data as unknown as Omit<ShareRow, 'id'>) };
        shares.push(row as ShareRow);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = shares.find((s) => s.id === where.id);
        if (!row) throw new Error('share not found');
        Object.assign(row, data);
        return row;
      },
    },
    email: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        invites.push(data);
        return { id: `email-${invites.length}`, ...data };
      },
    },
    $executeRawUnsafe: async (sql: string, ...params: unknown[]) => {
      if (sql.includes('INSERT INTO "drive_file_activity_events"')) {
        events.push({ action: params[6], details: JSON.parse(params[7] as string) });
      }
      return 1;
    },
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const { default: driveRoutes } = await import('../routes/drive');
  const app = Fastify();
  app.decorate('prisma', createFakePrisma() as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-owner' };
  });
  app.setErrorHandler((error: any, _request, reply) => {
    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      success: false,
      message: error.message,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message },
    });
  });
  await app.register(driveRoutes);
  await app.ready();
  return app;
}

function share(email: string, app: FastifyInstance) {
  return app.inject({
    method: 'POST',
    url: '/drive/files/file-1/share',
    payload: { email, permission: 'view' },
  });
}

describe('POST /drive/files/:id/share recipient resolution', () => {
  beforeEach(() => {
    users = [{ ...OWNER }];
    shares = [];
    invites = [];
    events = [];
  });

  it('rejects 409 AUDIENCE_AMBIGUOUS with zero writes when two live rows differ only by case', async () => {
    users.push(
      { id: 'user-twin-a', email: 'twin@quantmail.in', displayName: 'Twin A', status: 'ACTIVE', deletedAt: null },
      { id: 'user-twin-b', email: 'Twin@quantmail.in', displayName: 'Twin B', status: 'ACTIVE', deletedAt: null },
    );
    const app = await buildApp();
    const res = await share('TWIN@quantmail.in', app);
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('AUDIENCE_AMBIGUOUS');
    expect(shares).toHaveLength(0);
    expect(invites).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('ignores a soft-deleted case twin and grants to the live subject (with the file key)', async () => {
    users.push(
      { id: 'user-twin-live', email: 'twin@quantmail.in', displayName: 'Twin Live', status: 'ACTIVE', deletedAt: null },
      { id: 'user-twin-deleted', email: 'Twin@quantmail.in', displayName: 'Twin Deleted', status: 'ACTIVE', deletedAt: new Date('2026-10-01T00:00:00Z') },
    );
    const app = await buildApp();
    const res = await share('twin@quantmail.in', app);
    expect(res.statusCode).toBe(201);
    expect(shares).toHaveLength(1);
    expect(shares[0].sharedWithUserId).toBe('user-twin-live');
    expect(shares[0].encryptedFileKey).toBe('file-key-1');
  });

  it('ignores a suspended case twin and grants to the live subject', async () => {
    users.push(
      { id: 'user-twin-live', email: 'twin@quantmail.in', displayName: 'Twin Live', status: 'ACTIVE', deletedAt: null },
      { id: 'user-twin-susp', email: 'Twin@quantmail.in', displayName: 'Twin Susp', status: 'SUSPENDED', deletedAt: null },
    );
    const app = await buildApp();
    const res = await share('TWIN@quantmail.in', app);
    expect(res.statusCode).toBe(201);
    expect(shares).toHaveLength(1);
    expect(shares[0].sharedWithUserId).toBe('user-twin-live');
  });

  it('returns 404 with zero writes when only a deleted row matches', async () => {
    users.push(
      { id: 'user-gone', email: 'gone@quantmail.in', displayName: 'Gone', status: 'ACTIVE', deletedAt: new Date('2026-10-01T00:00:00Z') },
    );
    const app = await buildApp();
    const res = await share('gone@quantmail.in', app);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('USER_NOT_FOUND');
    expect(shares).toHaveLength(0);
    expect(invites).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('still grants a normal case-insensitive share to a single live subject', async () => {
    users.push(
      { id: 'user-friend', email: 'friend@quantmail.in', displayName: 'Friend', status: 'ACTIVE', deletedAt: null },
    );
    const app = await buildApp();
    const res = await share('Friend@Quantmail.in', app);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.share.email).toBe('friend@quantmail.in');
    expect(shares[0].sharedWithUserId).toBe('user-friend');
  });

  it('still rejects sharing with yourself', async () => {
    const app = await buildApp();
    const res = await share('owner@quantmail.in', app);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_RECIPIENT');
    expect(shares).toHaveLength(0);
  });
});
