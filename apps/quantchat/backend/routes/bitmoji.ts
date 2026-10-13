// ============================================================================
// QuantChat - Bitmoji Editor Config Routes (QC-F-089)
//
//   GET  /bitmoji/me   → the caller's saved editor config (or config: null)
//   POST /bitmoji      → create the caller's config (upsert)
//   PUT  /bitmoji      → update the caller's config (upsert)
//
// The shipped /bitmoji page called GET /api/bitmoji/current and
// POST /api/bitmoji/save, and apiClient called GET /bitmoji/me,
// POST /bitmoji and PUT /bitmoji — but no backend route, Next proxy, or
// storage existed for any of them. Every load silently fell back to the
// default config and every Save failed. These routes are the real backend:
// the config persists verbatim in the BitmojiConfig model (migration 0092),
// keyed by the authenticated caller — a user can only ever read or write
// their own row. No config is ever invented: a caller who has never saved
// gets `config: null`, and the editor keeps its local defaults.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

// The editor's config shape (src/pages/bitmoji.tsx AvatarConfig). Every
// field is required — a partial body is a client bug, not a config to
// quietly merge server-side.
const nameField = z.string().min(1).max(64);
const colorField = z.string().min(1).max(32);

export const bitmojiConfigSchema = z.object({
  faceShape: nameField,
  skinTone: colorField,
  hairStyle: nameField,
  hairColor: colorField,
  eyeShape: nameField,
  eyeColor: colorField,
  noseShape: nameField,
  mouthShape: nameField,
  eyebrowShape: nameField,
  facialHair: nameField,
  outfit: nameField,
  outfitColor: colorField,
  accessories: z.array(z.string().min(1).max(64)).max(24),
  background: colorField,
});

const saveSchema = z.object({ config: bitmojiConfigSchema });

export type BitmojiConfigInput = z.infer<typeof bitmojiConfigSchema>;

interface AuthedRequest {
  auth?: { userId?: string };
  user?: { id?: string };
}

interface BitmojiRow {
  userId: string;
  config: unknown;
  updatedAt: unknown;
}

interface PrismaBitmojiClient {
  bitmojiConfig: {
    findUnique: (args: unknown) => Promise<BitmojiRow | null>;
    upsert: (args: unknown) => Promise<BitmojiRow>;
  };
}

function requireUserId(request: unknown): string {
  const r = request as AuthedRequest;
  const userId = r.auth?.userId ?? r.user?.id;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function getPrisma(fastify: FastifyInstance): PrismaBitmojiClient {
  const prisma = (fastify as unknown as { prisma?: PrismaBitmojiClient }).prisma;
  if (!prisma) {
    throw createAppError('Database unavailable', 503, 'DB_UNAVAILABLE');
  }
  return prisma;
}

function serializeRow(row: BitmojiRow | null) {
  if (!row) return { config: null, updatedAt: null };
  return { config: row.config, updatedAt: row.updatedAt };
}

export default async function bitmojiRoutes(fastify: FastifyInstance) {
  // GET /bitmoji/me — the caller's own saved config, or an honest null.
  fastify.get('/me', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const row = await prisma.bitmojiConfig.findUnique({ where: { userId } });
    return reply.send({ success: true, data: serializeRow(row) });
  });

  async function save(request: unknown) {
    const userId = requireUserId(request);
    const parsed = saveSchema.safeParse((request as { body: unknown }).body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    const prisma = getPrisma(fastify);
    const { config } = parsed.data;
    const saved = await prisma.bitmojiConfig.upsert({
      where: { userId },
      create: { userId, config },
      update: { config },
    });
    return serializeRow(saved);
  }

  // POST /bitmoji — first save (apiClient.createBitmoji / page save proxy).
  fastify.post('/', async (request, reply) => {
    const data = await save(request);
    return reply.status(201).send({ success: true, data });
  });

  // PUT /bitmoji — subsequent save (apiClient.updateBitmoji). Same upsert:
  // create-or-update is one operation, the verb only mirrors the client's
  // create/update split.
  fastify.put('/', async (request, reply) => {
    const data = await save(request);
    return reply.send({ success: true, data });
  });
}
