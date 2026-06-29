// ============================================================================
// Unit tests — PlaylistService (Prisma-backed service, driven by an in-memory
// fake of the `playlist` / `playlistItem` delegates — no app boot, no Postgres)
// Spec: quantube-real-data-wiring, Task 2.2
// Requirements: 5.6, 5.9, 5.13, 2.14, 2.15, 2.16, 3.3, 3.8, 3.9
// ============================================================================
//
// The fake faithfully models the two delegates the service uses: it assigns
// opaque ids + timestamps, enforces the unique(playlistId, videoId) constraint,
// and supports orderBy on createdAt / position. EVERYTHING ELSE (validation,
// visibility mapping, watch-later reservation, idempotency, re-indexing) is the
// REAL service logic under test.

import { describe, it, expect, beforeEach } from 'vitest';
import { PlaylistService, PlaylistValidationError } from '../playlist.service';
import type { PlaylistPrisma } from '../playlist.service';

// ---------------------------------------------------------------------------
// In-memory fake of the narrow Prisma surface used by PlaylistService.
// ---------------------------------------------------------------------------
interface Row {
  [k: string]: unknown;
}

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.keys(where).every((k) => row[k] === where[k]);
}

function applyOrderBy<T extends Row>(rows: T[], orderBy?: unknown): T[] {
  if (!orderBy || typeof orderBy !== 'object') return rows;
  const spec = orderBy as Record<string, 'asc' | 'desc'>;
  const [field, dir] = Object.entries(spec)[0] ?? [];
  if (!field) return rows;
  // Stable sort (Array.prototype.sort is stable) preserves insertion order on ties.
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

export function createFakePrisma(): PlaylistPrisma {
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
          channelId: null,
          description: null,
          videoCount: 0,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        playlists.push(row);
        return { ...row };
      },
      findFirst: async ({ where }) => {
        const found = playlists.find((r) => matches(r, where));
        return found ? { ...found } : null;
      },
      findMany: async ({ where, orderBy } = {}) => {
        const filtered = playlists.filter((r) => matches(r, where));
        return applyOrderBy(filtered, orderBy).map((r) => ({ ...r }));
      },
      update: async ({ where, data }) => {
        const row = playlists.find((r) => matches(r, where));
        if (!row) throw new Error(`playlist not found: ${JSON.stringify(where)}`);
        Object.assign(row, data);
        return { ...row };
      },
      delete: async ({ where }) => {
        const i = playlists.findIndex((r) => matches(r, where));
        if (i < 0) throw new Error(`playlist not found: ${JSON.stringify(where)}`);
        const [removed] = playlists.splice(i, 1);
        return { ...(removed as Row) };
      },
    },
    playlistItem: {
      create: async ({ data }) => {
        const playlistId = data['playlistId'];
        const videoId = data['videoId'];
        // Enforce @@unique([playlistId, videoId]).
        if (items.some((r) => r['playlistId'] === playlistId && r['videoId'] === videoId)) {
          throw new Error('Unique constraint failed on (playlistId, videoId)');
        }
        const row: Row = { id: nextId('pli'), addedAt: new Date(), ...data };
        items.push(row);
        return { ...row };
      },
      delete: async ({ where }) => {
        const i = items.findIndex((r) => matches(r, where));
        if (i < 0) throw new Error(`playlistItem not found: ${JSON.stringify(where)}`);
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
      findMany: async ({ where, orderBy } = {}) => {
        const filtered = items.filter((r) => matches(r, where));
        return applyOrderBy(filtered, orderBy).map((r) => ({ ...r }));
      },
      findFirst: async ({ where, orderBy }) => {
        const filtered = applyOrderBy(
          items.filter((r) => matches(r, where)),
          orderBy,
        );
        return filtered.length ? { ...(filtered[0] as Row) } : null;
      },
      count: async ({ where }) => items.filter((r) => matches(r, where)).length,
      update: async ({ where, data }) => {
        const row = items.find((r) => matches(r, where));
        if (!row) throw new Error(`playlistItem not found: ${JSON.stringify(where)}`);
        Object.assign(row, data);
        return { ...row };
      },
    },
  };
}

describe('PlaylistService', () => {
  let service: PlaylistService;

  beforeEach(() => {
    service = new PlaylistService(createFakePrisma());
  });

  describe('exposes exactly the required operations (Req 5.6)', () => {
    it('has the six named methods', () => {
      expect(typeof service.listPlaylists).toBe('function');
      expect(typeof service.getPlaylist).toBe('function');
      expect(typeof service.createPlaylist).toBe('function');
      expect(typeof service.listWatchLater).toBe('function');
      expect(typeof service.addToWatchLater).toBe('function');
      expect(typeof service.removeFromWatchLater).toBe('function');
    });
  });

  describe('createPlaylist + listPlaylists + getPlaylist', () => {
    it('creates a playlist and returns it in the list', async () => {
      const created = await service.createPlaylist('user-1', { title: 'My Mix' });
      const list = await service.listPlaylists('user-1');

      expect(created.title).toBe('My Mix');
      expect(list.some((p) => p.id === created.id && p.title === 'My Mix')).toBe(true);
    });

    it('getPlaylist returns detail meta + empty videos for a new playlist (Req 2.11)', async () => {
      const created = await service.createPlaylist('user-1', { title: 'Empty PL' });
      const detail = await service.getPlaylist('user-1', created.id);

      expect(detail).not.toBeNull();
      expect(detail!.playlist.id).toBe(created.id);
      expect(detail!.playlist.title).toBe('Empty PL');
      expect(detail!.videos).toEqual([]);
    });

    it('getPlaylist returns null for an unknown id (Req 5.9)', async () => {
      expect(await service.getPlaylist('user-1', 'does-not-exist')).toBeNull();
    });
  });

  describe('Watch Later system-playlist reservation (Req 3.3)', () => {
    it('reserves a "Watch Later" system playlist per user with server-set isSystem=true', async () => {
      const list = await service.listPlaylists('user-1');
      const wl = list.find((p) => p.title === 'Watch Later');

      expect(wl).toBeDefined();
      expect(wl!.isSystem).toBe(true);
      expect(wl!.visibility).toBe('private');
    });

    it('each user gets their own isolated Watch Later', async () => {
      const a = (await service.listPlaylists('user-a')).find((p) => p.title === 'Watch Later')!;
      const b = (await service.listPlaylists('user-b')).find((p) => p.title === 'Watch Later')!;
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('createPlaylist defaults + server assignment (Req 2.15, 2.16)', () => {
    it('defaults visibility to private when omitted (Req 2.15)', async () => {
      const created = await service.createPlaylist('user-1', { title: 'No Visibility' });
      expect(created.visibility).toBe('private');
    });

    it('honors a supplied valid visibility', async () => {
      const created = await service.createPlaylist('user-1', {
        title: 'Public PL',
        visibility: 'public',
      });
      expect(created.visibility).toBe('public');
    });

    it('server-assigns isSystem=false and ignores a client-supplied isSystem (Req 2.16)', async () => {
      const created = await service.createPlaylist('user-1', {
        title: 'Sneaky',
        // A client may forward isSystem; the server must ignore it.
        isSystem: true,
      });
      expect(created.isSystem).toBe(false);
    });
  });

  describe('createPlaylist title trim + length validation (Req 2.14)', () => {
    it('trims whitespace around the title', async () => {
      const created = await service.createPlaylist('user-1', { title: '  Trimmed  ' });
      expect(created.title).toBe('Trimmed');
    });

    it('rejects an empty title', async () => {
      await expect(service.createPlaylist('user-1', { title: '' })).rejects.toThrow(
        PlaylistValidationError,
      );
    });

    it('rejects a whitespace-only title (trimmed length 0)', async () => {
      await expect(service.createPlaylist('user-1', { title: '    ' })).rejects.toThrow(
        PlaylistValidationError,
      );
    });

    it('rejects a title longer than 200 characters after trimming', async () => {
      await expect(service.createPlaylist('user-1', { title: 'x'.repeat(201) })).rejects.toThrow(
        PlaylistValidationError,
      );
    });

    it('accepts a title of exactly 200 characters (boundary)', async () => {
      const created = await service.createPlaylist('user-1', { title: 'x'.repeat(200) });
      expect(created.title.length).toBe(200);
    });

    it('does not create a playlist when validation fails', async () => {
      const before = (await service.listPlaylists('user-1')).length;
      await expect(service.createPlaylist('user-1', { title: '' })).rejects.toThrow();
      const after = (await service.listPlaylists('user-1')).length;
      expect(after).toBe(before);
    });
  });

  describe('user isolation (Req 5.13)', () => {
    it('cross-user getPlaylist returns null (no existence leakage)', async () => {
      const created = await service.createPlaylist('owner', { title: 'Owned' });
      // Another user requesting the same id sees exactly null — same as unknown.
      expect(await service.getPlaylist('intruder', created.id)).toBeNull();
    });

    it('listPlaylists for one user excludes another user-created playlist', async () => {
      const created = await service.createPlaylist('owner', { title: 'Owned' });
      const otherList = await service.listPlaylists('intruder');
      expect(otherList.some((p) => p.id === created.id)).toBe(false);
    });
  });

  describe('watch later: add idempotency + ordering (Req 3.8, 3.7)', () => {
    it('adding the same videoId twice creates no duplicate and returns the existing entry', async () => {
      const first = await service.addToWatchLater('user-1', 'vid-1');
      const second = await service.addToWatchLater('user-1', 'vid-1');

      expect(second.id).toBe(first.id);
      const list = await service.listWatchLater('user-1');
      expect(list.filter((e) => e.videoId === 'vid-1')).toHaveLength(1);
      expect(list).toHaveLength(1);
    });

    it('returns watch-later entries most-recently-added-first', async () => {
      await service.addToWatchLater('user-1', 'vid-1');
      await service.addToWatchLater('user-1', 'vid-2');
      await service.addToWatchLater('user-1', 'vid-3');

      const list = await service.listWatchLater('user-1');
      expect(list.map((e) => e.videoId)).toEqual(['vid-3', 'vid-2', 'vid-1']);
    });

    it('re-adding an existing video preserves the original order', async () => {
      await service.addToWatchLater('user-1', 'vid-1');
      await service.addToWatchLater('user-1', 'vid-2');
      await service.addToWatchLater('user-1', 'vid-1'); // idempotent re-add

      const list = await service.listWatchLater('user-1');
      expect(list.map((e) => e.videoId)).toEqual(['vid-2', 'vid-1']);
    });
  });

  describe('watch later: remove idempotency (Req 3.9)', () => {
    it('removes an existing entry', async () => {
      const entry = await service.addToWatchLater('user-1', 'vid-1');
      await service.removeFromWatchLater('user-1', entry.id);
      expect(await service.listWatchLater('user-1')).toHaveLength(0);
    });

    it('removing an absent entry is a no-op (does not throw)', async () => {
      await service.addToWatchLater('user-1', 'vid-1');
      await expect(
        service.removeFromWatchLater('user-1', 'no-such-entry'),
      ).resolves.toBeUndefined();
      expect(await service.listWatchLater('user-1')).toHaveLength(1);
    });

    it('watch-later mutations on one user do not affect another (Req 5.13)', async () => {
      await service.addToWatchLater('user-a', 'vid-1');
      await service.addToWatchLater('user-b', 'vid-2');

      const aList = await service.listWatchLater('user-a');
      await service.removeFromWatchLater('user-a', aList[0]!.id);

      expect(await service.listWatchLater('user-a')).toHaveLength(0);
      expect((await service.listWatchLater('user-b')).map((e) => e.videoId)).toEqual(['vid-2']);
    });
  });

  describe('addToPlaylist (regular playlist video management)', () => {
    it('appends a video at the next contiguous position and bumps videoCount', async () => {
      const pl = await service.createPlaylist('user-1', { title: 'Mix' });
      const e1 = await service.addToPlaylist('user-1', pl.id, 'vid-1');
      const e2 = await service.addToPlaylist('user-1', pl.id, 'vid-2');

      expect(e1).not.toBeNull();
      expect(e1!.videoId).toBe('vid-1');
      expect(e1!.position).toBe(1);
      expect(e2!.position).toBe(2);

      const detail = await service.getPlaylist('user-1', pl.id);
      expect(detail!.videos.map((v) => v.videoId)).toEqual(['vid-1', 'vid-2']);
      expect(detail!.playlist.videoCount).toBe(2);
    });

    it('is idempotent: re-adding the same video returns the existing entry, no duplicate', async () => {
      const pl = await service.createPlaylist('user-1', { title: 'Mix' });
      const first = await service.addToPlaylist('user-1', pl.id, 'vid-1');
      await service.addToPlaylist('user-1', pl.id, 'vid-2');
      const again = await service.addToPlaylist('user-1', pl.id, 'vid-1');

      expect(again!.id).toBe(first!.id);
      expect(again!.position).toBe(first!.position);
      const detail = await service.getPlaylist('user-1', pl.id);
      expect(detail!.videos.map((v) => v.videoId)).toEqual(['vid-1', 'vid-2']);
      expect(detail!.videos).toHaveLength(2);
    });

    it('returns null for an unknown playlist id (route -> 404)', async () => {
      expect(await service.addToPlaylist('user-1', 'no-such-playlist', 'vid-1')).toBeNull();
    });

    it('returns null when the playlist belongs to another user (cross-user, no leakage)', async () => {
      const pl = await service.createPlaylist('owner', { title: 'Owned' });
      expect(await service.addToPlaylist('intruder', pl.id, 'vid-1')).toBeNull();
      // The owner's playlist is unchanged.
      const detail = await service.getPlaylist('owner', pl.id);
      expect(detail!.videos).toHaveLength(0);
    });
  });

  describe('removeFromPlaylist (regular playlist video management)', () => {
    it('removes an entry and re-indexes survivors to a contiguous 1..n permutation', async () => {
      const pl = await service.createPlaylist('user-1', { title: 'Mix' });
      const e1 = await service.addToPlaylist('user-1', pl.id, 'vid-1');
      await service.addToPlaylist('user-1', pl.id, 'vid-2');
      await service.addToPlaylist('user-1', pl.id, 'vid-3');

      const ok = await service.removeFromPlaylist('user-1', pl.id, e1!.id);
      expect(ok).toBe(true);

      const detail = await service.getPlaylist('user-1', pl.id);
      expect(detail!.videos.map((v) => v.videoId)).toEqual(['vid-2', 'vid-3']);
      expect(detail!.videos.map((v) => v.position)).toEqual([1, 2]); // re-indexed, no gaps
      expect(detail!.playlist.videoCount).toBe(2);
    });

    it('is an idempotent no-op when the entry is absent (playlist exists -> true)', async () => {
      const pl = await service.createPlaylist('user-1', { title: 'Mix' });
      await service.addToPlaylist('user-1', pl.id, 'vid-1');

      const ok = await service.removeFromPlaylist('user-1', pl.id, 'no-such-entry');
      expect(ok).toBe(true); // playlist found; absent entry is a no-op
      const detail = await service.getPlaylist('user-1', pl.id);
      expect(detail!.videos).toHaveLength(1);
    });

    it('returns false for an unknown playlist id (route -> 404)', async () => {
      expect(await service.removeFromPlaylist('user-1', 'no-such-playlist', 'e')).toBe(false);
    });

    it('returns false when the playlist belongs to another user (cross-user)', async () => {
      const pl = await service.createPlaylist('owner', { title: 'Owned' });
      const e1 = await service.addToPlaylist('owner', pl.id, 'vid-1');
      expect(await service.removeFromPlaylist('intruder', pl.id, e1!.id)).toBe(false);
      // Owner's entry is untouched.
      const detail = await service.getPlaylist('owner', pl.id);
      expect(detail!.videos).toHaveLength(1);
    });
  });

  describe('deletePlaylist', () => {
    it('deletes an owned regular playlist and its items, returning { deleted: true }', async () => {
      const pl = await service.createPlaylist('user-1', { title: 'Mix' });
      await service.addToPlaylist('user-1', pl.id, 'vid-1');
      await service.addToPlaylist('user-1', pl.id, 'vid-2');

      const result = await service.deletePlaylist('user-1', pl.id);
      expect(result).toEqual({ deleted: true });

      // Gone from the list and not resolvable by id.
      expect((await service.listPlaylists('user-1')).some((p) => p.id === pl.id)).toBe(false);
      expect(await service.getPlaylist('user-1', pl.id)).toBeNull();
    });

    it('refuses to delete the reserved Watch Later system playlist (throws -> route 400)', async () => {
      const wl = (await service.listPlaylists('user-1')).find((p) => p.title === 'Watch Later')!;
      await expect(service.deletePlaylist('user-1', wl.id)).rejects.toThrow(
        PlaylistValidationError,
      );
      // Still present after the refused delete.
      expect((await service.listPlaylists('user-1')).some((p) => p.id === wl.id)).toBe(true);
    });

    it('returns null for an unknown playlist id (route -> 404)', async () => {
      expect(await service.deletePlaylist('user-1', 'no-such-playlist')).toBeNull();
    });

    it('returns null when the playlist belongs to another user (cross-user -> 404)', async () => {
      const pl = await service.createPlaylist('owner', { title: 'Owned' });
      expect(await service.deletePlaylist('intruder', pl.id)).toBeNull();
      // Owner's playlist is untouched.
      expect(await service.getPlaylist('owner', pl.id)).not.toBeNull();
    });
  });
});
