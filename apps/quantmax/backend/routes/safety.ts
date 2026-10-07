import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  SafetyService,
  REPORT_TARGET_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
} from '../services/safety.service';

// ============================================================================
// QuantMax safety routes (mounted at /safety).
//
//   POST  /safety/report        { targetType, targetId, reason, details? }
//   GET   /safety/settings
//   PUT   /safety/settings       { hideSensitiveContent?, allowRandomChat?,
//                                  blockUnknownMessages?, filteredKeywords? }
//   GET   /safety/reports        ?status=&page=&pageSize=   (moderation queue)
//   PATCH /safety/reports/:id    { status }                 (lifecycle update)
//
// All authenticated (the global auth hook rejects anonymous callers).
//
// NOTE: /safety/reports (list) and PATCH /safety/reports/:id are
// moderator/admin-facing surfaces. QuantMax has no role system today, so they
// are auth-gated only; adding role/permission gating is a follow-up once roles
// exist.
// ============================================================================

const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().min(1),
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(5000).optional(),
});

const listReportsSchema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const updateReportSchema = z
  .object({
    status: z.enum(REPORT_STATUSES),
  })
  .strict();

const settingsSchema = z
  .object({
    hideSensitiveContent: z.boolean().optional(),
    allowRandomChat: z.boolean().optional(),
    blockUnknownMessages: z.boolean().optional(),
    filteredKeywords: z.array(z.string().max(100)).max(100).optional(),
  })
  .strict();

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function buildService(fastify: FastifyInstance): SafetyService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new SafetyService(prisma as never);
}

export default async function safetyRoutes(fastify: FastifyInstance) {
  fastify.post('/report', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = reportSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const report = await buildService(fastify).reportContent(userId, parsed.data);
    return reply.status(201).send({ success: true, data: report });
  });

  fastify.get('/settings', async (request, reply) => {
    const userId = requireUserId(request);
    const settings = await buildService(fastify).getSettings(userId);
    return reply.send({ success: true, data: settings });
  });

  fastify.put('/settings', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const settings = await buildService(fastify).updateSettings(userId, parsed.data);
    return reply.send({ success: true, data: settings });
  });

  // --- Moderation queue (moderator/admin-facing; auth-gated only for now) ---

  fastify.get('/reports', async (request, reply) => {
    requireUserId(request);
    const parsed = listReportsSchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }
    const result = await buildService(fastify).listReports(parsed.data);
    return reply.send({ success: true, data: result });
  });

  fastify.patch('/reports/:id', async (request, reply) => {
    requireUserId(request);
    const { id } = request.params as { id: string };
    const parsed = updateReportSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const report = await buildService(fastify).updateReportStatus(id, parsed.data.status);
    return reply.send({ success: true, data: report });
  });
}
