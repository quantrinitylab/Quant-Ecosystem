import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

// ============================================================================
// QuantChat — user directory routes (contact discovery for new chats)
// ============================================================================
//
// GET /users/search?q=... powers the "New chat" contact picker. It returns a
// safe public profile subset (never password hashes, tokens, phone numbers, or
// other PII beyond what the directory needs), excludes the requesting user,
// and only matches ACTIVE accounts so suspended, deactivated, or unverified
// rows are not discoverable.

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
        status: 'ACTIVE',
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

    return reply.send({ success: true, data: users });
  });
}
