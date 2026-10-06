// ============================================================================
// QuantChat - User Settings Routes
//
// Persists per-user chat settings (privacy, notifications, theme, language,
// blocked users) in the User.preferences JSON column under the `chatSettings`
// key. Mounted at /settings so the canonical endpoints are:
//
//   GET    /settings               -> current settings (merged over defaults)
//   PUT    /settings               -> upsert settings (validated with zod)
//   DELETE /settings/blocked/:id    -> unblock a user
//   POST   /settings/export        -> JSON export of the user's chat data
//   DELETE /settings/account       -> soft-delete the account (deletedAt)
//
// Previously the frontend called these endpoints but no route existed, so the
// PUT 404'd and the settings page silently "saved" nothing (the page never
// checked response.ok). This route closes that gap.
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';

const privacySchema = z.object({
  whoCanMessage: z.enum(['everyone', 'friends', 'nobody']).optional(),
  whoCanSeeStory: z.enum(['everyone', 'friends', 'custom']).optional(),
  whoCanSeeLocation: z.enum(['friends', 'nobody', 'ghost']).optional(),
  showOnlineStatus: z.boolean().optional(),
  showReadReceipts: z.boolean().optional(),
  showTypingIndicator: z.boolean().optional(),
  allowScreenshots: z.boolean().optional(),
  hideFromSearch: z.boolean().optional(),
});

const notificationsSchema = z.object({
  messages: z.boolean().optional(),
  stories: z.boolean().optional(),
  friendRequests: z.boolean().optional(),
  mentions: z.boolean().optional(),
  groupInvites: z.boolean().optional(),
  streakReminders: z.boolean().optional(),
  spotlight: z.boolean().optional(),
  sound: z.boolean().optional(),
  vibrate: z.boolean().optional(),
  preview: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().max(10).optional(),
  quietHoursEnd: z.string().max(10).optional(),
});

const settingsBodySchema = z
  .object({
    privacy: privacySchema.optional(),
    notifications: notificationsSchema.optional(),
    theme: z.string().min(1).max(50).optional(),
    language: z.string().min(2).max(10).optional(),
  })
  .strict();

const DEFAULT_PRIVACY = {
  whoCanMessage: 'friends',
  whoCanSeeStory: 'friends',
  whoCanSeeLocation: 'friends',
  showOnlineStatus: true,
  showReadReceipts: true,
  showTypingIndicator: true,
  allowScreenshots: false,
  hideFromSearch: false,
} as const;

const DEFAULT_NOTIFICATIONS = {
  messages: true,
  stories: true,
  friendRequests: true,
  mentions: true,
  groupInvites: true,
  streakReminders: true,
  spotlight: true,
  sound: true,
  vibrate: true,
  preview: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
} as const;

type ChatSettings = {
  privacy?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
  theme?: unknown;
  language?: unknown;
  blockedUsers?: unknown;
};

function readChatSettings(preferences: unknown): ChatSettings {
  if (!preferences || typeof preferences !== 'object') return {};
  const chat = (preferences as Record<string, unknown>).chatSettings;
  if (!chat || typeof chat !== 'object') return {};
  return chat as ChatSettings;
}

function toSettingsView(chat: ChatSettings) {
  return {
    privacy: { ...DEFAULT_PRIVACY, ...(chat.privacy ?? {}) },
    notifications: { ...DEFAULT_NOTIFICATIONS, ...(chat.notifications ?? {}) },
    theme: typeof chat.theme === 'string' && chat.theme ? chat.theme : 'dark',
    language: typeof chat.language === 'string' && chat.language ? chat.language : 'en',
    blockedUsers: Array.isArray(chat.blockedUsers) ? chat.blockedUsers : [],
  };
}

function getAuthUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

function getPrisma(fastify: FastifyInstance): PrismaClient {
  return (fastify as unknown as { prisma: PrismaClient }).prisma;
}

export default async function settingsRoutes(fastify: FastifyInstance) {
  // GET /settings — read current settings merged over defaults.
  fastify.get('/', async (request, reply) => {
    const userId = getAuthUserId(request);
    const prisma = getPrisma(fastify);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    if (!user) throw createAppError('User not found', 404, 'USER_NOT_FOUND');
    return reply.send({ success: true, data: toSettingsView(readChatSettings(user.preferences)) });
  });

  // PUT /settings — validate and persist (deep-merge over existing).
  fastify.put('/', async (request, reply) => {
    const userId = getAuthUserId(request);
    const parsed = settingsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid settings payload', 400, 'BAD_REQUEST');
    }
    const prisma = getPrisma(fastify);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    if (!user) throw createAppError('User not found', 404, 'USER_NOT_FOUND');

    const prefs =
      user.preferences && typeof user.preferences === 'object'
        ? { ...(user.preferences as Record<string, unknown>) }
        : {};
    const existing = readChatSettings(prefs);
    const next: ChatSettings = {
      ...existing,
      ...(parsed.data.privacy ? { privacy: { ...(existing.privacy ?? {}), ...parsed.data.privacy } } : {}),
      ...(parsed.data.notifications
        ? { notifications: { ...(existing.notifications ?? {}), ...parsed.data.notifications } }
        : {}),
      ...(parsed.data.theme ? { theme: parsed.data.theme } : {}),
      ...(parsed.data.language ? { language: parsed.data.language } : {}),
    };
    prefs.chatSettings = next;

    await prisma.user.update({
      where: { id: userId },
      data: { preferences: prefs as Prisma.InputJsonValue },
    });
    return reply.send({ success: true, data: toSettingsView(next) });
  });

  // DELETE /settings/blocked/:userId — remove a user from the block list.
  fastify.delete<{ Params: { userId: string } }>(
    '/blocked/:userId',
    async (request, reply) => {
      const userId = getAuthUserId(request);
      const blockedId = request.params.userId;
      if (!blockedId) throw createAppError('Blocked user id is required', 400, 'BAD_REQUEST');
      const prisma = getPrisma(fastify);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { preferences: true },
      });
      if (!user) throw createAppError('User not found', 404, 'USER_NOT_FOUND');

      const prefs =
        user.preferences && typeof user.preferences === 'object'
          ? { ...(user.preferences as Record<string, unknown>) }
          : {};
      const existing = readChatSettings(prefs);
      const blocked = Array.isArray(existing.blockedUsers) ? existing.blockedUsers : [];
      const filtered = blocked.filter(
        (entry) =>
          !(entry && typeof entry === 'object' && (entry as { id?: unknown }).id === blockedId),
      );
      prefs.chatSettings = { ...existing, blockedUsers: filtered };
      await prisma.user.update({ where: { id: userId }, data: { preferences: prefs as Prisma.InputJsonValue } });
      return reply.send({ success: true, data: { blockedUsers: filtered } });
    },
  );

  // POST /settings/export — JSON export of the user's chat settings + identity.
  fastify.post('/export', async (request, reply) => {
    const userId = getAuthUserId(request);
    const prisma = getPrisma(fastify);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        preferences: true,
        xpPoints: true,
        level: true,
        createdAt: true,
      },
    });
    if (!user) throw createAppError('User not found', 404, 'USER_NOT_FOUND');

    const payload = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        xpPoints: user.xpPoints,
        level: user.level,
        createdAt: user.createdAt,
      },
      settings: toSettingsView(readChatSettings(user.preferences)),
    };
    return reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', 'attachment; filename="quantchat-data.json"')
      .send(payload);
  });

  // DELETE /settings/account — soft-delete the account (deletedAt timestamp).
  // Sessions/tokens issued before deletion are rejected by the auth layer's
  // deletedAt check on subsequent requests.
  fastify.delete('/account', async (request, reply) => {
    const userId = getAuthUserId(request);
    const prisma = getPrisma(fastify);
    await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });
    return reply.send({ success: true, data: { deleted: true } });
  });
}
