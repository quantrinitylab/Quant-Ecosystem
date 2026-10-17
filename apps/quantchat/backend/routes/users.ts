import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { getPrivacyService } from '../services/privacy.service';
import { serializeEmojiStatus } from '../lib/emoji-status';

// ============================================================================
// QuantChat — user directory routes (contact discovery for new chats)
// ============================================================================
//
// GET /users/search?q=... powers the "New chat" contact picker. It returns a
// safe public profile subset (never password hashes, tokens, phone numbers, or
// other PII beyond what the directory needs), excludes the requesting user,
// and matches the account-status gate's DENY-LIST predicate (QC-F-259; see
// backend/lib/account-status.ts): a row is discoverable unless it is deleted
// (deletedAt set), SUSPENDED, or DEACTIVATED. There is deliberately NO
// ACTIVE allow-list here — phone-OTP users stay PENDING_VERIFICATION for
// their whole account life by design (QC-F-041), so an ACTIVE filter hid
// that entire population from discovery while the gate let them use the
// app. Invariant: anyone the gate resolves 'ok' is discoverable. A future
// signup path that uses PENDING_VERIFICATION to mean "not yet proven, keep
// hidden" must promote its own users (or revisit this filter) instead of
// relying on the status alone.

const searchUsersSchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  // QC-F-348: optional page (default 1). Callers that never send it (web)
  // keep the exact legacy behaviour — first page, bare-array `data`.
  page: z.coerce.number().int().min(1).optional(),
});

interface DirectoryUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  // QC-F-466: raw stored status columns; serialized through the expiry
  // helper below so an expired status is never served.
  statusEmoji?: string | null;
  statusEmojiExpiresAt?: Date | string | null;
}

interface DirectoryPrisma {
  user: {
    findMany: (args: unknown) => Promise<DirectoryUser[]>;
  };
}

export default async function usersRoutes(fastify: FastifyInstance) {
  // GET /users/search — find people to start a new chat with.
  fastify.get('/search', async (request, reply) => {
    const parseResult = searchUsersSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: DirectoryPrisma }).prisma;
    const { q, limit = 20, page = 1 } = parseResult.data;

    // QC-F-348: real paging. `take: limit + 1` is a probe — one extra row
    // tells us honestly whether another page exists (hasMore) without a
    // separate count query; the probe row is sliced off before the
    // response. The order MUST be total for skip/take paging to be
    // truthful, so displayName ties break on id (equal display names
    // otherwise page in database-arbitrary order — the same person could
    // appear on two pages or on none).
    const users = await prisma.user.findMany({
      where: {
        id: { not: userId },
        deletedAt: null,
        status: { notIn: ['SUSPENDED', 'DEACTIVATED'] },
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        statusEmoji: true,
        statusEmojiExpiresAt: true,
      },
      skip: (page - 1) * limit,
      take: limit + 1,
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    });

    const hasMore = users.length > limit;
    const pageUsers = users.slice(0, limit);

    // QC-F-042: hideFromSearch post-filter. A user who turned on "Hide
    // profile from search" must not be discoverable here — by username,
    // display name, OR email (the query above matches all three). Prefs are
    // batch-resolved from the same store; a prefs failure hides the user
    // (fail-closed — being undiscoverable for one page is reversible,
    // being exposed after opting out is not) and never 500s the search.
    // Honest v1 limit: the query's page slice (`skip` + `take: limit + 1`
    // probe) applies before this filter, so a page can come back shorter
    // than `limit` when hidden users matched; over-fetching to backfill
    // is a deliberate non-goal here (it would change the query's cost
    // profile silently). The filter therefore runs on the sliced page
    // (probe row already removed above), never on the probe row.
    const privacy = getPrivacyService(prisma);
    const resolved = await privacy.resolveMany(pageUsers.map((u) => u.id));
    const visible = pageUsers
      .filter((u) => {
        const entry = resolved.get(u.id);
        return !(entry?.prefs.hideFromSearch ?? false);
      })
      // QC-F-466: replace the raw stored columns with the one live-status
      // shape. The field is always present (null when there is no live
      // status) so clients never have to guess, and the raw columns never
      // leave the server.
      .map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        bio: u.bio,
        emojiStatus: serializeEmojiStatus(u),
      }));

    // `data` stays the bare array the web caller parses (QC-F-348 §3.2F);
    // paging truth rides in the `pagination` sibling, which old callers
    // ignore and the Flutter directory client reads.
    return reply.send({
      success: true,
      data: visible,
      pagination: { page, pageSize: limit, hasMore },
    });
  });
}
