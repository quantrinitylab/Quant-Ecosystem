import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { PlaylistService, PlaylistValidationError } from '../services/playlist.service';
import { VideoService } from '../services/video.service';
// Contract interfaces (Task 1) — the authoritative response shapes. Imported as
// types only (fully erased at runtime, so no React/page module is loaded). The
// library list `PlaylistData` and the detail `PlaylistData` are distinct shapes,
// hence the aliases.
import type { PlaylistData as PlaylistListData, WatchLaterItem } from '../../src/pages/library';
import type {
  PlaylistData as PlaylistDetailData,
  PlaylistVideo,
} from '../../src/pages/playlist/[id]';

// ============================================================================
// QuantTube — /playlists backend routes (quantube-real-data-wiring, Task 3)
// ----------------------------------------------------------------------------
// Mirrors backend/routes/videos.ts: a Prisma-backed service constructed
// per-request from `fastify.prisma`, Zod-validated mutating bodies, the
// `{ success, data }` envelope on every response, the global auth hook (401
// unauthenticated) plus a `library:write` scope on every mutating route (403
// when missing), and route-boundary error classification (validation → 400,
// not-found → 404; never 500 for those — the Bug-3 precedent).
//
// The PlaylistService is now durable (Prisma `Playlist` + `PlaylistItem`
// models). It still stores THIN, un-enriched entries (raw videoId + position +
// timestamps). Detail and watch-later reads ENRICH each entry with video
// metadata via `new VideoService(fastify.prisma)` (constructed exactly like
// videos.ts). `VideoService.getVideo` THROWS on a missing/deleted video, so each
// enrichment is wrapped in try/catch and orphaned entries are SKIPPED (and not
// counted).
//
// Both PlaylistService and VideoService read the SAME `fastify.prisma` at
// request time (narrow-DI, like channel.service usage), so there is no boot
// singleton holding state — durability lives entirely in Postgres.
// ============================================================================

/**
 * Construct the Prisma-backed PlaylistService for the current request, reading
 * the shared client off the instance exactly like {@link getVideoService}.
 * Exported so `buildApp()` (or any caller) can construct the service directly.
 */
export function createPlaylistService(prisma: unknown): PlaylistService {
  return new PlaylistService(prisma as never);
}

/** Build the request-scoped PlaylistService from `fastify.prisma`. */
function getPlaylistService(fastify: FastifyInstance): PlaylistService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new PlaylistService(prisma as never);
}

// `title` is validated to 1..200 chars AFTER trimming (Req 2.14, 2.17); unknown
// keys (e.g. a client-supplied `isSystem`) are stripped by the non-strict object
// (Req 2.16). A Zod failure is thrown and mapped to 400 by the global handler.
const createPlaylistSchema = z.object({
  title: z.string().trim().min(1).max(200),
  visibility: z.enum(['public', 'private', 'unlisted']).optional(),
  description: z.string().optional(),
});

const addWatchLaterSchema = z.object({
  videoId: z.string().min(1),
});

/** Build the Prisma-backed VideoService exactly as videos.ts does. */
function getVideoService(fastify: FastifyInstance): VideoService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new VideoService(prisma as never);
}

export default async function playlistRoutes(fastify: FastifyInstance) {
  // --- GET /playlists — the caller's playlist list. Read (token only). -------
  fastify.get('/', async (request, reply) => {
    const playlists = getPlaylistService(fastify);
    const items: PlaylistListData[] = await playlists.listPlaylists(request.auth.userId);
    return reply.send({ success: true, data: { items } });
  });

  // --- GET /playlists/watch-later — enriched watch-later queue. Read. --------
  // Registered before '/:id'; find-my-way prioritises the static path anyway.
  fastify.get('/watch-later', async (request, reply) => {
    const playlists = getPlaylistService(fastify);
    const entries = await playlists.listWatchLater(request.auth.userId); // most-recent-first
    const videoService = getVideoService(fastify);
    const items: WatchLaterItem[] = [];
    for (const entry of entries) {
      try {
        const video = await videoService.getVideo(entry.videoId);
        items.push({
          id: entry.id,
          videoId: entry.videoId,
          title: video.title,
          thumbnail: video.thumbnailUrl ?? '',
          channelName: video.channelId,
          duration: video.duration,
          addedAt: entry.addedAt,
        });
      } catch {
        // Orphaned entry (video missing/deleted → getVideo throws) → skip it.
      }
    }
    return reply.send({ success: true, data: { items } });
  });

  // --- POST /playlists/watch-later — add a video. Mutating → scoped. ---------
  fastify.post(
    '/watch-later',
    { preHandler: fastify.requireAuth({ scopes: ['library:write'] }) },
    async (request, reply) => {
      const parsed = addWatchLaterSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      // Idempotent in the service (no duplicate, order preserved).
      const playlists = getPlaylistService(fastify);
      const entry = await playlists.addToWatchLater(request.auth.userId, parsed.data.videoId);
      return reply.status(201).send({ success: true, data: { entry } });
    },
  );

  // --- DELETE /playlists/watch-later/:entryId — remove. Mutating → scoped. ---
  fastify.delete<{ Params: { entryId: string } }>(
    '/watch-later/:entryId',
    { preHandler: fastify.requireAuth({ scopes: ['library:write'] }) },
    async (request, reply) => {
      // Idempotent no-op when absent — never 500.
      const playlists = getPlaylistService(fastify);
      await playlists.removeFromWatchLater(request.auth.userId, request.params.entryId);
      return reply.send({ success: true, data: { removed: true } });
    },
  );

  // --- GET /playlists/:id — enriched playlist detail. Read. ------------------
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const playlists = getPlaylistService(fastify);
    const result = await playlists.getPlaylist(request.auth.userId, request.params.id);
    if (!result) {
      // Unknown OR cross-user id → 404 (no existence leakage; never 403/500).
      throw createAppError('Playlist not found', 404, 'NOT_FOUND');
    }

    const videoService = getVideoService(fastify);
    const videos: PlaylistVideo[] = [];
    let totalDuration = 0;
    for (const entry of result.videos) {
      try {
        const video = await videoService.getVideo(entry.videoId);
        videos.push({
          id: entry.id,
          title: video.title,
          channelName: video.channelId,
          thumbnailUrl: video.thumbnailUrl ?? '',
          duration: video.duration,
          views: video.viewCount ?? 0,
          addedAt: entry.addedAt,
          position: entry.position,
        });
        totalDuration += video.duration;
      } catch {
        // Orphaned entry → skip (not enriched, not counted toward duration).
      }
    }

    // Recompute totalDuration from the enriched durations (the service holds none).
    const playlist: PlaylistDetailData = { ...result.playlist, totalDuration };
    return reply.send({ success: true, data: { playlist, videos } });
  });

  // --- POST /playlists — create a playlist. Mutating → scoped. ---------------
  fastify.post(
    '/',
    { preHandler: fastify.requireAuth({ scopes: ['library:write'] }) },
    async (request, reply) => {
      const parsed = createPlaylistSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error; // → 400 via the global error handler
      }
      try {
        // `isSystem` is server-assigned by the service; any client value ignored.
        const service = getPlaylistService(fastify);
        const playlist: PlaylistListData = await service.createPlaylist(request.auth.userId, {
          title: parsed.data.title,
          visibility: parsed.data.visibility,
          description: parsed.data.description,
        });
        return reply.status(201).send({ success: true, data: { playlist } });
      } catch (err) {
        if (err instanceof PlaylistValidationError) {
          // Defence-in-depth: deterministic validation class → 400 (never 500).
          throw createAppError(err.message, 400, 'VALIDATION_ERROR');
        }
        throw err;
      }
    },
  );

  // --- POST /playlists/:id/videos — add a video to a regular playlist. -------
  // Mutating → scoped. Unknown/cross-user playlist → 404 (no existence leakage).
  fastify.post<{ Params: { id: string } }>(
    '/:id/videos',
    { preHandler: fastify.requireAuth({ scopes: ['library:write'] }) },
    async (request, reply) => {
      const parsed = addWatchLaterSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error; // → 400 via the global error handler
      }
      const playlists = getPlaylistService(fastify);
      // Idempotent in the service (no duplicate, order preserved).
      const entry = await playlists.addToPlaylist(
        request.auth.userId,
        request.params.id,
        parsed.data.videoId,
      );
      if (!entry) {
        // Unknown OR cross-user id → 404 (same convention as GET /:id).
        throw createAppError('Playlist not found', 404, 'NOT_FOUND');
      }
      return reply.status(201).send({ success: true, data: { entry } });
    },
  );

  // --- DELETE /playlists/:id/videos/:entryId — remove an entry. Scoped. ------
  fastify.delete<{ Params: { id: string; entryId: string } }>(
    '/:id/videos/:entryId',
    { preHandler: fastify.requireAuth({ scopes: ['library:write'] }) },
    async (request, reply) => {
      const playlists = getPlaylistService(fastify);
      // Idempotent no-op when the entry is absent — never 500.
      const found = await playlists.removeFromPlaylist(
        request.auth.userId,
        request.params.id,
        request.params.entryId,
      );
      if (!found) {
        // Unknown OR cross-user playlist id → 404.
        throw createAppError('Playlist not found', 404, 'NOT_FOUND');
      }
      return reply.send({ success: true, data: { removed: true } });
    },
  );

  // --- DELETE /playlists/:id — delete a playlist. Mutating → scoped. ---------
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: fastify.requireAuth({ scopes: ['library:write'] }) },
    async (request, reply) => {
      const playlists = getPlaylistService(fastify);
      try {
        const result = await playlists.deletePlaylist(request.auth.userId, request.params.id);
        if (!result) {
          // Unknown OR cross-user id → 404 (same convention as GET /:id).
          throw createAppError('Playlist not found', 404, 'NOT_FOUND');
        }
        return reply.send({ success: true, data: result });
      } catch (err) {
        if (err instanceof PlaylistValidationError) {
          // System-playlist (Watch Later) delete refusal → 400 (never 500).
          throw createAppError(err.message, 400, 'VALIDATION_ERROR');
        }
        throw err;
      }
    },
  );
}
