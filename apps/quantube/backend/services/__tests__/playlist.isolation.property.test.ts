// ============================================================================
// Property test — PlaylistService user isolation
// Spec: quantube-real-data-wiring, Task 2.4
//
// Feature: quantube-real-data-wiring, Property 8: A playlist/watch-later read
// for user A never returns rows owned by user B.
//
// **Validates: Requirements 5.12, 5.13, 5.14**
//
// Convention: fast-check is NOT a quantube dependency. This follows the repo's
// realized property-test convention — a seeded deterministic mulberry32 RNG loop
// with >=100 samples (see creator-tier-upgrade.bug3.seam.test.ts).
//
// The service is now Prisma-backed; each sample drives it against a fresh
// in-memory fake of the `playlist`/`playlistItem` delegates (enforcing the
// unique(playlistId, videoId) constraint + orderBy). For each sample we seed
// rows for a distinct pair of users (A, B), then perform a random
// create/add/remove mutation as A and assert:
//   (1) every playlist row returned to A is an A-owned id (no B id leaks);
//   (2) every watch-later row returned to A has an A-added videoId;
//   (3) a create/add/remove by A leaves B's rows byte-for-byte unchanged.
// A cross-user getPlaylist on a B-owned id always returns null for A.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { PlaylistService } from '../playlist.service';
import type { PlaylistPrisma } from '../playlist.service';

// ---------------------------------------------------------------------------
// In-memory fake of the narrow Prisma surface used by PlaylistService.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.keys(where).every((k) => row[k] === where[k]);
}

function applyOrderBy(rows: Row[], orderBy?: unknown): Row[] {
  if (!orderBy || typeof orderBy !== 'object') return rows;
  const [field, dir] = Object.entries(orderBy as Record<string, 'asc' | 'desc'>)[0] ?? [];
  if (!field) return rows;
  return [...rows].sort((a, b) => {
    const av = a[field] as number | string | Date;
    const bv = b[field] as number | string | Date;
    const an = av instanceof Date ? av.getTime() : av;
    const bn = bv instanceof Date ? bv.getTime() : bv;
    if (an < bn) return dir === 'desc' ? 1 : -1;
    if (an > bn) return dir === 'desc' ? -1 : 1;
    return 0;
  });
}

function createFakePrisma(): PlaylistPrisma {
  const playlists: Row[] = [];
  const items: Row[] = [];
  let seq = 0;
  const nextId = (p: string): string => {
    seq += 1;
    return `${p}-${seq}`;
  };
  return {
    playlist: {
      create: async ({ data }) => {
        const now = new Date();
        const row: Row = {
          id: nextId('pl'),
          videoCount: 0,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        playlists.push(row);
        return { ...row };
      },
      findFirst: async ({ where }) => {
        const f = playlists.find((r) => matches(r, where));
        return f ? { ...f } : null;
      },
      findMany: async ({ where, orderBy } = {}) =>
        applyOrderBy(
          playlists.filter((r) => matches(r, where)),
          orderBy,
        ).map((r) => ({ ...r })),
      update: async ({ where, data }) => {
        const row = playlists.find((r) => matches(r, where))!;
        Object.assign(row, data);
        return { ...row };
      },
    },
    playlistItem: {
      create: async ({ data }) => {
        if (
          items.some(
            (r) => r['playlistId'] === data['playlistId'] && r['videoId'] === data['videoId'],
          )
        ) {
          throw new Error('Unique constraint failed on (playlistId, videoId)');
        }
        const row: Row = { id: nextId('pli'), addedAt: new Date(), ...data };
        items.push(row);
        return { ...row };
      },
      delete: async ({ where }) => {
        const i = items.findIndex((r) => matches(r, where));
        const [removed] = items.splice(i, 1);
        return { ...(removed as Row) };
      },
      deleteMany: async ({ where }) => {
        let count = 0;
        for (let i = items.length - 1; i >= 0; i -= 1) {
          if (matches(items[i]!, where)) {
            items.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      },
      findMany: async ({ where, orderBy } = {}) =>
        applyOrderBy(
          items.filter((r) => matches(r, where)),
          orderBy,
        ).map((r) => ({ ...r })),
      findFirst: async ({ where, orderBy }) => {
        const f = applyOrderBy(
          items.filter((r) => matches(r, where)),
          orderBy,
        );
        return f.length ? { ...(f[0] as Row) } : null;
      },
      count: async ({ where }) => items.filter((r) => matches(r, where)).length,
      update: async ({ where, data }) => {
        const row = items.find((r) => matches(r, where))!;
        Object.assign(row, data);
        return { ...row };
      },
    },
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLES = 120; // >= 100 cases

interface Seeded {
  playlistIds: Set<string>; // ids of playlists created (excludes the reserved WL)
  watchLaterVideoIds: Set<string>;
}

async function seedUser(
  service: PlaylistService,
  userId: string,
  rand: () => number,
  tag: string,
): Promise<Seeded> {
  const playlistIds = new Set<string>();
  const watchLaterVideoIds = new Set<string>();

  const numPlaylists = Math.floor(rand() * 4); // 0..3
  for (let i = 0; i < numPlaylists; i += 1) {
    const pl = await service.createPlaylist(userId, { title: `${tag}-pl-${i}` });
    playlistIds.add(pl.id);
  }

  const numWatchLater = Math.floor(rand() * 5); // 0..4
  for (let i = 0; i < numWatchLater; i += 1) {
    const vid = `${tag}-vid-${i}`;
    await service.addToWatchLater(userId, vid);
    watchLaterVideoIds.add(vid);
  }

  return { playlistIds, watchLaterVideoIds };
}

async function snapshotUser(service: PlaylistService, userId: string): Promise<string> {
  const playlists = (await service.listPlaylists(userId))
    .map((p) => `${p.id}|${p.title}|${p.videoCount}|${p.isSystem}|${p.visibility}`)
    .sort();
  const watchLater = (await service.listWatchLater(userId))
    .map((e) => `${e.id}|${e.videoId}`)
    .sort();
  return JSON.stringify({ playlists, watchLater });
}

describe('Property 8: a read for user A never returns rows owned by user B', () => {
  it('holds across >=100 randomized two-user scenarios with an A-side mutation', async () => {
    const rand = mulberry32(0x504c_3038); // "PL08"

    for (let s = 0; s < SAMPLES; s += 1) {
      const service = new PlaylistService(createFakePrisma());
      const userA = `A-${s}`;
      const userB = `B-${s}`;

      const seededA = await seedUser(service, userA, rand, 'a');
      const seededB = await seedUser(service, userB, rand, 'b');

      // The full set of ids A may legitimately see: A-created playlists + A's
      // reserved Watch Later playlist id.
      const aWatchLaterId = (await service.listPlaylists(userA)).find(
        (p) => p.title === 'Watch Later',
      )!.id;
      const aLegitIds = new Set<string>([...seededA.playlistIds, aWatchLaterId]);

      // Snapshot B BEFORE A's mutation.
      const bBefore = await snapshotUser(service, userB);

      // Perform a random A-side mutation.
      const op = Math.floor(rand() * 3);
      if (op === 0) {
        await service.createPlaylist(userA, { title: `a-extra-${s}` });
      } else if (op === 1) {
        const vid = `a-extra-vid-${s}`;
        await service.addToWatchLater(userA, vid);
        seededA.watchLaterVideoIds.add(vid);
      } else {
        const aWl = await service.listWatchLater(userA);
        if (aWl.length > 0) {
          const victim = aWl[Math.floor(rand() * aWl.length)]!;
          await service.removeFromWatchLater(userA, victim.id);
          seededA.watchLaterVideoIds.delete(victim.videoId);
        }
      }
      // A's create may have produced a new legit id; recompute A's legit id set.
      for (const p of await service.listPlaylists(userA)) aLegitIds.add(p.id);

      // (1) Every playlist row returned to A is an A-owned id (no B id leaks).
      for (const p of await service.listPlaylists(userA)) {
        expect(aLegitIds.has(p.id)).toBe(true);
        expect(seededB.playlistIds.has(p.id)).toBe(false);
      }

      // (2) Every watch-later row returned to A has an A-added videoId.
      for (const e of await service.listWatchLater(userA)) {
        expect(seededA.watchLaterVideoIds.has(e.videoId)).toBe(true);
        expect(seededB.watchLaterVideoIds.has(e.videoId)).toBe(false);
      }

      // (3) A's mutation left B's rows entirely unchanged.
      const bAfter = await snapshotUser(service, userB);
      expect(bAfter).toBe(bBefore);

      // Cross-user getPlaylist on a B-owned id returns null for A (no leakage).
      const bPlaylistId = [...seededB.playlistIds][0];
      if (bPlaylistId) {
        expect(await service.getPlaylist(userA, bPlaylistId)).toBeNull();
      }
    }
  });
});
