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
  createdAt: Date;
  expiresAt: Date;
  user: { id: string; displayName: string; avatarUrl: string | null };
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

    // Group by author, preserving recency order; viewer's own group first.
    const groupOrder: string[] = [];
    const groupsByUser = new Map<string, ReturnType<typeof serializeStory>[]>();
    for (const story of stories as StoryWithAuthor[]) {
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
      const first = stories.find(
        (s) => s.userId === authorId,
      ) as unknown as StoryWithAuthor;
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
      select: { id: true, userId: true },
    });
    if (!story) {
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
