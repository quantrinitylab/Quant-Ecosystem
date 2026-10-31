// @vitest-environment node
// ============================================================================
// CODEX corrective, PR #1538 — TWO-CONNECTION Postgres tests for the
// shared-drive atomicity / serialization guarantees.
//
// These tests are MEANINGLESS against an in-memory double: row locks
// (SELECT ... FOR UPDATE) and transaction isolation only exist on real
// Postgres. They therefore run ONLY when DATABASE_URL points at a migrated
// Postgres (migration 0114_drive_shared_drives applied); otherwise the
// whole suite is skipped — honestly, not faked. There is no live Postgres
// in the dev VM, so local runs always skip; CI runs them when it provides
// DATABASE_URL for a migrated database.
//
// What each test proves, with TWO independent PrismaClient instances
// (two real connections, as two concurrent API servers would hold):
//   1. Concurrent removals of the last two managers: exactly one wins and
//      the drive keeps exactly one manager (the old check-then-write let
//      both succeed and orphaned the drive).
//   2. Concurrent demotions of the two managers: exactly one wins, the
//      drive keeps exactly one manager.
//   3. Concurrent adds of the same recipient: exactly one membership row
//      exists afterwards (no duplicate, no partial row).
// The suite seeds only its own rows (unique email suffix per run) and
// deletes them afterwards; it never migrates, never touches other data.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

vi.mock('@quant/ai', () => ({
  AIEngine: class {
    infer = vi.fn();
  },
}));

vi.mock('../services/drive-storage.service', () => ({
  DRIVE_MAX_BODY_BYTES: 10 * 1024 * 1024,
  DRIVE_MAX_FILE_BYTES: 10 * 1024 * 1024,
  checkedPlaintext: vi.fn(async () => Buffer.from('shared-drives-bytes')),
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

const pgUrl = process.env.DATABASE_URL;
const describePg = pgUrl ? describe : describe.skip;
if (!pgUrl) {
  // eslint-disable-next-line no-console
  console.log(
    '[drive-shared-drives.postgres] SKIPPED: DATABASE_URL is not set — ' +
      'two-connection guarantees are owed to a CI run against real Postgres.',
  );
}

describePg('Shared Drives — two-connection Postgres guarantees (PR #1538)', () => {
  let clientA: any;
  let clientB: any;
  let appA: FastifyInstance;
  let appB: FastifyInstance;
  // Ids created by the current test, for cleanup.
  let userIds: string[] = [];
  let driveIds: string[] = [];

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function buildApp(prisma: any, userId: string): Promise<FastifyInstance> {
    const { default: driveRoutes } = await import('../routes/drive');
    const app = Fastify();
    app.decorate('prisma', prisma as never);
    app.addHook('onRequest', async (request) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId };
    });
    await app.register(driveRoutes);
    await app.ready();
    return app;
  }

  async function makeUser(prisma: any, tag: string): Promise<{ id: string; email: string }> {
    const email = `sd-pg-${suffix}-${tag}@quantmail.in`;
    const user = await prisma.user.create({
      data: {
        email,
        username: `sd-pg-${suffix}-${tag}`,
        displayName: `PG ${tag}`,
        passwordHash: 'pg-test-only-not-a-real-hash',
      },
      select: { id: true, email: true },
    });
    userIds.push(user.id);
    return user;
  }

  beforeAll(async () => {
    clientA = new PrismaClient() as any;
    clientB = new PrismaClient() as any;
    await clientA.$connect();
    await clientB.$connect();
  });

  afterAll(async () => {
    await clientA.$disconnect().catch(() => {});
    await clientB.$disconnect().catch(() => {});
  });

  afterEach(async () => {
    // Best-effort cleanup of this run's rows only.
    if (driveIds.length) {
      await clientA.sharedDriveMember
        .deleteMany({ where: { sharedDriveId: { in: driveIds } } })
        .catch(() => {});
      await clientA.sharedDrive
        .deleteMany({ where: { id: { in: driveIds } } })
        .catch(() => {});
    }
    if (userIds.length) {
      await clientA.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
    }
    userIds = [];
    driveIds = [];
    if (appA) await appA.close().catch(() => {});
    if (appB) await appB.close().catch(() => {});
  });

  it('concurrent removals of the last two managers: exactly one wins, drive keeps one manager', async () => {
    userIds = [];
    driveIds = [];
    const owner = await makeUser(clientA, 'rm-owner');
    const second = await makeUser(clientA, 'rm-second');
    appA = await buildApp(clientA, owner.id);
    appB = await buildApp(clientB, second.id);
    const created = await appA.inject({
      method: 'POST',
      url: '/drive/shared-drives',
      payload: { name: 'PG Removal Race' },
    });
    expect(created.statusCode).toBe(201);
    const driveId = created.json().sharedDrive.id as string;
    driveIds.push(driveId);
    const added = await appA.inject({
      method: 'POST',
      url: `/drive/shared-drives/${driveId}/members`,
      payload: { email: second.email, role: 'manager' },
    });
    expect(added.statusCode).toBe(201);
    // Two connections, fired together: each manager removes the other.
    const [resA, resB] = await Promise.all([
      appA.inject({ method: 'DELETE', url: `/drive/shared-drives/${driveId}/members/${second.id}` }),
      appB.inject({ method: 'DELETE', url: `/drive/shared-drives/${driveId}/members/${owner.id}` }),
    ]);
    const codes = [resA.statusCode, resB.statusCode].sort();
    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    // The loser either finds its caller already removed (404) or finds the
    // target is now the sole manager (400) — either way it did NOT orphan.
    expect(codes.filter((c) => c === 400 || c === 404)).toHaveLength(1);
    const managers = await clientA.sharedDriveMember.findMany({
      where: { sharedDriveId: driveId, role: 'manager' },
    });
    expect(managers).toHaveLength(1);
  });

  it('concurrent demotions of the two managers: exactly one wins, drive keeps one manager', async () => {
    userIds = [];
    driveIds = [];
    const owner = await makeUser(clientA, 'dm-owner');
    const second = await makeUser(clientA, 'dm-second');
    appA = await buildApp(clientA, owner.id);
    appB = await buildApp(clientB, second.id);
    const created = await appA.inject({
      method: 'POST',
      url: '/drive/shared-drives',
      payload: { name: 'PG Demotion Race' },
    });
    expect(created.statusCode).toBe(201);
    const driveId = created.json().sharedDrive.id as string;
    driveIds.push(driveId);
    const added = await appA.inject({
      method: 'POST',
      url: `/drive/shared-drives/${driveId}/members`,
      payload: { email: second.email, role: 'manager' },
    });
    expect(added.statusCode).toBe(201);
    const [resA, resB] = await Promise.all([
      appA.inject({
        method: 'POST',
        url: `/drive/shared-drives/${driveId}/members`,
        payload: { email: second.email, role: 'viewer' },
      }),
      appB.inject({
        method: 'POST',
        url: `/drive/shared-drives/${driveId}/members`,
        payload: { email: owner.email, role: 'viewer' },
      }),
    ]);
    const codes = [resA.statusCode, resB.statusCode].sort();
    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    const managers = await clientA.sharedDriveMember.findMany({
      where: { sharedDriveId: driveId, role: 'manager' },
    });
    expect(managers).toHaveLength(1);
  });

  it('concurrent adds of the same recipient: exactly one membership row', async () => {
    userIds = [];
    driveIds = [];
    const owner = await makeUser(clientA, 'add-owner');
    const newcomer = await makeUser(clientA, 'add-newcomer');
    // Both apps act as the same manager over DIFFERENT connections.
    appA = await buildApp(clientA, owner.id);
    appB = await buildApp(clientB, owner.id);
    const created = await appA.inject({
      method: 'POST',
      url: '/drive/shared-drives',
      payload: { name: 'PG Add Race' },
    });
    expect(created.statusCode).toBe(201);
    const driveId = created.json().sharedDrive.id as string;
    driveIds.push(driveId);
    const [resA, resB] = await Promise.all([
      appA.inject({
        method: 'POST',
        url: `/drive/shared-drives/${driveId}/members`,
        payload: { email: newcomer.email, role: 'viewer' },
      }),
      appB.inject({
        method: 'POST',
        url: `/drive/shared-drives/${driveId}/members`,
        payload: { email: newcomer.email, role: 'viewer' },
      }),
    ]);
    // Serialized by the lock, the second add sees the existing row and
    // takes the update path (200); the unique constraint is the backstop
    // if serialization ever failed (409) — either way, one row only.
    expect([resA.statusCode, resB.statusCode].sort()).toEqual([200, 201]);
    const rows = await clientA.sharedDriveMember.findMany({
      where: { sharedDriveId: driveId, userId: newcomer.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].addedById).toBe(owner.id);
  });
});
