/**
 * GET /emails/changes — delta-sync endpoint for QuantMail.
 *
 * What: mobile/desktop clients pull incremental changes (new/updated/soft-deleted
 * emails) since an opaque cursor instead of re-scanning the mailbox. This is the
 * sync engine behind the omnipresent client strategy (ARCHITECTURE.md §5).
 *
 * Registration (apps/quantmail/backend/app.ts, next to emailsRoutes ~line 357):
 *   import emailsChangesRoutes from './routes/emails-changes';
 *   await app.register(emailsChangesRoutes, { prefix: '/emails' });
 *
 * Client contract:
 *  - `since` is opaque; clients MUST NOT parse it.
 *  - On 400 INVALID_CURSOR: discard the stored cursor and run a bounded full
 *    resync (paged GET /emails/changes without `since`), replacing local state.
 *  - Tombstone entries (`deleted: true`) carry no `message` payload — drop the
 *    local copy of that email.
 *  - `hasMore: true` means another page exists at `nextCursor`; keep paging
 *    until `hasMore` is false, then store `nextCursor` as the new position.
 *
 * Verified read-only from the repo (2026-10-02): Prisma `Email` has
 * `updatedAt: Date` and a soft-delete column `deletedAt` (routes/emails.ts
 * uses `deletedAt: null` filters and `deletedAt: new Date()` soft deletes).
 * TODO(UNVERIFIED): assumes `updatedAt` has `@updatedAt` semantics — i.e. it is
 * touched on every write path, including bulk `updateMany` (e.g. mark-all-read).
 * If any write path bypasses it, those rows would be invisible to delta sync.
 */

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@quant/database';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { formatEmailRecord } from '../lib/format-email';

/** Thrown by decodeCursor for any malformed cursor input. */
export class CursorError extends Error {
  constructor(reason: string) {
    super(`Invalid sync cursor: ${reason}`);
    this.name = 'CursorError';
  }
}

interface DecodedCursor {
  t: Date;
  id: string;
}

/**
 * Encode a sync position (updatedAt, id) as an opaque base64url cursor.
 */
export function encodeCursor(t: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: t.toISOString(), id }), 'utf8').toString('base64url');
}

/**
 * Decode an opaque sync cursor. Throws CursorError on ANY malformed input:
 * bad base64, bad JSON, missing/invalid `t` (must parse to a valid Date),
 * missing/invalid `id` (must be a non-empty string).
 */
export function decodeCursor(raw: string): DecodedCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new CursorError('not decodable as base64url JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new CursorError('payload is not an object');
  }
  const { t, id } = parsed as Record<string, unknown>;
  const date = typeof t === 'string' ? new Date(t) : new Date(NaN);
  if (Number.isNaN(date.getTime())) {
    throw new CursorError('t is not a valid ISO date');
  }
  if (typeof id !== 'string' || id.length === 0) {
    throw new CursorError('id is not a non-empty string');
  }
  return { t: date, id };
}

const changesQuerySchema = z.object({
  since: z.string().min(1).max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export default async function emailsChangesRoutes(fastify: FastifyInstance) {
  fastify.get('/changes', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parsed = changesQuerySchema.safeParse((request as { query: unknown }).query);
    if (!parsed.success) {
      throw createAppError(
        'Invalid request: ' + parsed.error.issues.map((i) => i.message).join('; '),
        400,
        'VALIDATION_ERROR'
      );
    }
    const { limit } = parsed.data;

    // Resolve the sync position: start of history, or the decoded cursor.
    let sinceT: Date;
    let sinceId: string;
    if (!parsed.data.since) {
      sinceT = new Date('1970-01-01T00:00:00.000Z');
      sinceId = '';
    } else {
      try {
        const decoded = decodeCursor(parsed.data.since);
        sinceT = decoded.t;
        sinceId = decoded.id;
      } catch {
        throw createAppError(
          'Invalid sync cursor — discard it and run a bounded full resync',
          400,
          'INVALID_CURSOR'
        );
      }
    }

    const prisma = (fastify as unknown as { prisma: PrismaClient }).prisma;

    // Delta ordered deterministically by (updatedAt, id). No folder/label/trash
    // filtering: sync must report every change for the user. Soft-deleted rows
    // are included as tombstones (see entry mapping below).
    const rows = (await prisma.email.findMany({
      where: {
        userId,
        OR: [{ updatedAt: { gt: sinceT } }, { updatedAt: sinceT, id: { gt: sinceId } }],
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    })) as unknown as Array<{
      id: string;
      threadId: string | null;
      updatedAt: Date | string;
      deletedAt: Date | null;
      [key: string]: unknown;
    }>;

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    const changes = page.map((row) => {
      const deleted = !!row.deletedAt;
      return {
        id: row.id,
        threadId: row.threadId ?? null,
        deleted,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
        // Tombstones carry no payload — the local copy must be dropped.
        ...(deleted ? {} : { message: formatEmailRecord(row as unknown as Record<string, unknown>) }),
      };
    });

    // Advance the cursor to the last row of this page; echo the incoming cursor
    // when the page is empty so the client keeps its position.
    const last = page[page.length - 1];
    const nextCursor = last
      ? encodeCursor(
          last.updatedAt instanceof Date ? last.updatedAt : new Date(last.updatedAt),
          last.id
        )
      : encodeCursor(sinceT, sinceId);

    return reply.send({ success: true, data: { changes, nextCursor, hasMore } });
  });
}
