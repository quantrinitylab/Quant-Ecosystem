import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { z } from 'zod';
import {
  DISPLAY_AI_INTENTS,
  DISPLAY_DENSITIES,
  DISPLAY_THEMES,
  readUserDisplaySettings,
  writeUserDisplaySettings,
  type DisplaySettings,
} from '../services/display-settings.service';

// ---------------------------------------------------------------------------
// Display settings that roam with the account (queue 2026-10-12 P2
// [settings]): theme, row density and the Assistant intent. They lived in
// `localStorage` only, so a choice made on the phone never reached the
// desktop. They now live in `User.preferences` JSON — the same pattern as
// the mail notification mode — and the frontend keeps `localStorage` as its
// boot cache / offline fallback, reconciled by the `updatedAt` stamp.
//
// GET /settings/display — the caller's triple, with `stored` flags saying
// which fields the server actually holds (the rest are defaults) and the
// `updatedAt` stamp of the last write, or null when nothing is stored yet.
// PUT /settings/display — change any subset of the triple. At least one
// field is required; unknown fields are stripped by zod, never stored.
// ---------------------------------------------------------------------------

const displaySettingsBodySchema = z
  .object({
    theme: z.enum(DISPLAY_THEMES).optional(),
    density: z.enum(DISPLAY_DENSITIES).optional(),
    aiIntent: z.enum(DISPLAY_AI_INTENTS).optional(),
  })
  .refine(
    (value) =>
      value.theme !== undefined || value.density !== undefined || value.aiIntent !== undefined,
    'At least one display setting is required',
  );

function userIdFrom(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

export default async function displaySettingsRoutes(fastify: FastifyInstance) {
  // Same `any` escape hatch as `routes/notifications.ts`: the generated
  // Prisma client's `User` type here does not carry `preferences`, and the
  // service's structural store interface is the real contract (proven by
  // its tests with a fake store).
  const prisma = (fastify as unknown as { prisma: any }).prisma;

  fastify.get('/settings/display', async (request, reply) => {
    const userId = userIdFrom(request);
    const read = await readUserDisplaySettings(prisma, userId, {
      warn: (obj, msg) => fastify.log.warn(obj as object, msg),
    });
    return reply.send({
      success: true,
      data: { ...read.settings, stored: read.stored, updatedAt: read.updatedAt },
    });
  });

  fastify.put('/settings/display', async (request, reply) => {
    const userId = userIdFrom(request);
    const parsed = displaySettingsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid display settings', 400, 'VALIDATION_ERROR');
    }
    const partial: Partial<DisplaySettings> = {};
    if (parsed.data.theme !== undefined) partial.theme = parsed.data.theme;
    if (parsed.data.density !== undefined) partial.density = parsed.data.density;
    if (parsed.data.aiIntent !== undefined) partial.aiIntent = parsed.data.aiIntent;
    const read = await writeUserDisplaySettings(prisma, userId, partial);
    return reply.send({
      success: true,
      data: { ...read.settings, stored: read.stored, updatedAt: read.updatedAt },
    });
  });
}
