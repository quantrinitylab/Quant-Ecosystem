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
 * ENV (required, fail-closed):
 *   SYNC_CURSOR_SECRET — ≥32 bytes. The plugin throws at registration time when
 *   the secret is missing, empty, or shorter than 32 bytes (no silent fallback,
 *   no default secret). Set it from the secrets store at deploy time; rotate by
 *   restarting instances — old cursors 400 and clients run a bounded resync.
 *
 * Client contract:
 *  - `since` is opaque; clients MUST NOT parse it. (Wire format is still a
 *    single opaque string — the HMAC signature is server-side only; the Flutter
 *    client needs no change.)
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
 * NOTE: the `updateMany` updatedAt concern is RESOLVED — PR #372
 * ("fix(quantmail): updateMany callsites now set updatedAt explicitly")
 * is merged in main, so bulk write paths (e.g. mark-all-read) now touch
 * `updatedAt` explicitly and stay visible to delta sync.
 */

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@quant/database';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'crypto';
import { createAppError } from '@quant/server-core';
import { formatEmailRecord } from '../lib/format-email';

/** Thrown by decodeCursor for any malformed cursor input. */
export class CursorError extends Error {
  constructor(reason: string) {
    super(`Invalid sync cursor: ${reason}`);
    this.name = 'CursorError';
  }
}

/** Minimum HMAC key length for the cursor secret (bytes). */
export const MIN_CURSOR_SECRET_BYTES = 32;

/**
 * Resolve the cursor-signing secret from the environment, fail-closed.
 * Throws when SYNC_CURSOR_SECRET is missing, empty, or shorter than
 * MIN_CURSOR_SECRET_BYTES. The secret value is never logged or embedded in
 * error messages — only its presence/length is reported.
 */
export function resolveCursorSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.SYNC_CURSOR_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error(
      'SYNC_CURSOR_SECRET is not set — /emails/changes refuses to register ' +
        'without a cursor-signing secret (fail-closed; see NOTES.md)'
    );
  }
  if (Buffer.byteLength(secret, 'utf8') < MIN_CURSOR_SECRET_BYTES) {
    throw new Error(
      `SYNC_CURSOR_SECRET must be at least ${MIN_CURSOR_SECRET_BYTES} bytes ` +
        `(weak-secret footgun: refusing to register)`
    );
  }
  return secret;
}

interface DecodedCursor {
  t: Date;
  id: string;
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64, 'utf8').digest('base64url');
}

/**
 * Encode a sync position (updatedAt, id) as an opaque signed cursor.
 * Wire format: `<base64url-payload>.<base64url-hmac-sha256>` — still one
 * opaque string, so clients treat it exactly as before.
 *
 * The secret is a required parameter (fail-closed): there is deliberately no
 * default, so no code path can accidentally sign with a missing secret.
 */
export function encodeCursor(t: Date, id: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ t: t.toISOString(), id }), 'utf8').toString('base64url');
  return `${payload}.${signPayload(payload, secret)}`;
}

/**
 * Decode an opaque sync cursor. Throws CursorError on ANY malformed input:
 * wrong shape (no/extra `.`), bad base64, bad HMAC signature (verified with
 * crypto.timingSafeEqual in constant time), bad JSON, missing/invalid `t`
 * (must parse to a valid Date), missing/invalid `id` (must be a non-empty
 * string). Unsigned legacy cursors (plain base64url, no `.`) are rejected —
 * they pre-date this staged code and never reached a live client.
 */
export function decodeCursor(raw: string, secret: string): DecodedCursor {
  const dot = raw.indexOf('.');
  if (dot <= 0 || raw.indexOf('.', dot + 1) !== -1) {
    throw new CursorError('not in signed cursor format');
  }
  const payloadB64 = raw.slice(0, dot);
  const sigB64 = raw.slice(dot + 1);

  const expected = Buffer.from(signPayload(payloadB64, secret), 'base64url');
  let actual: Buffer;
  try {
    actual = Buffer.from(sigB64, 'base64url');
  } catch {
    throw new CursorError('signature is not decodable as base64url');
  }
  // timingSafeEqual throws on length mismatch — catch it as a cursor error.
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new CursorError('bad cursor signature');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new CursorError('payload not decodable as base64url JSON');
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
  // Fail-closed: resolve the signing secret once at registration. A missing,
  // empty, or weak secret throws here — the plugin never registers half-safe.
  const cursorSecret = resolveCursorSecret();

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

    // Resolve the sync position: start of history, or the verified cursor.
    let sinceT: Date;
    let sinceId: string;
    if (!parsed.data.since) {
      sinceT = new Date('1970-01-01T00:00:00.000Z');
      sinceId = '';
    } else {
      try {
        const decoded = decodeCursor(parsed.data.since, cursorSecret);
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
    })) as Array<{
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
          last.id,
          cursorSecret
        )
      : encodeCursor(sinceT, sinceId, cursorSecret);

    return reply.send({ success: true, data: { changes, nextCursor, hasMore } });
  });
}
