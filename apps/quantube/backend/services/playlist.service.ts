// ============================================================================
// QuantTube - PlaylistService (Prisma-backed, durable)
// ----------------------------------------------------------------------------
// Persists the Library "Playlists" and "Watch Later" surfaces and the
// playlist/[id] detail page to Postgres via Prisma. Replaces the previous
// in-memory implementation so playlist + watch-later state survives restarts.
//
// Design notes (see .kiro/specs/quantube-real-data-wiring/design.md):
//   * Persistence is via the `Playlist` model (with a server-set `isSystem`
//     boolean) and the `PlaylistItem` membership model
//     (@@unique([playlistId, videoId])). The service receives a NARROW DI'd
//     prisma surface (`PlaylistPrisma`) over just the `playlist` and
//     `playlistItem` delegates it actually uses (the same DI pattern as
//     ChannelService / VideoService in this app).
//   * Ownership is enforced in the QUERY (every read/write filters by
//     `userId`), so a cross-user `getPlaylist` resolves to `null` exactly like
//     an unknown id — no existence leakage.
//   * This service has NO dependency on VideoService. It stores only raw
//     videoIds + positions + timestamps. Enrichment of video metadata
//     (title/thumbnail/channelName/duration) happens at the ROUTE layer, which
//     is why getPlaylist / listWatchLater return thin entries
//     ({ id, videoId, position, addedAt } / { id, videoId, addedAt }).
//   * Watch Later is modeled as a server-reserved *system playlist* per user
//     (isSystem = true, server-set). Its items ARE the watch-later entries;
//     listWatchLater returns those entries most-recently-added-first. The
//     reserved playlist is created LAZILY the first time a user touches the
//     surface (Req 3.3).
//   * Visibility is mapped at the boundary: the page contract uses lowercase
//     'public' | 'private' | 'unlisted'; Prisma's `VideoVisibility` enum uses
//     PUBLIC | UNLISTED | PRIVATE. Conversion happens in both directions.
//   * The decorative fields (thumbnail / coverUrl / creatorName /
//     creatorAvatar / collaborative / totalDuration) are not columns, so they
//     return their previous defaults ('' / false / 0) exactly as before. The
//     route recomputes `totalDuration` from the enriched per-video durations.
//   * Item positions are kept a contiguous 1..n permutation: appends land at
//     `count + 1`; a removal re-indexes the remaining items.
// ============================================================================

/** Visibility values accepted for a playlist (mirrors library.tsx PlaylistData). */
export type PlaylistVisibility = 'public' | 'private' | 'unlisted';

/** The Prisma `VideoVisibility` enum values reused by the `Playlist` model. */
type PrismaVisibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

/**
 * Input accepted by {@link PlaylistService.createPlaylist}. `isSystem` is
 * intentionally NOT part of the input — it is always server-assigned. If a
 * client supplies it the service ignores it (Req 2.16, 3.3).
 */
export interface CreatePlaylistInput {
  title: string;
  visibility?: PlaylistVisibility;
  description?: string;
  // Any client-supplied `isSystem` is ignored; declared here only so callers
  // forwarding raw bodies type-check. It is never read.
  isSystem?: boolean;
}

/**
 * Library "Playlists" tab list shape — structurally matches the page-local
 * `PlaylistData` exported from src/pages/library.tsx (Req 8.1, 8.4).
 */
export interface PlaylistListItem {
  id: string;
  title: string;
  thumbnail: string;
  videoCount: number;
  visibility: PlaylistVisibility;
  isSystem: boolean;
  updatedAt: string; // ISO-8601 UTC
}

/**
 * Playlist detail meta — structurally matches the page-local `PlaylistData`
 * (detail variant) exported from src/pages/playlist/[id].tsx.
 *
 * `totalDuration` is returned as 0 here; the route recomputes it from the
 * enriched per-video durations (the service holds no durations).
 */
export interface PlaylistDetailMeta {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  creatorName: string;
  creatorAvatar: string;
  videoCount: number;
  totalDuration: number;
  isPublic: boolean;
  collaborative: boolean;
  createdAt: string; // ISO-8601 UTC
  updatedAt: string; // ISO-8601 UTC
}

/**
 * A thin, un-enriched playlist video entry. The route enriches each into the
 * page-local `PlaylistVideo` using VideoService(videoId).
 */
export interface PlaylistVideoEntry {
  id: string;
  videoId: string;
  position: number; // contiguous 1..n, unique, no gaps
  addedAt: string; // ISO-8601 UTC
}

/** Result of {@link PlaylistService.getPlaylist}. */
export interface PlaylistDetailResult {
  playlist: PlaylistDetailMeta;
  videos: PlaylistVideoEntry[];
}

/**
 * A thin, un-enriched watch-later entry. The route enriches each into the
 * page-local `WatchLaterItem` using VideoService(videoId).
 */
export interface WatchLaterEntry {
  id: string;
  videoId: string;
  addedAt: string; // ISO-8601 UTC
}

/**
 * Validation failure raised by the service (e.g. an out-of-range title). The
 * route maps this class to a deterministic 400 envelope. Defined locally so the
 * service has no dependency on @quant/server-core.
 */
export class PlaylistValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'PlaylistValidationError';
  }
}

// ---------------------------------------------------------------------------
// Narrow Prisma DI surface — only the delegates/operations the service uses.
// At runtime the real PrismaClient (over the `Playlist` / `PlaylistItem`
// models) is injected; the route passes `fastify.prisma as never`.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PlaylistPrisma {
  playlist: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findFirst: (args: { where: Record<string, unknown>; orderBy?: unknown }) => Promise<any>;
    findMany: (args: { where?: Record<string, unknown>; orderBy?: unknown }) => Promise<any[]>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
  };
  playlistItem: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
    findMany: (args: { where?: Record<string, unknown>; orderBy?: unknown }) => Promise<any[]>;
    findFirst: (args: { where: Record<string, unknown>; orderBy?: unknown }) => Promise<any>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
}

/** Persisted Playlist row shape (only the fields this service reads). */
interface PlaylistRow {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  visibility: PrismaVisibility;
  isSystem: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Persisted PlaylistItem row shape. */
interface PlaylistItemRow {
  id: string;
  playlistId: string;
  videoId: string;
  position: number;
  addedAt: Date | string;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const TITLE_MIN = 1;
const TITLE_MAX = 200;
const WATCH_LATER_TITLE = 'Watch Later';

/** Map the page-contract visibility to the Prisma `VideoVisibility` enum. */
function toPrismaVisibility(v: PlaylistVisibility): PrismaVisibility {
  switch (v) {
    case 'public':
      return 'PUBLIC';
    case 'unlisted':
      return 'UNLISTED';
    case 'private':
    default:
      return 'PRIVATE';
  }
}

/** Map the Prisma `VideoVisibility` enum back to the page-contract visibility. */
function fromPrismaVisibility(v: PrismaVisibility | string): PlaylistVisibility {
  switch (v) {
    case 'PUBLIC':
      return 'public';
    case 'UNLISTED':
      return 'unlisted';
    case 'PRIVATE':
    default:
      return 'private';
  }
}

/** Coerce a Date | string timestamp to an ISO-8601 UTC string. */
function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class PlaylistService {
  constructor(private readonly prisma: PlaylistPrisma) {}

  // --- public API (exactly the six operations required by Req 5.6) ---------

  /**
   * Return the list-shape playlists owned by `userId` (Req 2.5, 5.12). Always
   * includes the reserved "Watch Later" system playlist for that user (created
   * lazily if it does not yet exist).
   */
  async listPlaylists(userId: string): Promise<PlaylistListItem[]> {
    await this.ensureWatchLater(userId);
    const playlists = (await this.prisma.playlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    })) as PlaylistRow[];

    return Promise.all(playlists.map((p) => this.toListItem(p)));
  }

  /**
   * Return the detail meta + ordered video entries for the playlist `id` owned
   * by `userId`, or `null` when the id is unknown OR owned by another user
   * (Req 2.8, 5.9). Returning `null` in both cases prevents existence leakage —
   * the route maps `null` to a 404 that is indistinguishable across the two
   * cases.
   */
  async getPlaylist(userId: string, id: string): Promise<PlaylistDetailResult | null> {
    const playlist = (await this.prisma.playlist.findFirst({
      where: { id, userId },
    })) as PlaylistRow | null;
    if (!playlist) {
      return null;
    }

    const items = (await this.prisma.playlistItem.findMany({
      where: { playlistId: playlist.id },
      orderBy: { position: 'asc' },
    })) as PlaylistItemRow[];

    return {
      playlist: this.toDetailMeta(playlist, items.length),
      videos: items.map((v) => this.toVideoEntry(v)),
    };
  }

  /**
   * Create a new (non-system) playlist owned by `userId` and return its list
   * shape (Req 2.14, 2.15, 2.16). The title is trimmed and validated to 1..200
   * chars; visibility defaults to 'private'; `isSystem` is always
   * server-assigned to false (any client value is ignored).
   */
  async createPlaylist(userId: string, input: CreatePlaylistInput): Promise<PlaylistListItem> {
    const title = typeof input?.title === 'string' ? input.title.trim() : '';
    if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
      throw new PlaylistValidationError(
        `Playlist title must be between ${TITLE_MIN} and ${TITLE_MAX} characters after trimming`,
      );
    }

    const visibility = input?.visibility ?? 'private';
    if (visibility !== 'public' && visibility !== 'private' && visibility !== 'unlisted') {
      throw new PlaylistValidationError(`Invalid visibility: ${String(visibility)}`);
    }

    const created = (await this.prisma.playlist.create({
      data: {
        userId,
        title,
        description: typeof input?.description === 'string' ? input.description : '',
        visibility: toPrismaVisibility(visibility),
        videoCount: 0,
        isSystem: false, // SERVER-assigned; client `isSystem` is ignored.
      },
    })) as PlaylistRow;

    return this.toListItem(created, 0);
  }

  /**
   * Return the watch-later entries owned by `userId`, ordered
   * most-recently-added-first (Req 3.7, 5.12). Append order is captured by the
   * monotonically-increasing `position`, so descending position == most recent.
   */
  async listWatchLater(userId: string): Promise<WatchLaterEntry[]> {
    const wl = await this.ensureWatchLater(userId);
    const items = (await this.prisma.playlistItem.findMany({
      where: { playlistId: wl.id },
      orderBy: { position: 'desc' },
    })) as PlaylistItemRow[];

    return items.map((v) => ({ id: v.id, videoId: v.videoId, addedAt: iso(v.addedAt) }));
  }

  /**
   * Add `videoId` to `userId`'s Watch Later. Idempotent: if the video is
   * already present, the existing entry is returned unchanged and no duplicate
   * is created and the existing order is preserved (Req 3.8, 3.10, 5.15).
   */
  async addToWatchLater(userId: string, videoId: string): Promise<WatchLaterEntry> {
    const wl = await this.ensureWatchLater(userId);

    const existing = (await this.prisma.playlistItem.findFirst({
      where: { playlistId: wl.id, videoId },
    })) as PlaylistItemRow | null;
    if (existing) {
      // Idempotent: no new row, order untouched.
      return { id: existing.id, videoId: existing.videoId, addedAt: iso(existing.addedAt) };
    }

    const count = await this.prisma.playlistItem.count({ where: { playlistId: wl.id } });
    const entry = (await this.prisma.playlistItem.create({
      data: {
        playlistId: wl.id,
        videoId,
        position: count + 1, // contiguous append
      },
    })) as PlaylistItemRow;

    await this.prisma.playlist.update({
      where: { id: wl.id },
      data: { videoCount: count + 1, updatedAt: new Date() },
    });

    return { id: entry.id, videoId: entry.videoId, addedAt: iso(entry.addedAt) };
  }

  /**
   * Remove the watch-later entry `entryId` from `userId`'s Watch Later.
   * Idempotent no-op when the entry is absent (Req 3.9, 3.10, 5.15). After a
   * removal the remaining videos are re-indexed so positions stay a contiguous
   * 1..n permutation (Req 2.10).
   */
  async removeFromWatchLater(userId: string, entryId: string): Promise<void> {
    const wl = await this.ensureWatchLater(userId);

    const target = (await this.prisma.playlistItem.findFirst({
      where: { id: entryId, playlistId: wl.id },
    })) as PlaylistItemRow | null;
    if (!target) {
      return; // idempotent no-op (unknown id, or an entry owned by another playlist)
    }

    await this.prisma.playlistItem.delete({ where: { id: target.id } });

    // Re-index the survivors so positions stay a contiguous 1..n permutation.
    const remaining = (await this.prisma.playlistItem.findMany({
      where: { playlistId: wl.id },
      orderBy: { position: 'asc' },
    })) as PlaylistItemRow[];
    for (let i = 0; i < remaining.length; i += 1) {
      const expected = i + 1;
      const item = remaining[i]!;
      if (item.position !== expected) {
        await this.prisma.playlistItem.update({
          where: { id: item.id },
          data: { position: expected },
        });
      }
    }

    await this.prisma.playlist.update({
      where: { id: wl.id },
      data: { videoCount: remaining.length, updatedAt: new Date() },
    });
  }

  // --- regular playlist video management -----------------------------------

  /**
   * Add `videoId` to the regular playlist `playlistId` owned by `userId`.
   * Generalizes {@link addToWatchLater}: ownership is enforced by resolving the
   * OWNED playlist (`findFirst {id, userId}`). Returns `null` when the id is
   * unknown OR owned by another user — the route maps that to a 404 exactly
   * like {@link getPlaylist}, so there is no existence leakage. Idempotent: if
   * `videoId` is already an item, the existing entry is returned unchanged (no
   * duplicate, order preserved). Otherwise the video is appended at `count + 1`
   * and the playlist's `videoCount` / `updatedAt` are bumped.
   */
  async addToPlaylist(
    userId: string,
    playlistId: string,
    videoId: string,
  ): Promise<PlaylistVideoEntry | null> {
    const playlist = (await this.prisma.playlist.findFirst({
      where: { id: playlistId, userId },
    })) as PlaylistRow | null;
    if (!playlist) {
      return null; // unknown OR cross-user → route 404 (no existence leakage)
    }

    const existing = (await this.prisma.playlistItem.findFirst({
      where: { playlistId: playlist.id, videoId },
    })) as PlaylistItemRow | null;
    if (existing) {
      // Idempotent: no new row, order untouched.
      return this.toVideoEntry(existing);
    }

    const count = await this.prisma.playlistItem.count({ where: { playlistId: playlist.id } });
    const entry = (await this.prisma.playlistItem.create({
      data: {
        playlistId: playlist.id,
        videoId,
        position: count + 1, // contiguous append
      },
    })) as PlaylistItemRow;

    await this.prisma.playlist.update({
      where: { id: playlist.id },
      data: { videoCount: count + 1, updatedAt: new Date() },
    });

    return this.toVideoEntry(entry);
  }

  /**
   * Remove the entry `entryId` from the regular playlist `playlistId` owned by
   * `userId`. Generalizes {@link removeFromWatchLater}. Returns `false` when the
   * playlist id is unknown OR owned by another user (route → 404); returns
   * `true` when the owned playlist exists, regardless of whether the entry was
   * present (idempotent no-op when absent). After a removal the survivors are
   * re-indexed so positions stay a contiguous 1..n permutation (the exact
   * approach used by {@link removeFromWatchLater}).
   */
  async removeFromPlaylist(userId: string, playlistId: string, entryId: string): Promise<boolean> {
    const playlist = (await this.prisma.playlist.findFirst({
      where: { id: playlistId, userId },
    })) as PlaylistRow | null;
    if (!playlist) {
      return false; // unknown OR cross-user → route 404
    }

    const target = (await this.prisma.playlistItem.findFirst({
      where: { id: entryId, playlistId: playlist.id },
    })) as PlaylistItemRow | null;
    if (!target) {
      return true; // playlist exists; absent entry is an idempotent no-op
    }

    await this.prisma.playlistItem.delete({ where: { id: target.id } });

    // Re-index the survivors so positions stay a contiguous 1..n permutation.
    const remaining = (await this.prisma.playlistItem.findMany({
      where: { playlistId: playlist.id },
      orderBy: { position: 'asc' },
    })) as PlaylistItemRow[];
    for (let i = 0; i < remaining.length; i += 1) {
      const expected = i + 1;
      const item = remaining[i]!;
      if (item.position !== expected) {
        await this.prisma.playlistItem.update({
          where: { id: item.id },
          data: { position: expected },
        });
      }
    }

    await this.prisma.playlist.update({
      where: { id: playlist.id },
      data: { videoCount: remaining.length, updatedAt: new Date() },
    });

    return true;
  }

  /**
   * Delete the playlist `playlistId` owned by `userId` and all of its items.
   * Returns `null` when the id is unknown OR owned by another user (route →
   * 404). Refuses to delete a reserved SYSTEM playlist (e.g. Watch Later) by
   * throwing {@link PlaylistValidationError} (route → 400). On success the
   * playlist's items are removed first (`playlistItem.deleteMany`) and then the
   * playlist row itself; returns `{ deleted: true }`.
   */
  async deletePlaylist(userId: string, playlistId: string): Promise<{ deleted: true } | null> {
    const playlist = (await this.prisma.playlist.findFirst({
      where: { id: playlistId, userId },
    })) as PlaylistRow | null;
    if (!playlist) {
      return null; // unknown OR cross-user → route 404
    }
    if (playlist.isSystem) {
      // Reserved system playlist (Watch Later) is undeletable → route 400.
      throw new PlaylistValidationError('Cannot delete the Watch Later playlist');
    }

    await this.prisma.playlistItem.deleteMany({ where: { playlistId: playlist.id } });
    await this.prisma.playlist.delete({ where: { id: playlist.id } });

    return { deleted: true };
  }

  // --- internal helpers ----------------------------------------------------

  /**
   * Get (creating lazily if missing) the user's reserved "Watch Later" system
   * playlist. `isSystem` and the private visibility are SERVER-set (Req 3.3).
   */
  private async ensureWatchLater(userId: string): Promise<PlaylistRow> {
    const existing = (await this.prisma.playlist.findFirst({
      where: { userId, isSystem: true, title: WATCH_LATER_TITLE },
    })) as PlaylistRow | null;
    if (existing) {
      return existing;
    }

    return (await this.prisma.playlist.create({
      data: {
        userId,
        title: WATCH_LATER_TITLE,
        description: '',
        visibility: 'PRIVATE',
        videoCount: 0,
        isSystem: true, // SERVER-set reserved system playlist (Req 3.3).
      },
    })) as PlaylistRow;
  }

  private async toListItem(p: PlaylistRow, knownCount?: number): Promise<PlaylistListItem> {
    const videoCount =
      knownCount ?? (await this.prisma.playlistItem.count({ where: { playlistId: p.id } }));
    return {
      id: p.id,
      title: p.title,
      thumbnail: '',
      videoCount,
      visibility: fromPrismaVisibility(p.visibility),
      isSystem: p.isSystem,
      updatedAt: iso(p.updatedAt),
    };
  }

  private toDetailMeta(p: PlaylistRow, videoCount: number): PlaylistDetailMeta {
    return {
      id: p.id,
      title: p.title,
      description: p.description ?? '',
      coverUrl: '',
      creatorName: '',
      creatorAvatar: '',
      videoCount,
      totalDuration: 0, // route recomputes from enriched durations
      isPublic: p.visibility === 'PUBLIC',
      collaborative: false,
      createdAt: iso(p.createdAt),
      updatedAt: iso(p.updatedAt),
    };
  }

  private toVideoEntry(v: PlaylistItemRow): PlaylistVideoEntry {
    return {
      id: v.id,
      videoId: v.videoId,
      position: v.position,
      addedAt: iso(v.addedAt),
    };
  }
}
