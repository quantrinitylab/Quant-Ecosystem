// ============================================================================
// Property test — PlaylistService playlist position invariant
// Spec: quantube-real-data-wiring, Task 2.3
//
// Feature: quantube-real-data-wiring, Property 7: In any PlaylistDetailResponse,
// videos positions form a contiguous permutation of 1..n with no duplicates.
//
// **Validates: Requirements 2.10, 2.11**
//
// Convention: fast-check is NOT a quantube dependency. This follows the repo's
// realized property-test convention — a seeded deterministic mulberry32 RNG loop
// with >=100 samples (see creator-tier-upgrade.bug3.seam.test.ts).
//
// The service is now Prisma-backed; each sample drives it against a fresh
// in-memory fake of the `playlist`/`playlistItem` delegates (enforcing the
// unique(playlistId, videoId) constraint + orderBy). The only service
// operations that populate a playlist's videos are the Watch Later add/remove
// operations (Watch Later is itself a reserved system playlist). So this test
// drives random add/remove sequences against a user's Watch Later playlist,
// reads it back via getPlaylist, and asserts the position invariant — including
// the empty (n=0) case where it holds vacuously.
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

// Deterministic seeded RNG (mulberry32) — mirrors the repo PBT convention.
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

async function watchLaterId(service: PlaylistService, userId: string): Promise<string> {
  const wl = (await service.listPlaylists(userId)).find((p) => p.title === 'Watch Later');
  if (!wl) throw new Error('Watch Later playlist not reserved');
  return wl.id;
}

describe('Property 7: playlist video positions form a contiguous permutation of 1..n', () => {
  it('holds across >=100 randomized add/remove sequences (incl. empty)', async () => {
    const rand = mulberry32(0x504c_3037); // "PL07"
    let emptyCasesSeen = 0;
    let nonEmptyCasesSeen = 0;

    for (let s = 0; s < SAMPLES; s += 1) {
      const service = new PlaylistService(createFakePrisma());
      const userId = `user-${s}`;

      // Random number of distinct videos to add (0..25), so n includes 0.
      const addCount = Math.floor(rand() * 26);
      for (let i = 0; i < addCount; i += 1) {
        await service.addToWatchLater(userId, `vid-${i}`);
      }

      // Random number of removals of currently-present entries (0..addCount+3,
      // some may target already-removed/absent ids => idempotent no-ops).
      const removeCount = Math.floor(rand() * (addCount + 4));
      for (let r = 0; r < removeCount; r += 1) {
        const current = await service.listWatchLater(userId);
        if (current.length === 0) break;
        const victim = current[Math.floor(rand() * current.length)]!;
        await service.removeFromWatchLater(userId, victim.id);
      }

      const wlId = await watchLaterId(service, userId);
      const detail = await service.getPlaylist(userId, wlId);
      expect(detail).not.toBeNull();
      const positions = detail!.videos.map((v) => v.position);
      const n = positions.length;

      if (n === 0) {
        emptyCasesSeen += 1;
        // Invariant holds vacuously; videos must be exactly [].
        expect(detail!.videos).toEqual([]);
        continue;
      }
      nonEmptyCasesSeen += 1;

      // Sorted positions equal [1..n] exactly => unique, no gaps, contiguous.
      const sorted = [...positions].sort((a, b) => a - b);
      const expected = Array.from({ length: n }, (_, i) => i + 1);
      expect(sorted).toEqual(expected);
      // Unique (no duplicates).
      expect(new Set(positions).size).toBe(n);
    }

    // Sanity: the generator exercised both empty and non-empty playlists.
    expect(nonEmptyCasesSeen).toBeGreaterThan(0);
    expect(emptyCasesSeen).toBeGreaterThan(0);
  });
});
