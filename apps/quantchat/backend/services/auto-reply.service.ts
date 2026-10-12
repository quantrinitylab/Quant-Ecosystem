// ============================================================================
// QuantChat - Auto-Reply Service (QC-F-067)
//
// The durable, per-user brain behind the thread's "Quant AI Auto-Reply"
// toggle. Pre-fix the toggle was theatre:
//   - enablement lived only in an in-memory Set keyed by conversationId
//     (NOT per user — one member's toggle armed/disarmed everyone, and a
//     restart silently wiped it),
//   - the toggle route had no membership check (any logged-in user could
//     flip any conversation's state),
//   - nothing ever triggered generation on an incoming message, and the
//     generate endpoint's text was never delivered as a message,
//   - the panel could not restore state (no read endpoint existed).
//
// This service fixes the root causes:
//   - Enablement is persisted per user in
//     `User.preferences.chatSettings.autoReply.conversationIds` (the same
//     JSON home as privacy prefs — QC-F-042 pattern, no migration), so it
//     survives restarts and is strictly per user.
//   - Every read/write is membership-gated (403 NOT_A_MEMBER, the exact
//     MessageService.sendMessage pattern — no existence oracle).
//   - `handleIncomingMessage` is the real trigger: after a message is
//     persisted, each OTHER active member who opted in gets a reply
//     generated in their style and delivered as a real Message authored
//     by them with `isAIGenerated: true` (via MessageService, so the
//     outbox/delivery pipeline fans it out like any other message).
//   - Loop safety: AI-generated incoming messages never trigger replies,
//     a member with a reply already in flight is skipped, and a disable
//     during generation cancels delivery (AutoReplyManager ticket).
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import { AutoReplyManager } from '../lib/auto-reply-manager';
import { QuantAIAgent, type AutoReplyInput, type AutoReplyResult } from '../lib/ai-agent';
import { MessageService } from './message.service';

// Structural Prisma surface (declared locally so this service typechecks
// independently of the generated client version — see routes/ai-agent.ts).
export interface AutoReplyPrisma {
  user: {
    findUnique: (args: {
      where: { id: string };
      select: { preferences: true };
    }) => Promise<{ preferences: unknown } | null>;
    findMany: (args: {
      where: { id: { in: string[] } };
      select: { id: true; preferences: true };
    }) => Promise<Array<{ id: string; preferences: unknown }>>;
    update: (args: {
      where: { id: string };
      data: { preferences: unknown };
    }) => Promise<unknown>;
  };
  conversationMember: {
    findFirst: (args: {
      where: { conversationId: string; userId: string; leftAt: null };
    }) => Promise<{ id: string } | null>;
    findMany: (args: {
      where: { conversationId: string; leftAt: null };
      select: { userId: true };
    }) => Promise<Array<{ userId: string }>>;
  };
  message: {
    findMany: (args: {
      where: { conversationId: string; isDeleted: false };
      orderBy: { createdAt: 'desc' };
      take: number;
      select: { id: true; senderId: true; content: true; isAIGenerated: true };
    }) => Promise<
      Array<{ id: string; senderId: string; content: string | null; isAIGenerated: boolean }>
    >;
  };
}

/** Delivery port: persist the generated reply as a real message. */
export type AutoReplyDeliver = (input: {
  conversationId: string;
  senderId: string;
  content: string;
}) => Promise<void>;

export interface AutoReplyAgent {
  autoReply: (input: AutoReplyInput, userId: string) => Promise<AutoReplyResult>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Conversation ids this user has auto-reply enabled for, from raw preferences. */
export function extractAutoReplyConversationIds(preferences: unknown): string[] {
  if (!isPlainObject(preferences)) return [];
  const chat = preferences['chatSettings'];
  if (!isPlainObject(chat)) return [];
  const autoReply = chat['autoReply'];
  if (!isPlainObject(autoReply)) return [];
  const ids = autoReply['conversationIds'];
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === 'string');
}

const CONTEXT_LIMIT = 20;

export class AutoReplyService {
  constructor(
    private readonly prisma: AutoReplyPrisma,
    private readonly manager: AutoReplyManager,
    private readonly agent: AutoReplyAgent,
    private readonly deliver: AutoReplyDeliver,
  ) {}

  /** 403 NOT_A_MEMBER unless the user is an active member (no existence oracle). */
  async assertMember(userId: string, conversationId: string): Promise<void> {
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId, leftAt: null },
    });
    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }
  }

  /** Persisted per-user enablement (source of truth — survives restarts). */
  async getEnabled(userId: string, conversationId: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    if (!row) return false;
    return extractAutoReplyConversationIds(row.preferences).includes(conversationId);
  }

  /** Which of the given users have auto-reply enabled for this conversation. */
  async getEnabledAmong(userIds: string[], conversationId: string): Promise<Set<string>> {
    const enabled = new Set<string>();
    if (userIds.length === 0) return enabled;
    const rows = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, preferences: true },
    });
    for (const row of rows) {
      if (extractAutoReplyConversationIds(row.preferences).includes(conversationId)) {
        enabled.add(row.id);
      }
    }
    return enabled;
  }

  /**
   * Toggle auto-reply for one user in one conversation. Membership-gated,
   * persisted first, then mirrored into the in-flight manager (disabling
   * cancels that user's queued unsent responses).
   */
  async setEnabled(
    userId: string,
    conversationId: string,
    enabled: boolean,
  ): Promise<{ conversationId: string; enabled: boolean; cancelledCount: number }> {
    await this.assertMember(userId, conversationId);

    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    if (!row) {
      throw createAppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const prefs: Record<string, unknown> = isPlainObject(row.preferences)
      ? { ...row.preferences }
      : {};
    const chat: Record<string, unknown> = isPlainObject(prefs['chatSettings'])
      ? { ...(prefs['chatSettings'] as Record<string, unknown>) }
      : {};
    const current = extractAutoReplyConversationIds(row.preferences);
    const next = enabled
      ? [...new Set([...current, conversationId])]
      : current.filter((id) => id !== conversationId);
    chat['autoReply'] = { conversationIds: next };
    prefs['chatSettings'] = chat;
    await this.prisma.user.update({
      where: { id: userId },
      data: { preferences: prefs },
    });

    let cancelledCount = 0;
    if (enabled) {
      this.manager.enable(userId, conversationId);
    } else {
      cancelledCount = this.manager.disable(userId, conversationId);
    }
    return { conversationId, enabled, cancelledCount };
  }

  /**
   * Generate a reply on demand (POST /ai/auto-reply). Gated on the CALLER's
   * own persisted enablement for the conversation — pre-fix this consulted
   * the global per-conversation Set, so anyone could generate once any
   * member had toggled on. Ticket semantics preserved per user.
   */
  async generateFor(
    userId: string,
    input: AutoReplyInput,
  ): Promise<(AutoReplyResult & { generated: true }) | { generated: false; cancelled: true; reason: string }> {
    const { conversationId } = input;
    if (!(await this.getEnabled(userId, conversationId))) {
      return { generated: false, cancelled: true, reason: 'auto-reply disabled' };
    }
    const ticket = this.manager.enqueue(userId, conversationId);
    const result = await this.agent.autoReply(input, userId);
    if (!this.manager.markSent(ticket.ticketId)) {
      return { generated: false, cancelled: true, reason: 'cancelled during generation' };
    }
    return { ...result, generated: true };
  }

  /**
   * THE trigger (QC-F-067a): a real message just landed in a conversation.
   * For every OTHER active member who personally opted in, generate a
   * reply in their style and deliver it as their own AI-flagged message.
   * Best-effort by contract: a failure for one member never blocks others
   * and never propagates to the sender's request. Returns how many
   * replies were delivered.
   */
  async handleIncomingMessage(args: {
    conversationId: string;
    senderId: string;
    messageId: string;
    content: string;
    isAIGenerated: boolean;
  }): Promise<number> {
    // Loop prevention: never auto-reply to an AI-generated message.
    if (args.isAIGenerated) return 0;

    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: args.conversationId, leftAt: null },
      select: { userId: true },
    });
    const recipientIds = members
      .map((m) => m.userId)
      .filter((userId) => userId !== args.senderId);
    if (recipientIds.length === 0) return 0;

    const enabled = await this.getEnabledAmong(recipientIds, args.conversationId);
    if (enabled.size === 0) return 0;

    let delivered = 0;
    for (const recipientId of recipientIds) {
      if (!enabled.has(recipientId)) continue;
      try {
        if (await this.deliverReplyFor(recipientId, args)) delivered++;
      } catch {
        // One member's generation/delivery failure must not affect others
        // or the original send. The reply is simply skipped.
      }
    }
    return delivered;
  }

  private async deliverReplyFor(
    recipientId: string,
    args: { conversationId: string; messageId: string; content: string },
  ): Promise<boolean> {
    // Reply-storm guard: one in-flight reply per user+conversation.
    if (this.manager.pendingFor(recipientId, args.conversationId).length > 0) return false;

    const context = await this.buildContext(recipientId, args.conversationId, args.messageId);
    const ticket = this.manager.enqueue(recipientId, args.conversationId);
    const result = await this.agent.autoReply(
      { conversationId: args.conversationId, incomingMessage: args.content, context },
      recipientId,
    );

    // Disabled while generating → the queued response is cancelled; drop it.
    if (!this.manager.markSent(ticket.ticketId)) return false;
    // The persisted gate is re-checked too: a disable in another process
    // (whose manager mirror is separate) must also stop delivery.
    if (!(await this.getEnabled(recipientId, args.conversationId))) return false;

    await this.deliver({
      conversationId: args.conversationId,
      senderId: recipientId,
      content: result.content,
    });
    return true;
  }

  private async buildContext(
    recipientId: string,
    conversationId: string,
    excludeMessageId: string,
  ): Promise<Array<{ sender: string; content: string; isSelf?: boolean }>> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: CONTEXT_LIMIT,
      select: { id: true, senderId: true, content: true, isAIGenerated: true },
    });
    return rows
      .filter((row) => row.id !== excludeMessageId && !row.isAIGenerated && row.content)
      .reverse()
      .map((row) => ({
        sender: row.senderId === recipientId ? 'me' : row.senderId,
        content: row.content as string,
        isSelf: row.senderId === recipientId,
      }));
  }
}

// ---------------------------------------------------------------------------
// App wiring: one shared service per Fastify instance, built lazily from the
// decorated prisma + AutoReplyManager (same decoration pattern the routes
// already use). Delivery goes through MessageService with isAIGenerated so
// the reply persists + fans out through the normal outbox pipeline.
// ---------------------------------------------------------------------------

interface AutoReplyDecorations {
  prisma?: unknown;
  autoReplyManager?: AutoReplyManager;
  autoReplyService?: AutoReplyService;
}

export function createMessageServiceDeliver(prisma: unknown): AutoReplyDeliver {
  return async ({ conversationId, senderId, content }) => {
    const messages = new MessageService(prisma as never);
    await messages.sendMessage({
      conversationId,
      senderId,
      content,
      type: 'text',
      isAIGenerated: true,
    });
  };
}

export function getAutoReplyService(fastify: FastifyInstance): AutoReplyService {
  const decorated = fastify as unknown as AutoReplyDecorations;
  if (decorated.autoReplyService) return decorated.autoReplyService;
  if (!decorated.prisma) {
    throw createAppError('Database unavailable', 503, 'DB_UNAVAILABLE');
  }
  const manager = decorated.autoReplyManager ?? new AutoReplyManager();
  const service = new AutoReplyService(
    decorated.prisma as AutoReplyPrisma,
    manager,
    new QuantAIAgent(new AIEngine()),
    createMessageServiceDeliver(decorated.prisma),
  );
  decorated.autoReplyService = service;
  return service;
}

/**
 * Fire-and-forget trigger for the REST send path (same post-send fan-out
 * slot as publishConversationEvent in routes/messages.ts). Auto-reply
 * latency must never delay or fail the sender's 201.
 */
export function triggerAutoReplies(
  fastify: FastifyInstance,
  args: {
    conversationId: string;
    senderId: string;
    messageId: string;
    content: string;
    isAIGenerated: boolean;
  },
): void {
  void (async () => {
    try {
      await getAutoReplyService(fastify).handleIncomingMessage(args);
    } catch (err) {
      fastify.log.error({ err }, 'auto-reply trigger failed');
    }
  })();
}
