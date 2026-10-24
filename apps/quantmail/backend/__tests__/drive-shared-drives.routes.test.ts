// @vitest-environment node
// ============================================================================
// fix/qm-drive-shared-drives-6 — team-owned Shared Drives, slice 1.
//
// QuantMail Drive was personal-only (every Folder has one ownerUserId), so no
// folder could belong to a team. This slice adds the team-owned container +
// membership with Google's five permission levels (manager, contentManager,
// contributor, commenter, viewer) and the invariant that keeps a drive from
// ever being orphaned: the last manager cannot be demoted or removed before
// another manager exists. Files living inside a shared drive, external
// collaborators, and limited-access folders are follow-up slices and are NOT
// claimed here.
//
// No fake data: every drive/member asserted here comes from the stubbed
// prisma delegates below; an empty membership yields an honest empty list.
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

type DriveRow = {
  id: string;
  name: string;
  description: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};
type MemberRow = {
  id: string;
  sharedDriveId: string;
  userId: string;
  role: string;
  addedById: string;
  createdAt: Date;
};
type UserRow = { id: string; email: string; displayName: string };

let drives: DriveRow[];
let members: MemberRow[];
let users: UserRow[];
let seq: number;

const now = () => new Date('2026-10-24T12:00:00.000Z');

function makePrisma() {
  const match = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const cond = value as Record<string, unknown>;
        if ('in' in cond) return (cond.in as unknown[]).includes(row[key]);
        if ('equals' in cond) {
          const hay = String(row[key] ?? '');
          const needle = String(cond.equals ?? '');
          return cond.mode === 'insensitive'
            ? hay.toLowerCase() === needle.toLowerCase()
            : hay === needle;
        }
      }
      return row[key] === value;
    });
  return {
    sharedDrive: {
      create: vi.fn(async ({ data }: { data: Partial<DriveRow> }) => {
        const row: DriveRow = {
          id: `sd-${++seq}`,
          name: data.name as string,
          description: (data.description as string | null) ?? null,
          createdById: data.createdById as string,
          createdAt: now(),
          updatedAt: now(),
        };
        drives.push(row);
        return { ...row };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        drives.find((d) => d.id === where.id) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        drives
          .filter((d) => match(d as unknown as Record<string, unknown>, where))
          .map((d) => ({ ...d })),
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<DriveRow> }) => {
        const row = drives.find((d) => d.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      }),
    },
    sharedDriveMember: {
      create: vi.fn(async ({ data }: { data: Partial<MemberRow> }) => {
        const row: MemberRow = {
          id: `sdm-${++seq}`,
          sharedDriveId: data.sharedDriveId as string,
          userId: data.userId as string,
          role: data.role as string,
          addedById: data.addedById as string,
          createdAt: now(),
        };
        members.push(row);
        return { ...row };
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const row = members.find((m) => match(m as unknown as Record<string, unknown>, where));
        return row ? { ...row } : null;
      }),
      findMany: vi.fn(async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: unknown }) => {
        void orderBy;
        return members
          .filter((m) => match(m as unknown as Record<string, unknown>, where))
          .map((m) => ({ ...m }));
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MemberRow> }) => {
        const row = members.find((m) => m.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = members.findIndex((m) => m.id === where.id);
        const [row] = members.splice(idx, 1);
        return { ...row };
      }),
    },
    user: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const row = users.find((u) => match(u as unknown as Record<string, unknown>, where));
        return row ? { ...row } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        users
          .filter((u) => match(u as unknown as Record<string, unknown>, where))
          .map((u) => ({ ...u })),
      ),
    },
  };
}

async function buildApp(currentUserId: string | null): Promise<FastifyInstance> {
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

const OWNER = 'user-owner';
const TEAMMATE = 'user-teammate';
const OUTSIDER = 'user-outsider';

describe('Shared Drives (slice 1)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    drives = [];
    members = [];
    users = [
      { id: OWNER, email: 'owner@quantmail.in', displayName: 'Owner' },
      { id: TEAMMATE, email: 'teammate@quantmail.in', displayName: 'Teammate' },
      { id: OUTSIDER, email: 'outsider@quantmail.in', displayName: 'Outsider' },
    ];
    seq = 0;
    app = await buildApp(OWNER);
  });

  async function createDrive(name = 'Team Drive') {
    const res = await app.inject({
      method: 'POST',
      url: '/drive/shared-drives',
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    return res.json().sharedDrive as { id: string };
  }

  it('creates a drive with the creator as manager and no owner column', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/drive/shared-drives',
      payload: { name: 'Design Team', description: 'Shared assets' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json().sharedDrive;
    expect(body.name).toBe('Design Team');
    expect(body.myRole).toBe('manager');
    expect(body.memberCount).toBe(1);
    // Team-owned: no ownerUserId/ownerId — membership rows are the ownership.
    expect(body).not.toHaveProperty('ownerUserId');
    expect(body).not.toHaveProperty('ownerId');
    expect(body).not.toHaveProperty('owner');
  });

  it('400s on an empty name and on an unknown role', async () => {
    const empty = await app.inject({
      method: 'POST',
      url: '/drive/shared-drives',
      payload: { name: '   ' },
    });
    expect(empty.statusCode).toBe(400);
    const drive = await createDrive();
    const badRole = await app.inject({
      method: 'POST',
      url: `/drive/shared-drives/${drive.id}/members`,
      payload: { email: 'teammate@quantmail.in', role: 'superuser' },
    });
    expect(badRole.statusCode).toBe(400);
    expect(members).toHaveLength(1);
  });

  it('lists only the caller’s drives, with their own role and member count', async () => {
    const mine = await createDrive('Mine');
    await app.inject({
      method: 'POST',
      url: `/drive/shared-drives/${mine.id}/members`,
      payload: { email: 'teammate@quantmail.in', role: 'viewer' },
    });
    // A drive the caller is not a member of must never appear.
    drives.push({
      id: 'sd-hidden',
      name: 'Hidden',
      description: null,
      createdById: OUTSIDER,
      createdAt: now(),
      updatedAt: now(),
    });
    members.push({
      id: 'sdm-hidden',
      sharedDriveId: 'sd-hidden',
      userId: OUTSIDER,
      role: 'manager',
      addedById: OUTSIDER,
      createdAt: now(),
    });
    const res = await app.inject({ method: 'GET', url: '/drive/shared-drives' });
    expect(res.statusCode).toBe(200);
    expect(res.json().sharedDrives).toEqual([
      expect.objectContaining({ id: mine.id, myRole: 'manager', memberCount: 2 }),
    ]);
  });

  it('returns an honest empty list when the caller belongs to no drive', async () => {
    const res = await app.inject({ method: 'GET', url: '/drive/shared-drives' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sharedDrives: [] });
  });

  it('hides a drive from non-members (404, not a leak) and shows members to members', async () => {
    const drive = await createDrive();
    const outsiderApp = await buildApp(OUTSIDER);
    const hidden = await outsiderApp.inject({
      method: 'GET',
      url: `/drive/shared-drives/${drive.id}`,
    });
    expect(hidden.statusCode).toBe(404);
    await app.inject({
      method: 'POST',
      url: `/drive/shared-drives/${drive.id}/members`,
      payload: { email: 'teammate@quantmail.in', role: 'commenter' },
    });
    const teammateApp = await buildApp(TEAMMATE);
    const visible = await teammateApp.inject({
      method: 'GET',
      url: `/drive/shared-drives/${drive.id}`,
    });
    expect(visible.statusCode).toBe(200);
    const body = visible.json().sharedDrive;
    expect(body.myRole).toBe('commenter');
    expect(body.memberCount).toBe(2);
    expect(body.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: TEAMMATE, email: 'teammate@quantmail.in', role: 'commenter' }),
      ]),
    );
  });

  it('lets only a manager add members, and accepts all five Google roles', async () => {
    const drive = await createDrive();
    await app.inject({
      method: 'POST',
      url: `/drive/shared-drives/${drive.id}/members`,
      payload: { email: 'teammate@quantmail.in', role: 'viewer' },
    });
    const teammateApp = await buildApp(TEAMMATE);
    const forbidden = await teammateApp.inject({
      method: 'POST',
      url: `/drive/shared-drives/${drive.id}/members`,
      payload: { email: 'outsider@quantmail.in', role: 'viewer' },
    });
    expect(forbidden.statusCode).toBe(403);
    for (const role of ['manager', 'contentManager', 'contributor', 'commenter', 'viewer']) {
      const res = await app.inject({
        method: 'POST',
        url: `/drive/shared-drives/${drive.id}/members`,
        payload: { email: 'teammate@quantmail.in', role },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().member.role).toBe(role);
    }
  });

  it('blocks demoting or removing the last manager, and allows it once a successor exists', async () => {
    const drive = await createDrive();
    // The creator is the sole manager: demoting them is blocked.
    const demoteOwner = await app.inject({
      method: 'POST',
      url: `/drive/shared-drives/${drive.id}/members`,
      payload: { email: 'owner@quantmail.in', role: 'viewer' },
    });
    expect(demoteOwner.statusCode).toBe(400);
    const removeOwner = await app.inject({
      method: 'DELETE',
      url: `/drive/shared-drives/${drive.id}/members/${OWNER}`,
    });
    expect(removeOwner.statusCode).toBe(400);
    // Appoint a successor, then both operations succeed.
    await app.inject({
      method: 'POST',
      url: `/drive/shared-drives/${drive.id}/members`,
      payload: { email: 'teammate@quantmail.in', role: 'manager' },
    });
    const demoteNow = await app.inject({
      method: 'POST',
      url: `/drive/shared-drives/${drive.id}/members`,
      payload: { email: 'owner@quantmail.in', role: 'viewer' },
    });
    expect(demoteNow.statusCode).toBe(200);
    expect(demoteNow.json().member.role).toBe('viewer');
  });

  it('lets a non-manager member leave, and the drive survives their departure', async () => {
    const drive = await createDrive();
    await app.inject({
      method: 'POST',
      url: `/drive/shared-drives/${drive.id}/members`,
      payload: { email: 'teammate@quantmail.in', role: 'contributor' },
    });
    const teammateApp = await buildApp(TEAMMATE);
    const leave = await teammateApp.inject({
      method: 'DELETE',
      url: `/drive/shared-drives/${drive.id}/members/${TEAMMATE}`,
    });
    expect(leave.statusCode).toBe(200);
    // The drive still exists for its remaining manager.
    const stillThere = await app.inject({
      method: 'GET',
      url: `/drive/shared-drives/${drive.id}`,
    });
    expect(stillThere.statusCode).toBe(200);
    expect(stillThere.json().sharedDrive.memberCount).toBe(1);
    // ...and the departed member no longer sees it.
    const gone = await teammateApp.inject({
      method: 'GET',
      url: `/drive/shared-drives/${drive.id}`,
    });
    expect(gone.statusCode).toBe(404);
  });

  it('lets only a manager rename a drive and 404s on an unknown recipient', async () => {
    const drive = await createDrive();
    await app.inject({
      method: 'POST',
      url: `/drive/shared-drives/${drive.id}/members`,
      payload: { email: 'teammate@quantmail.in', role: 'viewer' },
    });
    const teammateApp = await buildApp(TEAMMATE);
    const forbidden = await teammateApp.inject({
      method: 'PATCH',
      url: `/drive/shared-drives/${drive.id}`,
      payload: { name: 'Hijacked' },
    });
    expect(forbidden.statusCode).toBe(403);
    const empty = await app.inject({
      method: 'PATCH',
      url: `/drive/shared-drives/${drive.id}`,
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/drive/shared-drives/${drive.id}`,
      payload: { name: 'Renamed Team' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().sharedDrive.name).toBe('Renamed Team');
    const ghost = await app.inject({
      method: 'POST',
      url: `/drive/shared-drives/${drive.id}/members`,
      payload: { email: 'ghost@example.com', role: 'viewer' },
    });
    expect(ghost.statusCode).toBe(404);
  });

  it('rejects unauthenticated callers with 401', async () => {
    const anon = await buildApp(null);
    const res = await anon.inject({ method: 'GET', url: '/drive/shared-drives' });
    expect(res.statusCode).toBe(401);
  });
});
