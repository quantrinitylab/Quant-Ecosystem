// @vitest-environment node
// ============================================================================
// /drive/memory — the AI Memory surface behind the Drive page.
// ============================================================================
//
// Three things here are easy to get wrong and impossible to notice by looking:
//
//   1. `memory_records` is immutable-append — one `logicalId` holds many
//      versions. A naive findMany renders the same memory three times, once per
//      revision. This asserts only the head version survives projection.
//   2. Forgetting is an ARCHIVE, per `ForgetPolicy`'s documented default. A
//      hard delete would pass a "it disappeared" test just as well and quietly
//      destroy the audit trail, so the row count is asserted, not just absence.
//   3. `logicalId` is user-supplied in the URL. Another account's memory must
//      404, not archive.
//
// HARNESS: registers the REAL driveRoutes on a bare Fastify app with a fake
// prisma and a fake auth hook. Only the storage service is mocked — it reaches
// for S3 config at import time and Drive files are not what is under test.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('../services/drive-storage.service', () => ({
  DRIVE_MAX_BODY_BYTES: 1024,
  DRIVE_MAX_FILE_BYTES: 1024,
  DRIVE_QUOTA_BYTES: 15 * 1024 * 1024 * 1024,
  decryptFromDrive: vi.fn(),
  deleteDriveObject: vi.fn(),
  driveObjectKey: vi.fn(() => 'k'),
  driveStorageReady: vi.fn(() => true),
  driveStorageUnavailableReason: vi.fn(() => null),
  encryptForDrive: vi.fn(),
  getDriveObject: vi.fn(),
  putDriveObject: vi.fn(),
  safeFileName: vi.fn((n: string) => n),
}));

type Row = {
  id: string;
  logicalId: string;
  version: number;
  ownerType: string;
  ownerId: string;
  kind: string;
  level: string;
  content: string;
  pinned: boolean;
  metadata: Record<string, unknown>;
  expiresAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const DAY = 86_400_000;
let rows: Row[] = [];

function row(partial: Partial<Row> & { logicalId: string; content: string }): Row {
  const now = new Date(Date.now() - DAY);
  return {
    id: `${partial.logicalId}-v${partial.version ?? 1}`,
    version: 1,
    ownerType: 'user',
    ownerId: 'user-1',
    kind: 'preference',
    level: 'user',
    pinned: false,
    metadata: {},
    expiresAt: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  } as Row;
}

/** Enough of the Prisma delegate for the two handlers under test. */
function fakePrisma() {
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(
      ([key, value]) => (r as unknown as Record<string, unknown>)[key] === value,
    );
  return {
    memoryRecord: {
      findMany: async ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy?: unknown;
      }) => {
        void orderBy;
        return rows
          .filter((r) => matches(r, where))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.version - a.version);
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((r) => matches(r, where)) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: { archivedAt: Date };
      }) => {
        const hits = rows.filter((r) => matches(r, where));
        for (const hit of hits) hit.archivedAt = data.archivedAt;
        return { count: hits.length };
      },
    },
    file: { findMany: async () => [], findUnique: async () => null },
    user: { findUnique: async () => ({ displayName: 'K', email: 'k@quantmail.in' }) },
  };
}

async function buildApp(userId: string | null = 'user-1') {
  const { default: driveRoutes } = await import('../routes/drive');
  const app = Fastify();
  // `fastify.prisma` is augmented as the full PrismaClient. The fake is
  // deliberately only the delegates these two handlers touch, hence the cast.
  app.decorate('prisma', fakePrisma() as never);
  app.addHook('onRequest', async (request) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(driveRoutes);
  await app.ready();
  return app;
}

describe('GET /drive/memory', () => {
  beforeEach(() => {
    rows = [];
  });

  it('returns only the head version of a memory that has been revised', async () => {
    const old = row({ logicalId: 'm1', content: 'prefers short replies', version: 1 });
    old.updatedAt = new Date(Date.now() - 5 * DAY);
    const head = row({ logicalId: 'm1', content: 'prefers very short replies', version: 3 });
    rows = [old, head];

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/drive/memory' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.memories).toHaveLength(1);
    expect(body.memories[0]).toMatchObject({
      id: 'm1',
      version: 3,
      content: 'prefers very short replies',
    });
    expect(body.total).toBe(1);
    await app.close();
  });

  it('drops an expired memory but keeps one with no expiry', async () => {
    rows = [
      row({ logicalId: 'gone', content: 'temporary', expiresAt: new Date(Date.now() - DAY) }),
      row({ logicalId: 'stays', content: 'permanent' }),
    ];

    const app = await buildApp();
    const body = (await app.inject({ method: 'GET', url: '/drive/memory' })).json();
    expect(body.memories.map((m: { id: string }) => m.id)).toEqual(['stays']);
    await app.close();
  });

  it('attributes a memory to the app in its session name, and shared channels to neither', async () => {
    rows = [
      row({
        logicalId: 'sendtime',
        content: 'sends at 9am',
        metadata: { session: 'quantmail-sendtime' },
      }),
      row({ logicalId: 'style', content: 'x', metadata: { session: 'user-style' } }),
      row({ logicalId: 'chat', content: 'y', metadata: { app: 'quantchat' } }),
      row({ logicalId: 'bare', content: 'z' }),
    ];

    const app = await buildApp();
    const body = (await app.inject({ method: 'GET', url: '/drive/memory' })).json();
    const byId = new Map(
      body.memories.map((m: { id: string; sourceApp: string; sourceLabel: string }) => [m.id, m]),
    );
    expect(byId.get('sendtime')).toMatchObject({
      sourceApp: 'quantmail',
      sourceLabel: 'QuantMail',
    });
    expect(byId.get('chat')).toMatchObject({ sourceApp: 'quantchat', sourceLabel: 'QuantChat' });
    // Written by whichever app noticed first — claiming one would be a guess.
    expect(byId.get('style')).toMatchObject({
      sourceApp: 'shared',
      sourceLabel: 'Shared across apps',
    });
    expect(byId.get('bare')).toMatchObject({ sourceApp: 'shared' });
    await app.close();
  });

  it('unpacks the raw style-profile blob into something a person can read', async () => {
    rows = [
      row({
        logicalId: 'style',
        content: `user-style-profile ${JSON.stringify({
          tone: 'playful',
          vocabularyLevel: 'simple',
          greetingStyle: 'yo',
          closingStyle: 'cheers',
          traits: ['brief'],
        })}`,
        metadata: { session: 'user-style' },
      }),
    ];

    const app = await buildApp();
    const body = (await app.inject({ method: 'GET', url: '/drive/memory' })).json();
    const summary = body.memories[0].summary as string;
    expect(summary).toContain('playful tone');
    expect(summary).toContain('opens with "yo"');
    expect(summary).toContain('brief');
    expect(summary).not.toContain('user-style-profile');
    // The raw content is still returned — the summary is a view, not a rewrite.
    expect(body.memories[0].content).toContain('user-style-profile');
    await app.close();
  });

  it('survives a style-profile blob that is not valid JSON', async () => {
    rows = [row({ logicalId: 'broken', content: 'user-style-profile {not json' })];
    const app = await buildApp();
    const body = (await app.inject({ method: 'GET', url: '/drive/memory' })).json();
    expect(body.memories[0].summary).toBe('Writing style profile');
    await app.close();
  });

  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/drive/memory' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /drive/memory/:logicalId', () => {
  beforeEach(() => {
    rows = [];
  });

  it('archives every live version rather than deleting them', async () => {
    rows = [
      row({ logicalId: 'm1', content: 'a', version: 1 }),
      row({ logicalId: 'm1', content: 'b', version: 2 }),
      row({ logicalId: 'other', content: 'c' }),
    ];

    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/drive/memory/m1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, archived: 2 });

    // Archived, not gone: the rows are still there for audit and rollback.
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.logicalId === 'm1').every((r) => r.archivedAt !== null)).toBe(true);
    expect(rows.find((r) => r.logicalId === 'other')?.archivedAt).toBeNull();
    await app.close();
  });

  it('404s on a memory belonging to someone else', async () => {
    rows = [row({ logicalId: 'theirs', content: 'secret', ownerId: 'user-2' })];

    const app = await buildApp('user-1');
    const res = await app.inject({ method: 'DELETE', url: '/drive/memory/theirs' });
    expect(res.statusCode).toBe(404);
    expect(rows[0]?.archivedAt).toBeNull();
    await app.close();
  });
});
