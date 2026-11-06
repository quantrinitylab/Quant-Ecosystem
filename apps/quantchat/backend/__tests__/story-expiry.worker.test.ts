// ============================================================================
// quantchat -- StoryExpiryWorker unit tests (Phase 2C)
//
// The sweep is a pure exported function driven here with a structural mock
// prisma (the StoryExpiryPrisma interface) and a mock storage backend -- no
// timers, no database, no network. Each test pins one safety property from
// the worker's header contract.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sweepExpiredStories,
  type StoryExpiryPrisma,
  type StoryStorage,
  type StoryExpirySweepResult,
} from '../services/story-expiry.worker';

interface StoryRow {
  id: string;
  userId: string;
  mediaUrl: string | null;
  expiresAt: Date;
}

function makePrisma(rows: StoryRow[]): {
  prisma: StoryExpiryPrisma;
  deleted: { views: string[]; likes: string[]; comments: string[]; stories: string[] };
} {
  const deleted = { views: [] as string[], likes: [] as string[], comments: [] as string[], stories: [] as string[] };
  const prisma: StoryExpiryPrisma = {
    story: {
      findMany: vi.fn(async ({ where }: { where: { expiresAt: { lte: Date } } }) =>
        rows.filter((r) => r.expiresAt <= where.expiresAt.lte),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] }; expiresAt: { lte: Date } } }) => {
        const hit = rows.filter(
          (r) => where.id.in.includes(r.id) && r.expiresAt <= where.expiresAt.lte,
        );
        deleted.stories.push(...hit.map((r) => r.id));
        return { count: hit.length };
      }),
    },
    storyView: {
      deleteMany: vi.fn(async ({ where }: { where: { storyId: { in: string[] } } }) => {
        deleted.views.push(...where.storyId.in);
        return { count: where.storyId.in.length };
      }),
    },
    storyLike: {
      deleteMany: vi.fn(async ({ where }: { where: { storyId: { in: string[] } } }) => {
        deleted.likes.push(...where.storyId.in);
        return { count: where.storyId.in.length };
      }),
    },
    storyComment: {
      deleteMany: vi.fn(async ({ where }: { where: { storyId: { in: string[] } } }) => {
        deleted.comments.push(...where.storyId.in);
        return { count: where.storyId.in.length };
      }),
    },
  };
  return { prisma, deleted };
}

function makeStorage(): { storage: StoryStorage; deletedKeys: string[] } {
  const deletedKeys: string[] = [];
  const storage: StoryStorage = {
    deleteMany: vi.fn(async (keys: string[]) => {
      deletedKeys.push(...keys);
    }),
  };
  return { storage, deletedKeys };
}

const NOW = new Date('2026-10-29T12:00:00Z');
const hour = 3600_000;

describe('sweepExpiredStories', () => {
  it('deletes expired stories, their engagement rows, and their storage blobs', async () => {
    const { prisma, deleted } = makePrisma([
      {
        id: 's1',
        userId: 'u1',
        mediaUrl: 'https://storage.example.com/quantchat-media/u1/media_abc/photo.jpg',
        expiresAt: new Date(NOW.getTime() - hour),
      },
    ]);
    const { storage, deletedKeys } = makeStorage();

    const result: StoryExpirySweepResult = await sweepExpiredStories(prisma, storage, undefined, NOW);

    expect(result.expiredStories).toBe(1);
    expect(deleted.stories).toEqual(['s1']);
    expect(deleted.views).toEqual(['s1']);
    expect(deleted.likes).toEqual(['s1']);
    expect(deleted.comments).toEqual(['s1']);
    expect(deletedKeys).toEqual(['u1/media_abc/photo.jpg']);
    expect(result.deletedObjects).toBe(1);
    expect(result.orphanedObjects).toBe(0);
  });

  it('leaves non-expired stories untouched', async () => {
    const { prisma, deleted } = makePrisma([
      { id: 's1', userId: 'u1', mediaUrl: null, expiresAt: new Date(NOW.getTime() + hour) },
    ]);
    const { storage, deletedKeys } = makeStorage();

    const result = await sweepExpiredStories(prisma, storage, undefined, NOW);

    expect(result.expiredStories).toBe(0);
    expect(deleted.stories).toEqual([]);
    expect(deletedKeys).toEqual([]);
  });

  it('skips storage deletion for inline data: URLs but still expires the row', async () => {
    const { prisma, deleted } = makePrisma([
      { id: 's1', userId: 'u1', mediaUrl: 'data:image/jpeg;base64,AAAA', expiresAt: new Date(NOW.getTime() - hour) },
    ]);
    const { storage, deletedKeys } = makeStorage();

    const result = await sweepExpiredStories(prisma, storage, undefined, NOW);

    expect(result.expiredStories).toBe(1);
    expect(deletedKeys).toEqual([]);
    expect(result.deletedObjects).toBe(0);
  });

  it('refuses to delete storage objects outside the author namespace', async () => {
    const { prisma } = makePrisma([
      // Forged row: mediaUrl points at another user's object.
      {
        id: 's1',
        userId: 'u1',
        mediaUrl: 'https://storage.example.com/quantchat-media/victim/media_xyz/evil.jpg',
        expiresAt: new Date(NOW.getTime() - hour),
      },
    ]);
    const { storage, deletedKeys } = makeStorage();

    const result = await sweepExpiredStories(prisma, storage, undefined, NOW);

    expect(result.expiredStories).toBe(1); // the row still expires
    expect(deletedKeys).toEqual([]); // but nobody else's object is touched
    expect(result.skippedKeys.length).toBe(1);
  });

  it('expires DB rows even when storage is not configured, reporting orphans honestly', async () => {
    const { prisma, deleted } = makePrisma([
      {
        id: 's1',
        userId: 'u1',
        mediaUrl: 'https://storage.example.com/quantchat-media/u1/media_abc/photo.jpg',
        expiresAt: new Date(NOW.getTime() - hour),
      },
    ]);

    const result = await sweepExpiredStories(prisma, null, undefined, NOW);

    expect(result.expiredStories).toBe(1);
    expect(deleted.stories).toEqual(['s1']);
    expect(result.deletedObjects).toBe(0);
    expect(result.orphanedObjects).toBe(1);
  });

  it('still expires DB rows when the object store is down (best-effort storage)', async () => {
    const { prisma, deleted } = makePrisma([
      {
        id: 's1',
        userId: 'u1',
        mediaUrl: 'https://storage.example.com/quantchat-media/u1/media_abc/photo.jpg',
        expiresAt: new Date(NOW.getTime() - hour),
      },
    ]);
    const store = makeStorage();
    (store.storage.deleteMany as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('object store down'),
    );

    const result = await sweepExpiredStories(prisma, store.storage, undefined, NOW);

    expect(result.expiredStories).toBe(1);
    expect(deleted.stories).toEqual(['s1']);
    expect(result.orphanedObjects).toBe(1);
  });

  it('returns zeros when nothing expired', async () => {
    const { prisma } = makePrisma([]);
    const { storage } = makeStorage();
    const result = await sweepExpiredStories(prisma, storage, undefined, NOW);
    expect(result).toMatchObject({
      expiredStories: 0,
      deletedDbRows: 0,
      deletedObjects: 0,
      orphanedObjects: 0,
    });
  });
});
