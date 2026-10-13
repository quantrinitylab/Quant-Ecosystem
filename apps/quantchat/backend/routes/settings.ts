// ============================================================================
// QuantChat - User Settings Routes
//
// Persists per-user chat settings (privacy, notifications, theme, language,
// blocked users) in the User.preferences JSON column under the `chatSettings`
// key. Mounted at /settings so the canonical endpoints are:
//
//   GET    /settings               -> current settings (merged over defaults)
//   PUT    /settings               -> upsert settings (validated with zod)
//   POST   /settings/blocked/:id    -> block a user (QC-F-317)
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
import {
  DEFAULT_PRIVACY,
  extractBlockedUserIds,
  getPrivacyService,
} from '../services/privacy.service';
import type { AccountStatusGate } from '../lib/account-status';
import { closeLiveSocketsForUser } from './websocket';

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

// QC-F-042: DEFAULT_PRIVACY now lives in services/privacy.service.ts — the
// single definition shared by this settings view and every enforcement
// gate, so what the UI shows and what the backend applies cannot drift.

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
    // QC-F-042: enforcement gates cache prefs for 30s (PrivacyService);
    // a successful save invalidates this user's entry on the shared
    // instance so the new prefs apply immediately in this process.
    getPrivacyService(prisma).invalidate(userId);
    return reply.send({ success: true, data: toSettingsView(next) });
  });

  // POST /settings/blocked/:userId — add a user to the block list (QC-F-317).
  // Until this route existed the block list had NO writer on any surface:
  // the enforcement in PrivacyService (checkBlockedBy / checkCanMessage)
  // and calls-initiate always read an empty list, and the settings page's
  // "Blocked Users" screen could only ever show (0). The entry is built
  // from the target's real User row (never from client-supplied name /
  // username / blockedAt — a block entry is a safety record, so its
  // identity comes from the server), the write is idempotent, and a
  // malformed stored list fails closed (503, no write) instead of being
  // overwritten by a writer that treated it as empty.
  fastify.post<{ Params: { userId: string } }>(
    '/blocked/:userId',
    async (request, reply) => {
      const userId = getAuthUserId(request);
      const blockedId = request.params.userId;
      if (!blockedId) throw createAppError('Blocked user id is required', 400, 'BAD_REQUEST');
      if (blockedId === userId) {
        throw createAppError('You cannot block yourself', 400, 'BAD_REQUEST');
      }
      const prisma = getPrisma(fastify);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { preferences: true },
      });
      if (!user) throw createAppError('User not found', 404, 'USER_NOT_FOUND');

      const existingIds = extractBlockedUserIds(user.preferences);
      if (existingIds === null) {
        // The stored list is present but unreadable: refuse to write over
        // it (treating it as [] would silently erase real block records).
        throw createAppError('Blocked list unavailable', 503, 'BLOCKED_LIST_UNAVAILABLE');
      }

      const prefs =
        user.preferences && typeof user.preferences === 'object'
          ? { ...(user.preferences as Record<string, unknown>) }
          : {};
      const existing = readChatSettings(prefs);
      const blocked = Array.isArray(existing.blockedUsers) ? existing.blockedUsers : [];

      if (existingIds.includes(blockedId)) {
        // Already blocked (canonical object form or legacy bare string):
        // idempotent no-op — the first blockedAt stands, no duplicate.
        return reply.send({ success: true, data: { blockedUsers: blocked } });
      }

      const target = await prisma.user.findUnique({
        where: { id: blockedId },
        select: { id: true, displayName: true, username: true, deletedAt: true },
      });
      if (!target || target.deletedAt != null) {
        throw createAppError('User not found', 404, 'USER_NOT_FOUND');
      }

      const entry = {
        id: target.id,
        name: target.displayName?.trim() || target.username,
        username: target.username,
        blockedAt: new Date().toISOString(),
      };
      const nextBlocked = [...blocked, entry];
      prefs.chatSettings = { ...existing, blockedUsers: nextBlocked };
      await prisma.user.update({
        where: { id: userId },
        data: { preferences: prefs as Prisma.InputJsonValue },
      });
      return reply.send({ success: true, data: { blockedUsers: nextBlocked } });
    },
  );

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
      // QC-F-317 (R1): the reader (extractBlockedUserIds) also treats bare
      // string entries as blocked, so the filter must remove BOTH forms —
      // previously a legacy string entry survived every DELETE while the
      // handler still answered success, leaving the user blocked forever.
      const filtered = blocked.filter((entry) => {
        if (typeof entry === 'string') return entry !== blockedId;
        return !(
          entry &&
          typeof entry === 'object' &&
          (entry as { id?: unknown }).id === blockedId
        );
      });
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
  // Sessions/tokens issued before deletion are rejected on subsequent
  // requests by the QC-F-041 account-status gate: the server-core auth
  // plugin (REST) and the realtime verifier (WS) both consult the shared
  // resolver in lib/account-status.ts, which reads deletedAt/status from
  // the user row. This handler additionally (a) invalidates this process's
  // cached verdict for the user, so the deleter's own tokens die here
  // immediately instead of within the cache TTL, and (b) closes the
  // user's already-open WebSocket connections on this instance — the
  // connect-time gate cannot reach sockets opened before the delete.
  fastify.delete('/account', async (request, reply) => {
    const userId = getAuthUserId(request);
    const prisma = getPrisma(fastify);
    await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });
    const gate = (fastify as unknown as { accountStatusGate?: AccountStatusGate })
      .accountStatusGate;
    gate?.invalidate(userId);
    closeLiveSocketsForUser(userId, 'ACCOUNT_DELETED');
    return reply.send({ success: true, data: { deleted: true } });
  });
}
