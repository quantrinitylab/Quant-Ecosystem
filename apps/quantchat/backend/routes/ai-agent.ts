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
import {
  AutoReplyService,
  createMessageServiceDeliver,
  getAutoReplyService,
  type AutoReplyPrisma,
} from '../services/auto-reply.service';

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
export interface ScheduledMessagePrisma {
  conversationMember: {
    findFirst: (args: {
      where: { conversationId: string; userId: string; leftAt: null };
    }) => Promise<{ id: string } | null>;
  };
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
  /** Inject the whole auto-reply service (tests). */
  autoReplyService?: AutoReplyService;
}

const stateQuerySchema = z.object({
  conversationId: z.string().min(1),
});

export default async function aiAgentRoutes(
  fastify: FastifyInstance,
  opts: AIAgentRouteOptions = {},
) {
  // Construct an AIEngine; if no provider key is configured the agent transparently
  // falls back to deterministic templates (see QuantAIAgent.tryInfer).
  const agent = opts.agent ?? new QuantAIAgent(new AIEngine());

  // QC-F-067: auto-reply state is per-user + persisted (AutoReplyService).
  // Resolved lazily per request so the decorated prisma/manager are read at
  // call time, not at plugin registration time.
  const resolveAutoReplyService = (): AutoReplyService => {
    if (opts.autoReplyService) return opts.autoReplyService;
    if (opts.agent || opts.autoReplyManager) {
      const prisma = getPrisma(fastify) as unknown as AutoReplyPrisma;
      return new AutoReplyService(
        prisma,
        opts.autoReplyManager ??
          (fastify as unknown as { autoReplyManager?: AutoReplyManager }).autoReplyManager ??
          new AutoReplyManager(),
        agent,
        createMessageServiceDeliver(prisma),
      );
    }
    return getAutoReplyService(fastify);
  };

  // --- 12.1 Auto-reply ------------------------------------------------------
  fastify.post('/auto-reply', async (request, reply) => {
    const parsed = AutoReplyInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);

    // 12.9 + QC-F-067: do not generate when auto-reply is disabled FOR THIS
    // USER in this conversation (persisted gate — pre-fix a global
    // per-conversation Set let anyone generate once anyone had toggled on).
    // A disable during generation cancels delivery of the result.
    const outcome = await resolveAutoReplyService().generateFor(userId, parsed.data);
    return reply.send({ success: true, data: outcome });
  });

  // --- 12.9 Auto-reply enable/disable --------------------------------------
  fastify.post('/auto-reply/toggle', async (request, reply) => {
    const parsed = toggleSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const { conversationId, enabled } = parsed.data;

    // QC-F-067: membership-gated (403 NOT_A_MEMBER) and persisted per user;
    // disabling cancels only THIS user's queued unsent responses.
    const data = await resolveAutoReplyService().setEnabled(userId, conversationId, enabled);
    return reply.send({ success: true, data });
  });

  // --- QC-F-067: read back the caller's own auto-reply state ---------------
  fastify.get('/auto-reply/state', async (request, reply) => {
    const parsed = stateQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw createAppError('Invalid request query', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const service = resolveAutoReplyService();
    // Membership-gated like every other auto-reply surface: a non-member
    // learns nothing about the conversation (same 403, no oracle).
    await service.assertMember(userId, parsed.data.conversationId);
    const enabled = await service.getEnabled(userId, parsed.data.conversationId);
    return reply.send({
      success: true,
      data: { conversationId: parsed.data.conversationId, enabled },
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

    // QC-F-095: membership gate — the same check MessageService.sendMessage
    // applies on the real send path (message.service.ts). Without it, any
    // logged-in user could persist a scheduled message into ANY conversation
    // (including ones they were never a member of) and the delivery worker
    // would inject it as a real Message. A nonexistent conversation yields
    // the same 403 as a non-member (no existence oracle), exactly like
    // sendMessage. Order is pinned: zod 400 → auth 401 → membership 403 →
    // past-check 400.
    const membership = await prisma.conversationMember.findFirst({
      where: { conversationId: parsed.data.conversationId, userId, leftAt: null },
    });
    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    // The frontend's own scheduler rejects past times ("Scheduled time must
    // be in the future"); enforce the same rule server-side so already-due
    // rows are not created. No minimum delay and no horizon cap.
    const scheduledFor = new Date(parsed.data.scheduledFor);
    if (scheduledFor.getTime() <= Date.now()) {
      throw createAppError('scheduledFor must be in the future', 400, 'VALIDATION_ERROR');
    }

    const scheduled = await prisma.scheduledMessage.create({
      data: {
        userId,
        conversationId: parsed.data.conversationId,
        content: parsed.data.content,
        scheduledFor,
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
