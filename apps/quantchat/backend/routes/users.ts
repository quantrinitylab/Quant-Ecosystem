import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { getPrivacyService } from '../services/privacy.service';
import { serializeEmojiStatus } from '../lib/emoji-status';
import { isBirthdayOn, todayMonthDayIn } from '../lib/birthdays';

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

const birthdaysTodaySchema = z.object({
  tz: z.string().min(1).max(64).optional(),
});

interface BirthdayUserRow {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  dateOfBirth: Date | null;
}

/** Structural Prisma surface for GET /users/birthdays/today (QC-F-467). */
interface BirthdaysPrisma {
  user: {
    findMany: (args: unknown) => Promise<BirthdayUserRow[]>;
  };
  conversationMember: {
    findMany: (
      args: unknown,
    ) => Promise<Array<{ conversationId: string; userId?: string }>>;
  };
  conversation: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
  };
  closeFriend: {
    findMany: (
      args: unknown,
    ) => Promise<Array<{ userId: string; friendId: string }>>;
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

  // GET /users/birthdays/today?tz=<IANA> — QC-F-467.
  //
  // The chat-list birthday banner's only data source. Candidates are
  // people with a REAL relationship to the viewer — the other member of
  // an active DIRECT conversation, or a CloseFriend edge in either
  // direction. A stranger whose pref is 'everyone' is still NOT a
  // candidate: this is a contacts surface, not discovery (search stays
  // birthday-free for the same reason). "Today" is the viewer's day: the
  // server clock read in the viewer's timezone (the client supplies only
  // the frame via `tz`; an unknown tz is a 400, a missing one falls back
  // to UTC). The response carries NO date, year, or age — "it is today"
  // is the only fact the banner needs.
  fastify.get('/birthdays/today', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const parseResult = birthdaysTodaySchema.safeParse(request.query);
    if (!parseResult.success) {
      throw createAppError('Invalid query', 400, 'BAD_REQUEST');
    }
    const tz = parseResult.data.tz ?? 'UTC';
    let today: { month: number; day: number; year: number };
    try {
      today = todayMonthDayIn(tz, new Date());
    } catch {
      throw createAppError('Invalid timezone', 400, 'BAD_REQUEST');
    }

    const prisma = (fastify as unknown as { prisma: BirthdaysPrisma }).prisma;

    // Candidate set, part 1: DIRECT partners (both members active).
    const viewerMemberships = await prisma.conversationMember.findMany({
      where: { userId, leftAt: null },
      select: { conversationId: true },
    });
    const viewerConvIds = viewerMemberships.map((m) => m.conversationId);
    const directByUser = new Map<string, string>();
    if (viewerConvIds.length > 0) {
      const directConvs = await prisma.conversation.findMany({
        where: { id: { in: viewerConvIds }, type: 'DIRECT', deletedAt: null },
        select: { id: true },
      });
      const directIds = directConvs.map((c) => c.id);
      if (directIds.length > 0) {
        const partners = await prisma.conversationMember.findMany({
          where: {
            conversationId: { in: directIds },
            userId: { not: userId },
            leftAt: null,
          },
          select: { conversationId: true, userId: true },
        });
        for (const p of partners) {
          if (p.userId && !directByUser.has(p.userId)) {
            directByUser.set(p.userId, p.conversationId);
          }
        }
      }
    }

    // Candidate set, part 2: CloseFriend edges in either direction.
    const candidateIds = new Set<string>(directByUser.keys());
    const edges = await prisma.closeFriend.findMany({
      where: { OR: [{ userId }, { friendId: userId }] },
      select: { userId: true, friendId: true },
    });
    for (const edge of edges) {
      const other = edge.userId === userId ? edge.friendId : edge.userId;
      if (other && other !== userId) candidateIds.add(other);
    }

    if (candidateIds.size === 0) {
      return reply.send({ success: true, data: [] });
    }

    // Account-status deny-list (same predicate as search, QC-F-259) and
    // a stored DOB are both required before the day/visibility checks.
    const rows = await prisma.user.findMany({
      where: {
        id: { in: [...candidateIds] },
        deletedAt: null,
        status: { notIn: ['SUSPENDED', 'DEACTIVATED'] },
        dateOfBirth: { not: null },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        dateOfBirth: true,
      },
    });

    const todays = rows.filter(
      (r) => r.dateOfBirth && isBirthdayOn(r.dateOfBirth, today.month, today.day, today.year),
    );
    if (todays.length === 0) {
      return reply.send({ success: true, data: [] });
    }

    // Visibility: the owner's whoCanSeeBirthday pref, batch-resolved with
    // the pair block check inside (fail-closed throughout).
    const privacy = getPrivacyService(prisma);
    const visibility = await privacy.birthdayVisibilityFor(
      userId,
      todays.map((r) => r.id),
    );
    const visible = todays.filter((r) => visibility.get(r.id) === true);
    visible.sort(
      (a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id),
    );

    return reply.send({
      success: true,
      data: visible.map((r) => ({
        userId: r.id,
        displayName: r.displayName,
        username: r.username,
        avatarUrl: r.avatarUrl,
        directConversationId: directByUser.get(r.id) ?? null,
      })),
    });
  });
}
