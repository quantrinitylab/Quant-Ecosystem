// ============================================================================
// QuantChat - Quant AI Agent Routes (Task 12, Requirement 11)
//
//   POST /ai/auto-reply          → contextual auto-reply (style-mirrored)  12.1
//   POST /ai/auto-reply/toggle   → enable/disable + cancel queued replies  12.9
//   POST /ai/summarize           → conversation summary (≤50 messages)     12.2
//   POST /ai/suggestions         → ≤3 contextual reply suggestions         12.3
//   POST /ai/schedule            → persist a ScheduledMessage              12.4
//   POST /ai/prioritize-notifications → high-priority + daily digest       12.5
//   POST /ai/translate           → auto-detect source, translate           12.6
//   POST /ai/generate-content    → caption/story-text/reel descriptions    12.7
//
// All AI output carries `isAIGenerated: true` (Task 12.8 / Property 33).
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import {
  AutoReplyInputSchema,
  SummarizeInputSchema,
  SuggestionsInputSchema,
  TranslateInputSchema,
  GenerateContentInputSchema,
  PrioritizeInputSchema,
  QuantAIAgent,
  prioritizeNotifications,
} from '../lib/ai-agent';
import { AutoReplyManager } from '../lib/auto-reply-manager';

const toggleSchema = z.object({
  conversationId: z.string().min(1),
  enabled: z.boolean(),
});

const scheduleSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1).max(10000),
  scheduledFor: z.string().datetime(),
});

interface AuthedRequest {
  auth?: { userId?: string };
  user?: { id?: string };
}

function requireUserId(request: unknown): string {
  const r = request as AuthedRequest;
  const userId = r.auth?.userId ?? r.user?.id;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

// Structural Prisma surface (declared locally so this route typechecks
// independently of the generated client version — see routes/avatar.ts).
interface ScheduledMessagePrisma {
  scheduledMessage: {
    create: (args: {
      data: {
        userId: string;
        conversationId: string;
        content: string;
        scheduledFor: Date;
        status: 'PENDING';
      };
    }) => Promise<{
      id: string;
      conversationId: string;
      scheduledFor: Date;
      status: string;
    }>;
  };
}

function getPrisma(fastify: FastifyInstance): ScheduledMessagePrisma {
  const prisma = (fastify as unknown as { prisma?: ScheduledMessagePrisma }).prisma;
  if (!prisma) {
    throw createAppError('Database unavailable', 503, 'DB_UNAVAILABLE');
  }
  return prisma;
}

export interface AIAgentRouteOptions {
  /** Shared auto-reply manager (decorated at boot). A local one is used if omitted. */
  autoReplyManager?: AutoReplyManager;
  /** Inject an AIEngine (tests). Falls back to a new engine, then templates. */
  agent?: QuantAIAgent;
}

export default async function aiAgentRoutes(
  fastify: FastifyInstance,
  opts: AIAgentRouteOptions = {},
) {
  const manager =
    opts.autoReplyManager ??
    (fastify as unknown as { autoReplyManager?: AutoReplyManager }).autoReplyManager ??
    new AutoReplyManager();

  // Construct an AIEngine; if no provider key is configured the agent transparently
  // falls back to deterministic templates (see QuantAIAgent.tryInfer).
  const agent = opts.agent ?? new QuantAIAgent(new AIEngine());

  // --- 12.1 Auto-reply ------------------------------------------------------
  fastify.post('/auto-reply', async (request, reply) => {
    const parsed = AutoReplyInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const { conversationId } = parsed.data;

    // 12.9: do not generate when auto-reply is disabled for this conversation.
    if (!manager.isEnabled(conversationId)) {
      return reply.send({
        success: true,
        data: { generated: false, cancelled: true, reason: 'auto-reply disabled' },
      });
    }

    const ticket = manager.enqueue(conversationId);
    const result = await agent.autoReply(parsed.data, userId);

    // 12.9: if auto-reply was disabled while we were generating, drop the response.
    if (!manager.markSent(ticket.ticketId)) {
      return reply.send({
        success: true,
        data: { generated: false, cancelled: true, reason: 'cancelled during generation' },
      });
    }

    return reply.send({ success: true, data: { ...result, generated: true } });
  });

  // --- 12.9 Auto-reply enable/disable --------------------------------------
  fastify.post('/auto-reply/toggle', async (request, reply) => {
    const parsed = toggleSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    requireUserId(request);
    const { conversationId, enabled } = parsed.data;

    let cancelledCount = 0;
    if (enabled) {
      manager.enable(conversationId);
    } else {
      cancelledCount = manager.disable(conversationId);
    }

    return reply.send({
      success: true,
      data: { conversationId, enabled, cancelledCount },
    });
  });

  // --- 12.2 Summarize -------------------------------------------------------
  fastify.post('/summarize', async (request, reply) => {
    const parsed = SummarizeInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const result = await agent.summarize(parsed.data, userId);
    return reply.send({ success: true, data: result });
  });

  // --- 12.3 Reply suggestions (always ≤ 3) ---------------------------------
  fastify.post('/suggestions', async (request, reply) => {
    const parsed = SuggestionsInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const result = await agent.suggestions(parsed.data, userId);
    return reply.send({ success: true, data: result });
  });

  // --- 12.4 Schedule a message ---------------------------------------------
  fastify.post('/schedule', async (request, reply) => {
    const parsed = scheduleSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

    const scheduled = await prisma.scheduledMessage.create({
      data: {
        userId,
        conversationId: parsed.data.conversationId,
        content: parsed.data.content,
        scheduledFor: new Date(parsed.data.scheduledFor),
        status: 'PENDING',
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: scheduled.id,
        conversationId: scheduled.conversationId,
        scheduledFor: scheduled.scheduledFor,
        status: scheduled.status,
      },
    });
  });

  // --- 12.5 Prioritize notifications ---------------------------------------
  fastify.post('/prioritize-notifications', async (request, reply) => {
    const parsed = PrioritizeInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    requireUserId(request);
    const result = prioritizeNotifications(parsed.data);
    return reply.send({ success: true, data: result });
  });

  // --- 12.6 Translate -------------------------------------------------------
  fastify.post('/translate', async (request, reply) => {
    const parsed = TranslateInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const result = await agent.translate(parsed.data, userId);
    return reply.send({ success: true, data: result });
  });

  // --- 12.7 Generate content ------------------------------------------------
  fastify.post('/generate-content', async (request, reply) => {
    const parsed = GenerateContentInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const result = await agent.generateContent(parsed.data, userId);
    return reply.send({ success: true, data: result });
  });
}

export { AutoReplyManager };
