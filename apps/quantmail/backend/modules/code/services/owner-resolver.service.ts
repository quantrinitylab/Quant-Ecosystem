import type { PrismaClient } from '@prisma/client';

export interface ResolvedOwner {
  id: string;
  type: 'user' | 'org';
}

/**
 * Resolves a URL owner parameter (which could be a username, org slug, email prefix, or cuid)
 * to the canonical database owner ID.
 *
 * Supported formats:
 * 1. User CUID (direct lookup)
 * 2. User username (case-insensitive exact match)
 * 3. User email prefix (e.g. 'founder' from 'founder@quantmail.in')
 * 4. Organization CUID or slug (case-insensitive exact match)
 */
export async function resolveOwner(
  prisma: PrismaClient,
  ownerIdentifier: string,
): Promise<ResolvedOwner | null> {
  if (!ownerIdentifier || typeof ownerIdentifier !== 'string') return null;

  const normalized = ownerIdentifier.trim();

  // 1. Direct ID lookup on User
  try {
    const userById = await prisma.user.findUnique({
      where: { id: normalized },
      select: { id: true },
    });
    if (userById) {
      return { id: userById.id, type: 'user' };
    }
  } catch {
    // Continue to next resolution strategy
  }

  // 2. Case-insensitive username lookup on User
  try {
    const userByUsername = await prisma.user.findFirst({
      where: {
        username: { equals: normalized, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (userByUsername) {
      return { id: userByUsername.id, type: 'user' };
    }
  } catch {
    // Continue to next resolution strategy
  }

  // 3. Email prefix fallback (handles users before explicit username setup)
  try {
    const userByEmail = await prisma.user.findFirst({
      where: {
        email: { startsWith: `${normalized}@`, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (userByEmail) {
      return { id: userByEmail.id, type: 'user' };
    }
  } catch {
    // Continue to next resolution strategy
  }

  // 4. Organization lookup by ID or unique slug
  try {
    const org = await (prisma as any).organization?.findFirst?.({
      where: {
        OR: [
          { id: normalized },
          { slug: { equals: normalized, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (org) {
      return { id: org.id, type: 'org' };
    }
  } catch {
    // Organization model or query failure, fallback
  }

  return null;
}

/**
 * Finds a repository matching an owner identifier (handle/slug/cuid) and repository name.
 */
export async function findRepositoryByOwnerAndName(
  prisma: PrismaClient,
  ownerIdentifier: string,
  repoName: string,
  extraWhere: Record<string, any> = {},
) {
  const resolved = await resolveOwner(prisma, ownerIdentifier);
  const ownerIdCandidates = resolved
    ? [resolved.id, ownerIdentifier]
    : [ownerIdentifier];

  return prisma.repository.findFirst({
    where: {
      ownerId: { in: ownerIdCandidates },
      name: repoName,
      deletedAt: null,
      ...extraWhere,
    },
  });
}
