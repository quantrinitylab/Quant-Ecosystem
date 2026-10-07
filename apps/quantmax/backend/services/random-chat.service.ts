import { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';

// ============================================================================
// QuantMax Random Chat (Omegle-style) matchmaking
// ============================================================================
//
// Pairs waiting users for an anonymous video/text session. Safety-first: a user
// who has opted OUT of random chat (SafetyService `allowRandomChat = false`) is
// never queued and is never handed out as a partner — the opt-out is enforced on
// BOTH sides at match time (a partner who disabled it after queueing is skipped).
//
// NOTE: the waiting queue is in-memory and therefore per-instance. The route
// registers a single shared service so it works within one node; a multi-region
// deployment would back this with Redis. Session records are durable.

export class RandomChatService {
  private prisma: PrismaClient;
  private waitingQueue: string[] = [];

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /** True unless the user explicitly opted out of random chat (default ON). */
  private async canRandomChat(userId: string): Promise<boolean> {
    const row = await this.prisma.userSafetySetting.findUnique({ where: { userId } });
    return row ? row.allowRandomChat !== false : true;
  }

  async findRandomPartner(userId: string): Promise<string | null> {
    // SAFETY GATE: a user who opted out cannot enter the random-chat pool.
    if (!(await this.canRandomChat(userId))) {
      throw createAppError(
        'Random chat is disabled in your safety settings',
        403,
        'RANDOM_CHAT_DISABLED',
      );
    }

    // Remove user from queue if already waiting (re-find is idempotent).
    this.waitingQueue = this.waitingQueue.filter((id) => id !== userId);

    // Hand out the first STILL-ELIGIBLE waiting partner; skip (and drop) anyone
    // who disabled random chat after queueing, and never self-match.
    while (this.waitingQueue.length > 0) {
      const candidate = this.waitingQueue.shift()!;
      if (candidate === userId) continue;
      if (await this.canRandomChat(candidate)) {
        return candidate;
      }
      // candidate opted out since queueing — drop them from the pool.
    }

    // No eligible partner waiting — enqueue and wait.
    this.waitingQueue.push(userId);
    return null;
  }

  async endChat(userId: string, partnerId: string) {
    // Record the ended random-chat session against the real VideoChatSession
    // table (Omegle-style sessions). Persisted so history/safety/abuse tooling
    // can inspect it — no in-memory-only record.
    await this.prisma.videoChatSession.create({
      data: {
        user1Id: userId,
        user2Id: partnerId,
        status: 'ENDED',
        endedAt: new Date(),
      },
    });
  }
}
