// ============================================================================
// QuantChat - AI Avatar Backend Routes
//
//   POST /avatar/generate  → deterministic SVG-based alien avatar generator
//                            (3 distinct variants seeded from the image hash),
//                            face-detection validation (Task 5.2, 5.3, 5.4)
//   POST /avatar/select    → persist the chosen variant to the Avatar model
//   GET  /avatar/:userId   → fetch a user's selected avatar (Task 5.5)
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  ALIEN_STYLES,
  NoFaceError,
  NO_FACE_ERROR_MESSAGE,
  buildReactionMap,
  decodeImagePayload,
  fromPrismaStyle,
  generateAvatars,
  toPrismaStyle,
  type AlienStyle,
} from '../lib/avatar-generator';

const generateSchema = z.object({
  image: z.string().min(1),
});

const selectSchema = z.object({
  style: z.enum(ALIEN_STYLES as unknown as [AlienStyle, ...AlienStyle[]]),
  imageUrl: z.string().min(1),
  thumbnailUrl: z.string().min(1),
});

interface AuthedRequest {
  auth?: { userId?: string };
  user?: { id?: string };
}

interface PrismaAvatarClient {
  avatar: {
    upsert: (args: unknown) => Promise<Record<string, unknown>>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
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

function getPrisma(fastify: FastifyInstance): PrismaAvatarClient {
  const prisma = (fastify as unknown as { prisma?: PrismaAvatarClient }).prisma;
  if (!prisma) {
    throw createAppError('Database unavailable', 503, 'DB_UNAVAILABLE');
  }
  return prisma;
}

function serializeAvatar(record: Record<string, unknown>) {
  return {
    userId: record['userId'],
    style: fromPrismaStyle(String(record['style'])),
    imageUrl: record['imageUrl'],
    thumbnailUrl: record['thumbnailUrl'],
    reactions: record['reactions'] ?? buildReactionMap(),
    updatedAt: record['updatedAt'],
  };
}

export default async function avatarRoutes(fastify: FastifyInstance) {
  // POST /avatar/generate — produce 3 deterministic alien variants
  fastify.post('/generate', async (request, reply) => {
    const parsed = generateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const buffer = decodeImagePayload(parsed.data.image);

    try {
      const result = generateAvatars(buffer);
      return reply.send({
        success: true,
        data: {
          variants: result.variants,
          faceDetectionConfidence: result.faceDetectionConfidence,
          processingTimeMs: result.processingTimeMs,
        },
      });
    } catch (error) {
      if (error instanceof NoFaceError) {
        // Task 5.3: no detectable face → clear, user-facing error message
        return reply.status(422).send({
          success: false,
          error: {
            code: 'NO_FACE_DETECTED',
            message: NO_FACE_ERROR_MESSAGE,
            statusCode: 422,
          },
          faceDetectionConfidence: error.confidence,
        });
      }
      throw error;
    }
  });

  // POST /avatar/select — persist chosen variant as the user's primary avatar
  fastify.post('/select', async (request, reply) => {
    const parsed = selectSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

    const reactions = buildReactionMap();
    const data = {
      style: toPrismaStyle(parsed.data.style),
      imageUrl: parsed.data.imageUrl,
      thumbnailUrl: parsed.data.thumbnailUrl,
      reactions,
    };

    const saved = await prisma.avatar.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return reply.status(201).send({ success: true, data: serializeAvatar(saved) });
  });

  // GET /avatar/:userId — fetch a user's selected avatar
  fastify.get<{ Params: { userId: string } }>('/:userId', async (request, reply) => {
    const { userId } = request.params;
    const prisma = getPrisma(fastify);

    const avatar = await prisma.avatar.findUnique({ where: { userId } });
    if (!avatar) {
      return reply.status(404).send({
        success: false,
        error: { code: 'AVATAR_NOT_FOUND', message: 'No avatar found for user', statusCode: 404 },
      });
    }

    return reply.send({ success: true, data: serializeAvatar(avatar) });
  });
}
