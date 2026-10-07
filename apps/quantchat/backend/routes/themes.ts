import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ThemeService } from '../services/theme.service';

// ============================================================================
// Task 14.3: Chat Theme Routes
//
// Persists per-conversation theme selection. Mounted at /conversations so the
// canonical endpoint is POST /conversations/:id/theme.
//
// Requirements: 14.1 (theme catalog), 14.3 (persist per-conversation)
// ============================================================================

const setThemeSchema = z.object({
  themeId: z.string().min(1).max(100),
});

export default async function themesRoutes(fastify: FastifyInstance) {
  // GET /conversations/themes - list predefined themes
  fastify.get('/themes', async (_request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ThemeService(prisma as never);
    const themes = await service.listThemes();
    return reply.send({ success: true, data: themes });
  });

  // GET /conversations/:id/theme - get the current theme id
  fastify.get<{ Params: { id: string } }>('/:id/theme', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ThemeService(prisma as never);
    const themeId = await service.getConversationThemeId(request.params.id);
    return reply.send({ success: true, data: { themeId } });
  });

  // POST /conversations/:id/theme - set the conversation theme
  fastify.post<{ Params: { id: string } }>('/:id/theme', async (request, reply) => {
    const parseResult = setThemeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ThemeService(prisma as never);
    const conversation = await service.setConversationTheme(
      request.params.id,
      parseResult.data.themeId,
    );

    return reply.send({
      success: true,
      data: { conversationId: conversation.id, themeId: parseResult.data.themeId },
    });
  });
}
