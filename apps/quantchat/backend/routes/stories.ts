// ============================================================================
// QuantChat - Stories Backend Routes (Prisma-backed)
//
//   GET    /stories/feed            - non-expired stories grouped by author
//   POST   /stories                 - create a story (expires after 24h)
//   DELETE /stories/:storyId        - delete your own story
//   POST   /stories/:storyId/view   - mark a story viewed (idempotent)
//   GET    /stories/:storyId/viewers - list viewers (story owner only)
//   POST   /stories/:storyId/reply  - accept a reply to a story
//
// The feed response shape matches what the web client's useStories hook
// expects: { groups: [{ userId, userName, userAvatar, stories, hasUnviewed }] }.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Prisma StoryType (IMAGE/VIDEO/TEXT) <-> client story type ('photo'/'video'/'text')
const prismaToClientType = { IMAGE: 'photo', VIDEO: 'video', TEXT: 'text' } as const;
const clientToPrismaType = { photo: 'IMAGE', video: 'VIDEO', text: 'TEXT' } as const;

const createStoryBodySchema = z.object({
  type: z.enum(['photo', 'video', 'text']).default('photo'),
  mediaUrl: z.string().min(1).max(4096).optional(),
  // Text-story body. Only meaningful for type 'text'; silently dropped (never
  // stored) for photo/video so a media story can never smuggle stray text.
  text: z.string().min(1).max(500).optional(),
  duration: z.number().int().min(1).max(120).default(15),
  audience: z.enum(['ALL', 'CLOSE_FRIENDS']).default('ALL'),
});

const replyBodySchema = z.object({
  message: z.string().min(1).max(1000),
});

function getPrisma(fastify: FastifyInstance): PrismaClient {
  return (fastify as unknown as { prisma: PrismaClient }).prisma;
}

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

interface StoryWithAuthor {
  id: string;
  userId: string;
  type: 'IMAGE' | 'VIDEO' | 'TEXT';
  mediaUrl: string | null;
  textContent: string | null;
  duration: number;
  viewCount: number;
  audience: string;
  createdAt: Date;
  expiresAt: Date;
  user: { id: string; displayName: string; avatarUrl: string | null };
}

// --- Story audience gate (QC-F-021) ---------------------------------------
//
// A story is visible only when BOTH gates pass (QC-F-042 §3.3a AND rule):
//   1. Per-story audience: 'ALL' passes for anyone; 'CLOSE_FRIENDS' only
//      for viewers the AUTHOR listed as a close friend (CloseFriend edge
//      userId=author, friendId=viewer).
//   2. Per-author privacy pref `whoCanSeeStory` (settings DEFAULT_PRIVACY,
//      default 'friends'): 'everyone' passes for anyone; 'friends' and
//      'custom' only for "friends" of the author. 'custom' is treated as
//      'friends' — no custom-list storage exists in the codebase, and
//      reading it as 'everyone' would open what the user tried to narrow.
// "Friend" (v1, same definition as the QC-F-042 brief §3.1): the author
// listed the viewer as a close friend, OR author and viewer share an
// active DIRECT conversation (both members, leftAt null). Group
// membership does NOT count.
// Missing prefs resolve to the settings defaults ('friends'); a failed
// prefs/relationship read resolves fail-closed in the same direction
// (never 'everyone') — see QC-F-042 §4.

type WhoCanSeeStory = 'everyone' | 'friends' | 'custom';

interface FriendContext {
  /** Authors who listed the viewer as a close friend. */
  closeFriendAuthors: Set<string>;
  /** Authors sharing an active DIRECT conversation with the viewer. */
  directChatAuthors: Set<string>;
  /** Author id -> whoCanSeeStory pref (absent = default 'friends'). */
  prefByAuthor: Map<string, WhoCanSeeStory>;
}

function readWhoCanSeeStory(preferences: unknown): WhoCanSeeStory {
  if (!preferences || typeof preferences !== 'object') return 'friends';
  const chat = (preferences as Record<string, unknown>)['chatSettings'];
  if (!chat || typeof chat !== 'object') return 'friends';
  const privacy = (chat as Record<string, unknown>)['privacy'];
  if (!privacy || typeof privacy !== 'object') return 'friends';
  const value = (privacy as Record<string, unknown>)['whoCanSeeStory'];
  return value === 'everyone' || value === 'friends' || value === 'custom'
    ? value
    : 'friends';
}

async function loadFriendContext(
  prisma: PrismaClient,
  viewerId: string,
  authorIds: string[],
): Promise<FriendContext> {
  const ctx: FriendContext = {
    closeFriendAuthors: new Set<string>(),
    directChatAuthors: new Set<string>(),
    prefByAuthor: new Map<string, WhoCanSeeStory>(),
  };
  const authors = [...new Set(authorIds)].filter((id) => id !== viewerId);
  if (authors.length === 0) return ctx;

  try {
    const edges = await prisma.closeFriend.findMany({
      where: { userId: { in: authors }, friendId: viewerId },
      select: { userId: true },
    });
    for (const edge of edges) ctx.closeFriendAuthors.add(edge.userId);
  } catch {
    // Fail-closed: no close-friend edges are assumed on error.
  }

  try {
    const rows = await prisma.user.findMany({
      where: { id: { in: authors } },
      select: { id: true, preferences: true },
    });
    for (const row of rows) {
      ctx.prefByAuthor.set(row.id, readWhoCanSeeStory(row.preferences));
    }
  } catch {
    // Fail-closed: absent pref = default 'friends' in canViewStory.
  }

  try {
    const viewerMemberships = await prisma.conversationMember.findMany({
      where: { userId: viewerId, leftAt: null },
      select: { conversationId: true },
    });
    const conversationIds = viewerMemberships.map((m) => m.conversationId);
    if (conversationIds.length > 0) {
      const authorMemberships = await prisma.conversationMember.findMany({
        where: {
          conversationId: { in: conversationIds },
          userId: { in: authors },
          leftAt: null,
        },
        select: { conversationId: true, userId: true },
      });
      if (authorMemberships.length > 0) {
        const direct = await prisma.conversation.findMany({
          where: {
            id: { in: [...new Set(authorMemberships.map((m) => m.conversationId))] },
            type: 'DIRECT',
          },
          select: { id: true },
        });
        const directIds = new Set(direct.map((c) => c.id));
        for (const m of authorMemberships) {
          if (directIds.has(m.conversationId)) ctx.directChatAuthors.add(m.userId);
        }
      }
    }
  } catch {
    // Fail-closed: no direct-chat relationships are assumed on error.
  }

  return ctx;
}

function canViewStory(
  viewerId: string,
  story: { userId: string; audience?: string | null },
  ctx: FriendContext,
): boolean {
  if (story.userId === viewerId) return true;
  // Gate 1: per-story audience.
  if (
    story.audience === 'CLOSE_FRIENDS' &&
    !ctx.closeFriendAuthors.has(story.userId)
  ) {
    return false;
  }
  // Gate 2: per-author privacy preference.
  const pref = ctx.prefByAuthor.get(story.userId) ?? 'friends';
  if (pref === 'everyone') return true;
  // 'friends' | 'custom' (custom == friends in v1, see header note).
  return (
    ctx.closeFriendAuthors.has(story.userId) ||
    ctx.directChatAuthors.has(story.userId)
  );
}

function serializeStory(story: StoryWithAuthor, isViewed: boolean) {
  return {
    id: story.id,
    authorId: story.userId,
    authorName: story.user.displayName,
    authorAvatar: story.user.avatarUrl ?? '',
    type: prismaToClientType[story.type],
    mediaUrl: story.mediaUrl ?? undefined,
    // Client type for TEXT stories: the viewer renders `text`. Omit for
    // photo/video so a media story never carries stale text.
    text: story.type === 'TEXT' ? story.textContent ?? undefined : undefined,
    duration: story.duration,
    viewCount: story.viewCount,
    audience: story.audience ?? 'ALL',
    createdAt: story.createdAt.toISOString(),
    expiresAt: story.expiresAt.toISOString(),
    isViewed,
    replies: 0,
  };
}

export default async function storiesRoutes(fastify: FastifyInstance) {
  // GET /stories/feed - story groups from non-expired stories, own group first
  fastify.get('/feed', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);

    const [stories, views] = await Promise.all([
      prisma.story.findMany({
        where: { expiresAt: { gt: new Date() } },
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.storyView.findMany({
        where: { viewerId: userId },
        select: { storyId: true },
      }),
    ]);
    const viewedIds = new Set(views.map((v) => v.storyId));

    // QC-F-021: drop every story the viewer is not allowed to see BEFORE
    // grouping, so an invisible story leaves no group/existence trace.
    const allStories = stories as StoryWithAuthor[];
    const friendCtx = await loadFriendContext(
      prisma,
      userId,
      allStories.map((s) => s.userId),
    );
    const visibleStories = allStories.filter((s) =>
      canViewStory(userId, s, friendCtx),
    );

    // Group by author, preserving recency order; viewer's own group first.
    const groupOrder: string[] = [];
    const groupsByUser = new Map<string, ReturnType<typeof serializeStory>[]>();
    for (const story of visibleStories) {
      if (!groupsByUser.has(story.userId)) {
        groupsByUser.set(story.userId, []);
        groupOrder.push(story.userId);
      }
      groupsByUser
        .get(story.userId)!
        .push(serializeStory(story, viewedIds.has(story.id)));
    }
    groupOrder.sort((a, b) => {
      if (a === userId) return -1;
      if (b === userId) return 1;
      return 0;
    });

    const groups = groupOrder.map((authorId) => {
      const authorStories = groupsByUser.get(authorId)!;
      const first = visibleStories.find((s) => s.userId === authorId)!;
      return {
        userId: authorId,
        userName: first.user.displayName,
        userAvatar: first.user.avatarUrl ?? '',
        stories: authorStories,
        hasUnviewed: authorStories.some((s) => !s.isViewed),
      };
    });

    return reply.send({ groups });
  });

  // POST /stories - create a story
  fastify.post('/', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const parsed = createStoryBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid story payload', 400, 'BAD_REQUEST');
    }
    // A text story with no text is a no-op the client would render as a blank
    // card — reject honestly instead of persisting an empty story.
    const textBody = parsed.data.text?.trim();
    if (parsed.data.type === 'text' && !textBody) {
      throw createAppError('Text content is required for text stories', 400, 'BAD_REQUEST');
    }

    const story = await prisma.story.create({
      data: {
        userId,
        type: clientToPrismaType[parsed.data.type],
        mediaUrl: parsed.data.mediaUrl ?? null,
        // Persist the text body only for TEXT stories; photo/video rows keep
        // textContent NULL.
        textContent: parsed.data.type === 'text' ? textBody ?? null : null,
        duration: parsed.data.duration,
        audience: parsed.data.audience,
        expiresAt: new Date(Date.now() + STORY_TTL_MS),
      },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    });

    return reply
      .status(201)
      .send({ success: true, story: serializeStory(story as StoryWithAuthor, false) });
  });

  // DELETE /stories/:storyId - delete your own story
  fastify.delete('/:storyId', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const { storyId } = request.params as { storyId: string };

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    if (story.userId !== userId) {
      throw createAppError('You can only delete your own stories', 403, 'FORBIDDEN');
    }

    // StoryView is relation-free, so delete view rows explicitly.
    await prisma.storyView.deleteMany({ where: { storyId } });
    await prisma.story.delete({ where: { id: storyId } });

    return reply.send({ success: true });
  });

  // POST /stories/:storyId/view - mark viewed (idempotent, owner views excluded)
  fastify.post('/:storyId/view', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const { storyId } = request.params as { storyId: string };

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    // QC-F-021: an invisible story answers 404 (not 403) so its existence
    // is not leaked, and no view is recorded for it.
    const friendCtx = await loadFriendContext(prisma, userId, [story.userId]);
    if (!canViewStory(userId, story, friendCtx)) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }

    if (story.userId !== userId) {
      const existing = await prisma.storyView.findUnique({
        where: { storyId_viewerId: { storyId, viewerId: userId } },
      });
      if (!existing) {
        await prisma.storyView.create({ data: { storyId, viewerId: userId } });
        await prisma.story.update({
          where: { id: storyId },
          data: { viewCount: { increment: 1 } },
        });
      }
    }

    const updated = await prisma.story.findUnique({
      where: { id: storyId },
      select: { viewCount: true },
    });
    return reply.send({ success: true, viewCount: updated?.viewCount ?? story.viewCount });
  });

  // GET /stories/:storyId/viewers - viewers of your story
  fastify.get('/:storyId/viewers', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const { storyId } = request.params as { storyId: string };

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    if (story.userId !== userId) {
      throw createAppError('Only the story owner can see viewers', 403, 'FORBIDDEN');
    }

    const views = await prisma.storyView.findMany({
      where: { storyId },
      orderBy: { viewedAt: 'desc' },
      take: 200,
    });
    const viewerIds = [...new Set(views.map((v) => v.viewerId))];
    const users = await prisma.user.findMany({
      where: { id: { in: viewerIds } },
      select: { id: true, displayName: true, avatarUrl: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return reply.send({
      viewers: views.map((v) => ({
        userId: v.viewerId,
        name: userById.get(v.viewerId)?.displayName ?? 'Unknown',
        avatar: userById.get(v.viewerId)?.avatarUrl ?? '',
        viewedAt: v.viewedAt.toISOString(),
      })),
    });
  });

  // POST /stories/:storyId/reply - accept a reply to a story
  fastify.post('/:storyId/reply', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const { storyId } = request.params as { storyId: string };

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true, audience: true },
    });
    if (!story) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    // QC-F-021: same audience gate as the feed/view — an invisible story
    // answers 404 and accepts no reply.
    const friendCtx = await loadFriendContext(prisma, userId, [story.userId]);
    if (!canViewStory(userId, story, friendCtx)) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    const parsed = replyBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Reply message is required', 400, 'BAD_REQUEST');
    }
    if (story.userId === userId) {
      throw createAppError('You cannot reply to your own story', 400, 'BAD_REQUEST');
    }

    // TODO: deliver the reply as a DM to the story author once the messaging
    // conversation bootstrap is wired here. Accepted for now so the client
    // flow (toast "Reply sent") works end to end.
    fastify.log.info(
      { storyId, replierId: userId, authorId: story.userId },
      'Story reply received',
    );
    return reply.send({ success: true });
  });
}
