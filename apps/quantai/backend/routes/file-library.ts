// ============================================================================
// QuantAI — Fastify Routes: Central File Library ('Upload once, use anytime')
//
// Task W39-A05: Endpoints for listing, indexing, searching, linking/attaching,
// and deleting files in the user's central library across chats.
// ============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { FileLibraryService, type FileCategory } from '../services/file-library.service';

const queryFileLibrarySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  projectId: z.string().optional(),
  chatId: z.string().optional(),
  sourceChatId: z.string().optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sortBy: z
    .enum([
      'name',
      'sizeBytes',
      'usageCount',
      'createdAt',
      'updatedAt',
      'lastUsedAt',
      'lastAccessedAt',
    ])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const indexFileSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
  originalName: z.string().max(255).optional(),
  mimeType: z.string().max(150).optional(),
  sizeBytes: z.number().int().min(0),
  storageKey: z.string().optional(),
  storageUri: z.string().optional(),
  category: z.string().optional(),
  hash: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  projectId: z.string().optional(),
  chatId: z.string().optional(),
  sourceChatId: z.string().optional(),
});

const attachBodySchema = z.object({
  fileId: z.string().optional(),
  targetChatId: z.string().optional(),
  chatId: z.string().optional(),
});

const fileParamsSchema = z.object({
  fileId: z.string().min(1),
});

export default async function fileLibraryRoutes(fastify: FastifyInstance) {
  function getService(): FileLibraryService {
    let service = (fastify as unknown as { fileLibraryService?: FileLibraryService })
      .fileLibraryService;
    if (!service) {
      service = new FileLibraryService();
      (fastify as unknown as { fileLibraryService: FileLibraryService }).fileLibraryService =
        service;
    }
    return service;
  }

  function getAuthenticatedUserId(request: FastifyRequest): string {
    const auth = (request as unknown as { auth?: { userId?: string } }).auth;
    if (auth?.userId) {
      return auth.userId;
    }
    const headerUserId = request.headers['x-user-id'];
    if (typeof headerUserId === 'string' && headerUserId.trim()) {
      return headerUserId.trim();
    }
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  // GET /files/library — List & search files with categorized filters
  fastify.get('/', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const queryResult = queryFileLibrarySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw createAppError(
        queryResult.error.errors[0]?.message || 'Invalid query parameters',
        400,
        'VALIDATION_ERROR',
      );
    }

    const {
      category,
      search,
      projectId,
      chatId,
      sourceChatId,
      tag,
      limit,
      offset,
      sortBy,
      sortOrder,
    } = queryResult.data;
    const service = getService();

    let files;
    if (search && search.trim()) {
      files = service.searchFiles(userId, search, {
        category,
        projectId,
        chatId: chatId ?? sourceChatId,
        limit,
        offset,
      });
    } else {
      files = service.listFiles(userId, {
        category,
        projectId,
        chatId: chatId ?? sourceChatId,
        tag,
        limit,
        offset,
        sortBy,
        sortOrder,
      });
    }

    const stats = service.getFileStats(userId);
    const usage = service.getStorageUsage(userId);

    return reply.send({
      success: true,
      data: files,
      total: files.length,
      stats,
      usage,
    });
  });

  // GET /files/library/stats — Library aggregate stats & storage quota breakdown
  fastify.get('/stats', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const service = getService();
    const stats = service.getFileStats(userId);
    const usage = service.getStorageUsage(userId);

    return reply.send({
      success: true,
      data: stats,
      usage,
    });
  });

  // POST /files/library/index — Index a file into central library ('Upload once, use anytime')
  fastify.post('/index', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const bodyResult = indexFileSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw createAppError(
        bodyResult.error.errors[0]?.message || 'Invalid file payload',
        400,
        'VALIDATION_ERROR',
      );
    }

    const file = getService().indexFile({
      ...bodyResult.data,
      userId,
      category: bodyResult.data.category as FileCategory | undefined,
    });

    return reply.status(201).send({
      success: true,
      data: file,
      message: 'File successfully indexed in central library',
    });
  });

  // POST /files/library/attach — Attach file to chat using { fileId, targetChatId }
  fastify.post('/attach', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const bodyResult = attachBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw bodyResult.error;
    }

    const fileId = bodyResult.data.fileId;
    const targetChat = bodyResult.data.targetChatId ?? bodyResult.data.chatId;

    if (!fileId) {
      throw createAppError('fileId is required', 400, 'BAD_REQUEST');
    }
    if (!targetChat) {
      throw createAppError('targetChatId is required', 400, 'BAD_REQUEST');
    }

    try {
      const file = getService().attachToChat(fileId, targetChat, userId);
      return reply.send({
        success: true,
        data: file,
        message: `File attached to chat ${targetChat}`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to attach file';
      throw createAppError(message, 404, 'NOT_FOUND');
    }
  });

  // POST /files/library/:fileId/attach — Attach specific fileId to chat
  fastify.post('/:fileId/attach', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const paramsResult = fileParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      throw paramsResult.error;
    }

    const bodyResult = attachBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw bodyResult.error;
    }

    const targetChat = bodyResult.data.chatId ?? bodyResult.data.targetChatId;
    if (!targetChat) {
      throw createAppError('chatId is required', 400, 'BAD_REQUEST');
    }

    try {
      const file = getService().attachToChat(paramsResult.data.fileId, targetChat, userId);

      return reply.send({
        success: true,
        data: file,
        message: `File attached to chat ${targetChat}`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to attach file';
      throw createAppError(message, 404, 'NOT_FOUND');
    }
  });

  // POST /files/library/:fileId/detach — Unlink file from chat
  fastify.post('/:fileId/detach', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const paramsResult = fileParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      throw paramsResult.error;
    }

    const bodyResult = attachBodySchema.safeParse(request.body ?? {});
    const targetChat = bodyResult.success
      ? (bodyResult.data.chatId ?? bodyResult.data.targetChatId)
      : undefined;

    try {
      const file = getService().unlinkFile(userId, paramsResult.data.fileId, targetChat);

      return reply.send({
        success: true,
        data: file,
        message: targetChat
          ? `File unlinked from chat ${targetChat}`
          : 'File detached from all chats',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to detach file';
      throw createAppError(message, 404, 'NOT_FOUND');
    }
  });

  // GET /files/library/:fileId — Get file details
  fastify.get('/:fileId', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const paramsResult = fileParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      throw paramsResult.error;
    }

    const file = getService().getFile(userId, paramsResult.data.fileId);
    if (!file) {
      throw createAppError('File not found in library', 404, 'NOT_FOUND');
    }

    return reply.send({
      success: true,
      data: file,
    });
  });

  // DELETE /files/library/:fileId — Permanently delete file from library
  fastify.delete('/:fileId', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const paramsResult = fileParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      throw paramsResult.error;
    }

    const deleted = getService().deleteFile(userId, paramsResult.data.fileId);
    if (!deleted) {
      throw createAppError('File not found in library', 404, 'NOT_FOUND');
    }

    return reply.send({
      success: true,
      message: 'File deleted from library',
    });
  });
}
