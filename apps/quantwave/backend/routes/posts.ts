import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { PostService } from '../services/post.service';
import { CommentService } from '../services/comment.service';
import { PollService } from '../services/poll.service';

const createPostSchema = z.object({
  content: z.string().min(1).max(50000),
  type: z
    .enum(['TEXT', 'IMAGE', 'VIDEO', 'POLL', 'LINK', 'REPOST', 'THREAD', 'ARTICLE'])
    .optional(),
  mediaUrls: z.array(z.unknown()).optional(),
  hashtags: z.array(z.string()).optional(),
  mentions: z.array(z.string()).optional(),
  replyToId: z.string().optional(),
  communityId: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE', 'COMMUNITY_ONLY']).optional(),
  space: z.enum(['main', 'verified', 'anonymous']).optional(),
});

const updatePostSchema = z.object({
  content: z.string().min(1).max(50000).optional(),
  mediaUrls: z.array(z.unknown()).optional(),
  hashtags: z.array(z.string()).optional(),
  mentions: z.array(z.string()).optional(),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE', 'COMMUNITY_ONLY']).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const createCommentSchema = z.object({
  content: z.string().min(1).max(10000),
  parentId: z.string().optional(),
});

const pollVoteSchema = z.object({
  optionIndex: z.coerce.number().int().min(0),
});

const createPollSchema = z.object({
  question: z.string().min(1).max(300),
  options: z.array(z.string().min(1).max(120)).min(2).max(12),
  endAt: z.coerce.date().optional(),
  allowMultiple: z.boolean().optional(),
});

export default async function postsRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = createPostSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const post = await service.createPost({ ...parseResult.data, userId });

    return reply.status(201).send({ success: true, data: post });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const post = await service.getPost(request.params.id);

    return reply.send({ success: true, data: post });
  });

  fastify.get('/user/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const result = await service.listByUser(userId, queryResult.data);

    return reply.send({ success: true, data: result });
  });

  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updatePostSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const post = await service.updatePost(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: post });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const post = await service.deletePost(request.params.id, userId);

    return reply.send({ success: true, data: post });
  });

  fastify.post<{ Params: { id: string } }>('/:id/like', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const post = await service.likePost(request.params.id);

    return reply.send({ success: true, data: post });
  });

  fastify.post<{ Params: { id: string } }>('/:id/repost', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const post = await service.repost(request.params.id, userId);

    return reply.status(201).send({ success: true, data: post });
  });

  // --- Comments (wires the existing CommentService) ---
  fastify.get<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CommentService(prisma as never);
    const comments = await service.getComments(
      request.params.id,
      queryResult.data.page ?? 1,
      queryResult.data.pageSize ?? 20,
    );
    return reply.send({ success: true, data: comments });
  });

  fastify.post<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const parseResult = createCommentSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CommentService(prisma as never);
    const comment = await service.createComment(
      userId,
      request.params.id,
      parseResult.data.content,
      parseResult.data.parentId,
    );
    return reply.status(201).send({ success: true, data: comment });
  });

  fastify.delete<{ Params: { id: string; commentId: string } }>(
    '/:id/comments/:commentId',
    async (request, reply) => {
      const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
      if (!userId) {
        throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
      }
      const prisma = (fastify as unknown as { prisma: unknown }).prisma;
      const service = new CommentService(prisma as never);
      const result = await service.deleteComment(userId, request.params.commentId);
      if (!result.success) {
        throw createAppError('Comment not found', 404, 'COMMENT_NOT_FOUND');
      }
      return reply.send({ success: true, data: result });
    },
  );

  // --- Polls (wires the existing Poll/PollVote models; fixes the dead
  // /posts/:id/poll/vote proxy path) ---

  // Attach a poll to an existing POLL post (author only).
  fastify.post<{ Params: { id: string } }>('/:id/poll', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const parsed = createPollSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const post = await new PostService(prisma as never).getPost(request.params.id);
    if (post.userId !== userId) {
      throw createAppError('Only the author can add a poll', 403, 'NOT_POST_OWNER');
    }
    const poll = await new PollService(prisma as never).createPoll({
      postId: request.params.id,
      question: parsed.data.question,
      options: parsed.data.options,
      endAt: parsed.data.endAt ?? null,
      allowMultiple: parsed.data.allowMultiple ?? false,
    });
    return reply.status(201).send({ success: true, data: poll });
  });

  // Current poll results (annotated with the caller's selections when authed).
  fastify.get<{ Params: { id: string } }>('/:id/poll', async (request, reply) => {
    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const results = await new PollService(prisma as never).getResults(request.params.id, userId);
    return reply.send({ success: true, data: results });
  });

  // Cast/toggle the caller's vote on a poll option.
  fastify.post<{ Params: { id: string } }>('/:id/poll/vote', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const parsed = pollVoteSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const results = await new PollService(prisma as never).vote(
      request.params.id,
      userId,
      parsed.data.optionIndex,
    );
    return reply.send({ success: true, data: results });
  });
}
