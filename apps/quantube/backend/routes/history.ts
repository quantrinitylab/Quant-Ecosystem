import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { HistoryService } from '../services/history.service';
import { VideoService } from '../services/video.service';
// Contract interface (Task 1) — the authoritative `HistoryItem` response shape.
// Imported as a type only (fully erased at runtime, so no React/page module is
// loaded). Mirrors the type-only import convention in routes/playlists.ts.
import type { HistoryItem } from '../../src/pages/library';

// ============================================================================
// QuantTube — /history backend route (quantube-real-data-wiring, Task 4)
// ----------------------------------------------------------------------------
// The GET / handler ENRICHES each thin WatchHistoryEntry (videoId + watchDuration
// + watchedAt) into the full `HistoryItem` contract by joining video metadata via
// `new VideoService(fastify.prisma)` (constructed exactly like videos.ts /
// playlists.ts). `VideoService.getVideo` THROWS on a missing/deleted video, so
// each enrichment is wrapped in try/catch and orphaned entries are SKIPPED and
// NOT counted toward `total` (Req 1.10).
//
// Chosen total/orphan + pagination semantics (one consistent snapshot — Req 10.12):
//   1. Read the FULL ordered history once (a single snapshot, watchedAt-desc).
//   2. Enrich every entry, dropping orphans → the user's RESOLVABLE entry list,
//      still in watchedAt-descending order (service order preserved on ties).
//   3. `total` = the count of RESOLVABLE entries (orphans excluded, Req 1.10) and
//      is therefore page-INDEPENDENT (Req 10.10).
//   4. Paginate the resolvable list with the effective (defaulted+clamped) page /
//      pageSize. Out-of-range pages yield `[]` with the same `total` (Req 10.7/10.8),
//      and the ordered concatenation across all pages equals the full resolvable
//      set exactly once (Req 10.11).
// This enriches all entries (an N+1 over history) but keeps `total` exactly
// consistent across pages for this minimal in-memory slice — preferred over a raw
// pre-enrichment count, which would over-count orphans and violate Req 1.10.
// ============================================================================

const addHistorySchema = z.object({
  videoId: z.string(),
  watchDuration: z.number().min(0),
});

const DEFAULT_PAGE = 1; // Req 10.1
const DEFAULT_PAGE_SIZE = 20; // Req 10.2
const MAX_PAGE_SIZE = 100; // Req 10.4

/**
 * Parse a pagination query parameter as an INTEGER, distinguishing the two
 * failure modes the requirements treat differently (see CRITICAL reconciliation
 * note below):
 *   - REJECT (400, naming the param) when the raw value is non-numeric or a
 *     non-integer (e.g. "abc", "1.5", "") — Req 10.6.
 *   - ACCEPT any integer (including out-of-range values such as 0, negatives, or
 *     > 100) WITHOUT range-checking here, leaving the caller to decide between
 *     clamp (pageSize) and reject (page < 1) — Req 10.4 / 10.5 / 10.6.
 * Returns `undefined` when the parameter is omitted so the caller applies the
 * default (Req 10.1 / 10.2).
 *
 * CRITICAL pagination reconciliation (Req 10.4/10.5 vs 10.6):
 *   Req 10.4/10.5 require CLAMPING an out-of-range *integer* pageSize
 *   (`> 100 → 100`, `< 1 → 1`), while Req 10.6 requires REJECTING a
 *   non-numeric / non-integer param with a 400. This parser therefore only
 *   classifies "is it an integer?" — it does NOT range-check — so the caller can
 *   CLAMP pageSize integers and REJECT page integers `< 1` (page has no clamp
 *   requirement). This replaces the previous `.min(1).max(100)` schema, which
 *   wrongly rejected out-of-range pageSize integers that must instead be clamped.
 */
function parseIntegerParam(name: 'page' | 'pageSize', raw: unknown): number | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  // Query values may arrive as string | string[]; take the last occurrence.
  const value = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  const str = String(value).trim();
  // Optional leading minus then digits ⇒ rejects empty, non-numeric, and
  // decimals (non-integer). Out-of-range integers (0, negatives, > 100) ARE
  // accepted here and handled by the caller (clamp vs reject).
  if (str === '' || !/^-?\d+$/.test(str)) {
    throw createAppError(
      `Invalid '${name}' parameter: must be an integer`,
      400,
      'VALIDATION_ERROR',
    );
  }
  const n = Number(str);
  if (!Number.isInteger(n)) {
    throw createAppError(
      `Invalid '${name}' parameter: must be an integer`,
      400,
      'VALIDATION_ERROR',
    );
  }
  return n;
}

/** Build the Prisma-backed VideoService exactly as videos.ts / playlists.ts do. */
function getVideoService(fastify: FastifyInstance): VideoService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new VideoService(prisma as never);
}

// Durable, per-request history service (Prisma-backed via fastify.prisma).
function getHistoryService(fastify: FastifyInstance): HistoryService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new HistoryService(prisma as never);
}

export default async function historyRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = addHistorySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const entry = await getHistoryService(fastify).addToHistory(
      userId,
      parseResult.data.videoId,
      parseResult.data.watchDuration,
    );

    return reply.status(201).send({ success: true, data: entry });
  });

  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    // --- Pagination (Req 10): validate → default → clamp/reject -------------
    // Parse page|pageSize as integers, rejecting only non-numeric / non-integer
    // values (naming the bad param, Req 10.6). Then:
    //   • page  — reject a `< 1` integer (Req 10.6; page has NO clamp rule) and
    //             apply the default when omitted (Req 10.1).
    //   • pageSize — apply the default when omitted (Req 10.2), then CLAMP an
    //             out-of-range integer to [1, MAX_PAGE_SIZE] (`< 1 → 1`,
    //             `> 100 → 100`; Req 10.4 / 10.5) rather than rejecting it.
    const rawQuery = (request.query ?? {}) as Record<string, unknown>;
    const pageInput = parseIntegerParam('page', rawQuery.page);
    const pageSizeInput = parseIntegerParam('pageSize', rawQuery.pageSize);

    if (pageInput !== undefined && pageInput < 1) {
      throw createAppError(
        `Invalid 'page' parameter: must be an integer greater than or equal to 1`,
        400,
        'VALIDATION_ERROR',
      );
    }
    const page = pageInput ?? DEFAULT_PAGE;
    // Clamp to [1, MAX_PAGE_SIZE]: Math.max lifts `< 1` (incl. 0/negatives) to 1
    // (Req 10.5); Math.min caps `> 100` to 100 (Req 10.4).
    const pageSize = Math.min(Math.max(pageSizeInput ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    // --- Snapshot: read the FULL ordered history once (Req 10.12) ------------
    // watchedAt-descending order is produced by HistoryService; ties keep service
    // order (Req 1.12). A pageSize of MAX_SAFE_INTEGER returns every entry.
    const fullResult = await getHistoryService(fastify).getHistory(userId, {
      page: 1,
      pageSize: Number.MAX_SAFE_INTEGER,
    });

    // --- Enrich + drop orphans → the user's RESOLVABLE entries ---------------
    const videoService = getVideoService(fastify);
    const resolvable: HistoryItem[] = [];
    for (const entry of fullResult.data) {
      let video;
      try {
        video = await videoService.getVideo(entry.videoId);
      } catch {
        // Orphaned entry (video missing/deleted → getVideo throws) → skip it and
        // do NOT count it toward `total` (Req 1.10).
        continue;
      }
      // duration: whole seconds, >= 0 (Req 1.9).
      const duration = Math.max(0, Math.floor(video.duration));
      // progress = max(0, min(1, watchDuration / max(1, duration))) (Req 1.11).
      const progress = Math.max(0, Math.min(1, entry.watchDuration / Math.max(1, duration)));
      resolvable.push({
        id: entry.id,
        videoId: entry.videoId,
        title: video.title,
        thumbnail: video.thumbnailUrl ?? '',
        // channelName: the Video record exposes only `channelId` (no channel
        // display name is joined yet) — use it for parity with playlists.ts
        // enrichment. GAP: surfacing the real channel display name needs a
        // channel join not modeled in this slice.
        channelName: video.channelId,
        duration,
        watchedAt: entry.watchedAt.toISOString(), // ISO-8601 UTC (Req 1.9).
        progress,
      });
    }

    // --- Paginate the resolvable list; total is page-independent (Req 10) ----
    const total = resolvable.length; // resolvable count (Req 1.10, 10.10)
    const start = (page - 1) * pageSize;
    const items = resolvable.slice(start, start + pageSize); // [] when out-of-range (Req 10.7)

    return reply.send({
      success: true,
      data: { items, total, page, pageSize },
    });
  });

  fastify.delete('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    await getHistoryService(fastify).clearHistory(userId);

    return reply.send({ success: true });
  });
}
