import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { getPrivacyService } from '../services/privacy.service';

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
});

interface DirectoryUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
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
    const { q, limit = 20 } = parseResult.data;

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
      },
      take: limit,
      orderBy: { displayName: 'asc' },
    });

    // QC-F-042: hideFromSearch post-filter. A user who turned on "Hide
    // profile from search" must not be discoverable here — by username,
    // display name, OR email (the query above matches all three). Prefs are
    // batch-resolved from the same store; a prefs failure hides the user
    // (fail-closed — being undiscoverable for one page is reversible,
    // being exposed after opting out is not) and never 500s the search.
    // Honest v1 limit: the query's `take: limit` applies before this
    // filter, so a page can come back shorter than `limit` when hidden
    // users matched; over-fetching to backfill is a deliberate non-goal
    // here (it would change the query's cost profile silently).
    const privacy = getPrivacyService(prisma);
    const resolved = await privacy.resolveMany(users.map((u) => u.id));
    const visible = users.filter((u) => {
      const entry = resolved.get(u.id);
      return !(entry?.prefs.hideFromSearch ?? false);
    });

    return reply.send({ success: true, data: visible });
  });
}
